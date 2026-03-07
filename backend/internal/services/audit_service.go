package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// LLMClient defines the interface for LLM API calls
type LLMClient interface {
	Chat(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error)
}

// AuditService handles AI-powered audit report generation
type AuditService struct {
	db           *sql.DB
	llmClient    LLMClient
	searchClient LLMClient // OpenAI client for live pricing — nil means fall back to training data
	scopeService *ScopeSheetService
}

// NewAuditService creates a new AuditService instance
func NewAuditService(db *sql.DB, llmClient LLMClient, searchClient LLMClient, scopeService *ScopeSheetService) *AuditService {
	return &AuditService{
		db:           db,
		llmClient:    llmClient,
		searchClient: searchClient,
		scopeService: scopeService,
	}
}

// GenerateIndustryEstimate generates an industry-standard estimate using AI based on the scope sheet
func (s *AuditService) GenerateIndustryEstimate(ctx context.Context, claimID, userID, orgID string) (string, error) {
	// 1. Get the scope sheet for this claim
	scopeSheet, err := s.scopeService.GetScopeSheetByClaimID(ctx, claimID)
	if err != nil {
		return "", fmt.Errorf("failed to get scope sheet: %w", err)
	}
	if scopeSheet == nil {
		return "", fmt.Errorf("scope sheet not found for claim %s", claimID)
	}

	// 2. Collect all unique damage tags across areas for the pricing query
	var allTags []string
	seen := map[string]bool{}
	for _, area := range scopeSheet.Areas {
		for _, tag := range area.Tags {
			if !seen[tag] {
				allTags = append(allTags, tag)
				seen[tag] = true
			}
		}
	}

	// 3. Fetch property address for regional pricing query (non-fatal if missing)
	var propertyAddress string
	_ = s.db.QueryRowContext(ctx, `
		SELECT p.legal_address
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		WHERE c.id = $1
	`, claimID).Scan(&propertyAddress)

	// 4. Fetch live pricing via OpenAI web search — required, no fallback
	pricingContext, err := s.fetchLivePricing(ctx, allTags, propertyAddress)
	if err != nil {
		return "", fmt.Errorf("failed to fetch live regional pricing: %w", err)
	}

	// 5. Build the prompt from the scope sheet
	userPrompt := s.buildEstimatePrompt(scopeSheet, pricingContext)

	// 6. Prepare messages for the LLM
	messages := []llm.Message{
		{
			Role:    "system",
			Content: `You are an expert Public Adjuster and Master Xactimate Estimator. Your goal is to maximize the justifiable Replacement Cost Value (RCV) for the policyholder based on the provided scope of work. Do not blindly inflate prices, but you MUST include all necessary line items, code upgrades, and standard industry waste factors that an insurance carrier owes for. Always respond with valid JSON only, no additional text or explanations.`,
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}

	// 7. Call the LLM API — use high token limit since estimate JSON can be large
	response, err := s.llmClient.Chat(ctx, messages, 0.2, 8000)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}

	// 8. Extract and validate the response
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	estimateJSON := extractJSON(response.Choices[0].Message.Content)

	// Validate that it's valid JSON
	var validationCheck map[string]interface{}
	if err := json.Unmarshal([]byte(estimateJSON), &validationCheck); err != nil {
		return "", fmt.Errorf("the AI returned a malformed estimate — please try again: %w", err)
	}

	// 9. Create audit report record
	reportID, err := s.saveAuditReport(ctx, claimID, scopeSheet.ID, userID, estimateJSON)
	if err != nil {
		return "", fmt.Errorf("failed to save audit report: %w", err)
	}

	// 10. Log API usage
	err = s.logAPIUsage(ctx, orgID, response)
	if err != nil {
		log.Printf("Warning: failed to log API usage: %v", err)
	}

	return reportID, nil
}

// fetchLivePricing queries OpenAI with web search for current regional repair pricing.
// Returns a hard error on any failure — callers must not proceed without live pricing data.
func (s *AuditService) fetchLivePricing(ctx context.Context, damageTags []string, propertyAddress string) (string, error) {
	if s.searchClient == nil {
		return "", fmt.Errorf("live pricing search is unavailable: OPENAI_API_KEY is not configured")
	}

	city, state := parseAddressLocation(propertyAddress)

	query := fmt.Sprintf(
		"What are current %d contractor repair prices in %s, %s for the following damage types: %s? "+
			"Provide cost per square foot or linear foot for materials and labor separately. "+
			"Include Xactimate-standard line items where possible. Cite local sources if available.",
		time.Now().Year(),
		city, state,
		strings.Join(damageTags, ", "),
	)

	messages := []llm.Message{{Role: "user", Content: query}}

	type searchableClient interface {
		SearchChat(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int, city, state string) (*llm.ChatResponse, error)
	}

	var (
		resp *llm.ChatResponse
		err  error
	)
	if sc, ok := s.searchClient.(searchableClient); ok {
		resp, err = sc.SearchChat(ctx, messages, 1.0, 800, city, state)
	} else {
		resp, err = s.searchClient.Chat(ctx, messages, 1.0, 800)
	}

	if err != nil {
		return "", fmt.Errorf("OpenAI pricing search failed: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("OpenAI pricing search returned an empty response")
	}

	return resp.Choices[0].Message.Content, nil
}

// parseAddressLocation extracts city and state from a US address string.
// Handles common formats like "123 Street, City, TX 79927" or "City, TX".
func parseAddressLocation(address string) (city, state string) {
	parts := strings.Split(address, ",")
	n := len(parts)
	if n < 2 {
		return "", address // return raw address as city fallback
	}
	// Last segment: "TX 79927" or "TX"
	lastPart := strings.TrimSpace(parts[n-1])
	fields := strings.Fields(lastPart)
	if len(fields) == 0 {
		return "", ""
	}
	candidate := fields[0]
	// Only accept 2-letter uppercase state abbreviations
	if len(candidate) == 2 && candidate == strings.ToUpper(candidate) {
		state = candidate
		city = strings.TrimSpace(parts[n-2])
		return city, state
	}
	return "", ""
}

// buildEstimatePrompt creates a structured prompt from the JSONB scope sheet areas
func (s *AuditService) buildEstimatePrompt(scope *models.ScopeSheet, pricingContext string) string {
	var builder strings.Builder

	builder.WriteString("LIVE PRICING DATA (current web search results — use these prices as your baseline):\n")
	builder.WriteString(pricingContext)
	builder.WriteString("\n\n")

	builder.WriteString("SCOPE SHEET DATA:\n")

	for _, area := range scope.Areas {
		builder.WriteString(fmt.Sprintf("- Area: %s\n", area.Category))

		if len(area.Tags) > 0 {
			builder.WriteString(fmt.Sprintf("  Damage tags: %s\n", strings.Join(area.Tags, ", ")))
		}

		if sqft, ok := area.Dimensions["square_footage"]; ok && sqft > 0 {
			builder.WriteString(fmt.Sprintf("  Square footage: %.0f sq ft\n", sqft))
		}
		if l, okL := area.Dimensions["length"]; okL {
			if w, okW := area.Dimensions["width"]; okW {
				builder.WriteString(fmt.Sprintf("  Dimensions: %.0f x %.0f ft\n", l, w))
			}
		}

		if area.Notes != "" {
			builder.WriteString(fmt.Sprintf("  Notes: %s\n", area.Notes))
		}

		builder.WriteString(fmt.Sprintf("  Photos: %d image(s) attached\n", len(area.PhotoIDs)))
	}

	if scope.GeneralNotes != nil && *scope.GeneralNotes != "" {
		builder.WriteString(fmt.Sprintf("\nGENERAL NOTES: %s\n", *scope.GeneralNotes))
	}

	builder.WriteString("\nESTIMATING RULES - APPLY STRICTLY:\n")
	builder.WriteString("1. Xactimate Format: Output all line items using standard Xactimate Category and Selector codes (e.g., RFG 300S for laminated shingles, RFG STEEP for steep charges, DMO DUMP for dumpsters).\n")
	builder.WriteString("2. Pricing: Use the LIVE PRICING DATA provided above as your baseline for all unit costs.\n")
	builder.WriteString("3. Required Add-ons (Do not miss these if the scope implies a replacement):\n")
	builder.WriteString("   - Always include a 15% waste factor for architectural shingles (or 10% for 3-tab) calculated on top of the raw square footage.\n")
	builder.WriteString("   - Always add \"Steep\" (RFG STEEP) and \"High\" (RFG HIGH) labor charges if the roof notes imply 2+ stories or >6/12 pitch.\n")
	builder.WriteString("   - Always include Starter Shingles, Ridge Cap, Ice & Water Shield, and Drip Edge for full roof replacements.\n")
	builder.WriteString("   - Always include setup, tear-off (e.g., RFG DMO), and debris removal/dumpster fees.\n")
	builder.WriteString("4. O&P: Overhead & Profit must be calculated at exactly 20% (10% Overhead, 10% Profit) of the subtotal.\n")
	builder.WriteString("\nRESPONSE FORMAT:\n")
	builder.WriteString("Return ONLY a JSON object with this exact structure:\n")
	builder.WriteString("{\n")
	builder.WriteString("  \"line_items\": [\n")
	builder.WriteString("    {\n")
	builder.WriteString("      \"xactimate_code\": \"Category & Selector (e.g., RFG 300S)\",\n")
	builder.WriteString("      \"description\": \"Item description\",\n")
	builder.WriteString("      \"quantity\": <number>,\n")
	builder.WriteString("      \"unit\": \"unit type (e.g., SQ, LF, EA, MO)\",\n")
	builder.WriteString("      \"unit_cost\": <number>,\n")
	builder.WriteString("      \"total\": <number>,\n")
	builder.WriteString("      \"category\": \"category name (e.g., Roofing, Debris Removal)\",\n")
	builder.WriteString("      \"justification\": \"<1-sentence explanation of why this item is justifiable>\"\n")
	builder.WriteString("    }\n")
	builder.WriteString("  ],\n")
	builder.WriteString("  \"subtotal\": <number>,\n")
	builder.WriteString("  \"overhead_profit\": <number>,\n")
	builder.WriteString("  \"total\": <number>\n")
	builder.WriteString("}\n")

	return builder.String()
}

// saveAuditReport creates and saves an audit report record to the database
func (s *AuditService) saveAuditReport(ctx context.Context, claimID, scopeSheetID, userID, estimateJSON string) (string, error) {
	reportID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO audit_reports (
			id, claim_id, scope_sheet_id, generated_estimate,
			status, created_by_user_id, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`

	var returnedID string
	err := s.db.QueryRowContext(
		ctx,
		query,
		reportID,
		claimID,
		scopeSheetID,
		estimateJSON,
		models.AuditStatusCompleted,
		userID,
		now,
		now,
	).Scan(&returnedID)

	if err != nil {
		return "", fmt.Errorf("failed to insert audit report: %w", err)
	}

	return returnedID, nil
}

// GetAuditReportByClaimID retrieves the audit report for a claim with ownership verification
func (s *AuditService) GetAuditReportByClaimID(ctx context.Context, claimID, orgID string) (*models.AuditReport, error) {
	query := `
		SELECT ar.id, ar.claim_id, ar.scope_sheet_id, ar.carrier_estimate_id,
		       ar.generated_estimate, ar.comparison_data, ar.total_contractor_estimate,
		       ar.total_carrier_estimate, ar.total_delta, ar.status, ar.error_message,
		       ar.created_by_user_id, ar.created_at, ar.updated_at, ar.viability_analysis,
		       ar.pm_brain_analysis, ar.dispute_letter, ar.owner_pitch
		FROM audit_reports ar
		INNER JOIN claims c ON ar.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE ar.claim_id = $1 AND p.organization_id = $2
		ORDER BY ar.created_at DESC
		LIMIT 1
	`

	var report models.AuditReport
	err := s.db.QueryRowContext(ctx, query, claimID, orgID).Scan(
		&report.ID,
		&report.ClaimID,
		&report.ScopeSheetID,
		&report.CarrierEstimateID,
		&report.GeneratedEstimate,
		&report.ComparisonData,
		&report.TotalContractorEstimate,
		&report.TotalCarrierEstimate,
		&report.TotalDelta,
		&report.Status,
		&report.ErrorMessage,
		&report.CreatedByUserID,
		&report.CreatedAt,
		&report.UpdatedAt,
		&report.ViabilityAnalysis,
		&report.PMBrainAnalysis,
		&report.DisputeLetter,
		&report.OwnerPitch,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("audit report not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get audit report: %w", err)
	}

	return &report, nil
}

// getAuditReportWithOwnershipCheck gets an audit report and verifies ownership
func (s *AuditService) getAuditReportWithOwnershipCheck(ctx context.Context, auditReportID, orgID string) (*models.AuditReport, error) {
	query := `
		SELECT ar.id, ar.claim_id, ar.scope_sheet_id, ar.carrier_estimate_id,
		       ar.generated_estimate, ar.comparison_data, ar.total_contractor_estimate,
		       ar.total_carrier_estimate, ar.total_delta, ar.status, ar.error_message,
		       ar.created_by_user_id, ar.created_at, ar.updated_at, ar.viability_analysis,
		       ar.pm_brain_analysis, ar.dispute_letter, ar.owner_pitch
		FROM audit_reports ar
		INNER JOIN claims c ON ar.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE ar.id = $1 AND p.organization_id = $2
	`

	var report models.AuditReport
	err := s.db.QueryRowContext(ctx, query, auditReportID, orgID).Scan(
		&report.ID,
		&report.ClaimID,
		&report.ScopeSheetID,
		&report.CarrierEstimateID,
		&report.GeneratedEstimate,
		&report.ComparisonData,
		&report.TotalContractorEstimate,
		&report.TotalCarrierEstimate,
		&report.TotalDelta,
		&report.Status,
		&report.ErrorMessage,
		&report.CreatedByUserID,
		&report.CreatedAt,
		&report.UpdatedAt,
		&report.ViabilityAnalysis,
		&report.PMBrainAnalysis,
		&report.DisputeLetter,
		&report.OwnerPitch,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("audit report not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get audit report: %w", err)
	}

	return &report, nil
}

// getCarrierEstimate retrieves the carrier estimate for a claim
func (s *AuditService) getCarrierEstimate(ctx context.Context, claimID string) (*models.CarrierEstimate, error) {
	query := `
		SELECT id, claim_id, uploaded_by_user_id, file_path, file_name,
		       file_size_bytes, parsed_data, parse_status, parse_error,
		       uploaded_at, parsed_at
		FROM carrier_estimates
		WHERE claim_id = $1
		ORDER BY uploaded_at DESC
		LIMIT 1
	`

	var estimate models.CarrierEstimate
	err := s.db.QueryRowContext(ctx, query, claimID).Scan(
		&estimate.ID,
		&estimate.ClaimID,
		&estimate.UploadedByUserID,
		&estimate.FilePath,
		&estimate.FileName,
		&estimate.FileSizeBytes,
		&estimate.ParsedData,
		&estimate.ParseStatus,
		&estimate.ParseError,
		&estimate.UploadedAt,
		&estimate.ParsedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("carrier estimate not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get carrier estimate: %w", err)
	}

	return &estimate, nil
}

// logAPIUsage records API usage metrics for billing and monitoring
func (s *AuditService) logAPIUsage(ctx context.Context, orgID string, response *llm.ChatResponse) error {
	// Calculate estimated cost
	// Perplexity Sonar Large pricing (approximate):
	// Input: $1 per 1M tokens
	// Output: $1 per 1M tokens
	// Total cost estimate: ~$0.001 per 1000 tokens = $0.001 * (totalTokens / 1000)
	estimatedCost := float64(response.Usage.TotalTokens) / 1000000.0 * 1.0

	logID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO api_usage_logs (
			id, organization_id, model, endpoint,
			prompt_tokens, completion_tokens, total_tokens,
			estimated_cost, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	_, err := s.db.ExecContext(
		ctx,
		query,
		logID,
		orgID,
		response.Model,
		"chat/completions",
		response.Usage.PromptTokens,
		response.Usage.CompletionTokens,
		response.Usage.TotalTokens,
		estimatedCost,
		now,
	)

	if err != nil {
		return fmt.Errorf("failed to insert API usage log: %w", err)
	}

	return nil
}

// ─── PM BRAIN TYPES ─────────────────────────────────────────────────────────

// PMBrainDeltaDriver represents a line item with a pricing gap between estimates.
type PMBrainDeltaDriver struct {
	LineItem        string  `json:"line_item"`
	ContractorPrice float64 `json:"contractor_price"`
	CarrierPrice    float64 `json:"carrier_price"`
	Delta           float64 `json:"delta"`
	Reason          string  `json:"reason"`
}

// PMBrainCoverageDispute represents an item the carrier denied or partially paid.
type PMBrainCoverageDispute struct {
	Item               string `json:"item"`
	Status             string `json:"status"` // "denied" | "partial"
	ContractorPosition string `json:"contractor_position"`
}

// PMBrainAnalysis is the structured verdict returned by the PM Brain Strategy Engine.
type PMBrainAnalysis struct {
	Status                  string                   `json:"status"` // CLOSE | DISPUTE_OFFER | LEGAL_REVIEW | NEED_DOCS
	PlainEnglishSummary     string                   `json:"plain_english_summary"`
	TotalContractorEstimate float64                  `json:"total_contractor_estimate"`
	TotalCarrierEstimate    float64                  `json:"total_carrier_estimate"`
	TotalDelta              float64                  `json:"total_delta"`
	TopDeltaDrivers         []PMBrainDeltaDriver     `json:"top_delta_drivers"`
	CoverageDisputes        []PMBrainCoverageDispute `json:"coverage_disputes"`
	RequiredNextSteps       []string                 `json:"required_next_steps"`
	LegalThresholdMet       bool                     `json:"legal_threshold_met"`
}

// RunPMBrainAnalysis runs the Post-Adjudication Strategy Engine on an audit report,
// comparing the generated estimate against the carrier's offer with full policy context.
func (s *AuditService) RunPMBrainAnalysis(ctx context.Context, auditReportID, userID, orgID string) (*PMBrainAnalysis, error) {
	// 1. Fetch audit report (verifies org ownership)
	report, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, orgID)
	if err != nil {
		return nil, err
	}
	if report.GeneratedEstimate == nil || *report.GeneratedEstimate == "" {
		return nil, fmt.Errorf("industry estimate not generated yet")
	}

	// 2. Fetch carrier estimate parsed data
	carrierEstimate, err := s.getCarrierEstimate(ctx, report.ClaimID)
	if err != nil {
		return nil, fmt.Errorf("carrier estimate not found — please upload and parse it first")
	}
	if carrierEstimate.ParsedData == nil || *carrierEstimate.ParsedData == "" {
		return nil, fmt.Errorf("carrier estimate not parsed yet")
	}

	// 3. Fetch policy snapshot (carrier name, policy number, deductible, exclusions)
	type policySnapshot struct {
		address       string
		policyNumber  *string
		carrierName   string
		claimNumber   *string
		incidentDate  time.Time
		deductible    float64
		exclusions    string
		lossType      string
	}
	var snap policySnapshot
	snapQuery := `
		SELECT
			p.legal_address,
			ip.policy_number,
			ip.carrier_name,
			c.claim_number,
			c.incident_date,
			ip.deductible_value,
			COALESCE(ip.exclusions, ''),
			c.loss_type
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		INNER JOIN insurance_policies ip ON c.policy_id = ip.id
		WHERE c.id = $1
	`
	err = s.db.QueryRowContext(ctx, snapQuery, report.ClaimID).Scan(
		&snap.address,
		&snap.policyNumber,
		&snap.carrierName,
		&snap.claimNumber,
		&snap.incidentDate,
		&snap.deductible,
		&snap.exclusions,
		&snap.lossType,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch policy context: %w", err)
	}

	// 4. Build prompt and call LLM
	prompt := s.buildPMBrainPrompt(*report.GeneratedEstimate, *carrierEstimate.ParsedData, snap.policyNumber, snap.carrierName, snap.claimNumber, snap.incidentDate, snap.deductible, snap.exclusions, snap.lossType)

	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are an expert insurance claim analyst for a property management company.
Your job is to compare a contractor's industry-standard estimate with a carrier's insurance offer
and recommend the best course of action for the property manager.
Always respond with valid JSON only, no markdown, no additional text.`,
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.2, 4096)
	if err != nil {
		return nil, fmt.Errorf("LLM API call failed: %w", err)
	}
	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	// 5. Parse and validate JSON response
	content := extractJSON(response.Choices[0].Message.Content)
	var analysis PMBrainAnalysis
	if err := json.Unmarshal([]byte(content), &analysis); err != nil {
		return nil, fmt.Errorf("the AI returned a malformed analysis — please try again")
	}
	validStatuses := map[string]bool{"CLOSE": true, "DISPUTE_OFFER": true, "LEGAL_REVIEW": true, "NEED_DOCS": true}
	if !validStatuses[analysis.Status] {
		return nil, fmt.Errorf("the AI returned an invalid status '%s' — please try again", analysis.Status)
	}

	// 6. Save to DB
	analysisJSON, _ := json.Marshal(analysis)
	_, err = s.db.ExecContext(ctx,
		`UPDATE audit_reports SET pm_brain_analysis = $1, updated_at = NOW() WHERE id = $2`,
		string(analysisJSON), auditReportID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to save PM Brain analysis: %w", err)
	}

	// 7. Log API usage
	_ = s.logAPIUsage(ctx, orgID, response)

	return &analysis, nil
}

// buildPMBrainPrompt constructs the full PM Brain prompt with all three data sources.
func (s *AuditService) buildPMBrainPrompt(
	generatedEstimate, carrierParsedData string,
	policyNumber *string, carrierName string,
	claimNumber *string, incidentDate time.Time,
	deductible float64, exclusions, lossType string,
) string {
	var b strings.Builder

	b.WriteString("You are analyzing an insurance claim for a property management company.\n\n")

	b.WriteString("POLICY SNAPSHOT:\n")
	b.WriteString(fmt.Sprintf("- Carrier: %s\n", carrierName))
	if policyNumber != nil {
		b.WriteString(fmt.Sprintf("- Policy Number: %s\n", *policyNumber))
	}
	if claimNumber != nil {
		b.WriteString(fmt.Sprintf("- Claim Number: %s\n", *claimNumber))
	}
	b.WriteString(fmt.Sprintf("- Loss Type: %s\n", lossType))
	b.WriteString(fmt.Sprintf("- Incident Date: %s\n", incidentDate.Format("January 2, 2006")))
	b.WriteString(fmt.Sprintf("- Deductible: $%.2f\n", deductible))
	if exclusions != "" {
		b.WriteString(fmt.Sprintf("- Policy Exclusions: %s\n", exclusions))
	} else {
		b.WriteString("- Policy Exclusions: None listed\n")
	}
	b.WriteString("\n")

	b.WriteString("CLAIMCOACH ESTIMATE (industry-standard, from contractor scope sheet):\n")
	b.WriteString(generatedEstimate)
	b.WriteString("\n\n")

	b.WriteString("CARRIER'S OFFER (extracted from their PDF):\n")
	b.WriteString(carrierParsedData)
	b.WriteString("\n\n")

	b.WriteString(`Analyze both estimates and return a JSON object with this EXACT schema:
{
  "status": "CLOSE" | "DISPUTE_OFFER" | "LEGAL_REVIEW" | "NEED_DOCS",
  "plain_english_summary": "<2-3 sentences explaining the situation in plain English for a non-expert property manager>",
  "total_contractor_estimate": <number>,
  "total_carrier_estimate": <number>,
  "total_delta": <contractor_total minus carrier_total>,
  "top_delta_drivers": [
    {
      "line_item": "<item name>",
      "contractor_price": <number>,
      "carrier_price": <number>,
      "delta": <contractor_price minus carrier_price>,
      "reason": "<why this gap exists>"
    }
  ],
  "coverage_disputes": [
    {
      "item": "<item name>",
      "status": "denied" | "partial",
      "contractor_position": "<what the contractor says should be covered>"
    }
  ],
  "required_next_steps": ["<actionable step 1>", "<actionable step 2>"],
  "legal_threshold_met": <true | false>
}

STATUS SELECTION RULES (apply exactly):
- CLOSE: Carrier paid within 10%% of contractor estimate OR carrier paid more. No action needed.
- DISPUTE_OFFER: Carrier underpaid by more than 10%% but the gap is less than $15,000. Send a dispute letter combining missing scope items and underpriced line items.
- LEGAL_REVIEW: Gap is $15,000 or more, OR carrier explicitly denied coverage for major items. Escalate.
- NEED_DOCS: The carrier PDF data is empty, garbled, or clearly not a line-item estimate. Cannot analyze.

Include the top 3-5 delta drivers sorted by dollar gap descending.
If no coverage items were denied, return an empty array for coverage_disputes.
Return ONLY the JSON object, no markdown, no explanation.`)

	return b.String()
}

// GenerateDisputeLetter writes a formal Dispute/Supplement Request Letter using the PM Brain analysis.
// Only valid when pm_brain_analysis status is DISPUTE_OFFER.
func (s *AuditService) GenerateDisputeLetter(ctx context.Context, auditReportID, userID, orgID string) (string, error) {
	// 1. Fetch audit report
	report, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, orgID)
	if err != nil {
		return "", err
	}
	if report.PMBrainAnalysis == nil {
		return "", fmt.Errorf("PM Brain analysis must be run first")
	}

	// 2. Parse PM Brain analysis
	var analysis PMBrainAnalysis
	if err := json.Unmarshal([]byte(*report.PMBrainAnalysis), &analysis); err != nil {
		return "", fmt.Errorf("invalid PM Brain analysis data")
	}
	if analysis.Status != "DISPUTE_OFFER" {
		return "", fmt.Errorf("dispute letter only available when status is DISPUTE_OFFER")
	}

	// 3. Fetch claim context for letter header
	var address, carrierName string
	var policyNumber, claimNumber *string
	var incidentDate time.Time
	contextQuery := `
		SELECT
			p.legal_address,
			ip.carrier_name,
			ip.policy_number,
			c.claim_number,
			c.incident_date
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		INNER JOIN insurance_policies ip ON c.policy_id = ip.id
		WHERE c.id = $1
	`
	err = s.db.QueryRowContext(ctx, contextQuery, report.ClaimID).Scan(
		&address, &carrierName, &policyNumber, &claimNumber, &incidentDate,
	)
	if err != nil {
		return "", fmt.Errorf("failed to fetch claim context: %w", err)
	}

	// 4. Build letter prompt — use a concise structured summary, NOT raw JSON
	policyNum := ""
	if policyNumber != nil {
		policyNum = *policyNumber
	}
	claimNum := ""
	if claimNumber != nil {
		claimNum = *claimNumber
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("Date: %s\n", time.Now().Format("January 2, 2006")))
	b.WriteString(fmt.Sprintf("Property: %s\n", address))
	b.WriteString(fmt.Sprintf("Carrier: %s\n", carrierName))
	b.WriteString(fmt.Sprintf("Policy: %s  |  Claim: %s\n", policyNum, claimNum))
	b.WriteString(fmt.Sprintf("Loss date: %s\n\n", incidentDate.Format("January 2, 2006")))
	b.WriteString(fmt.Sprintf("FINANCIALS: Contractor estimate $%.2f | Carrier paid $%.2f | Gap $%.2f\n\n",
		analysis.TotalContractorEstimate, analysis.TotalCarrierEstimate, analysis.TotalDelta))

	if len(analysis.TopDeltaDrivers) > 0 {
		b.WriteString("PRICING GAPS:\n")
		for i, d := range analysis.TopDeltaDrivers {
			if i >= 5 {
				break
			}
			b.WriteString(fmt.Sprintf("- %s: carrier $%.2f vs required $%.2f (gap $%.2f) — %s\n",
				d.LineItem, d.CarrierPrice, d.ContractorPrice, d.Delta, d.Reason))
		}
		b.WriteString("\n")
	}

	if len(analysis.CoverageDisputes) > 0 {
		b.WriteString("COVERAGE DISPUTES:\n")
		for i, cd := range analysis.CoverageDisputes {
			if i >= 5 {
				break
			}
			b.WriteString(fmt.Sprintf("- %s [%s]: %s\n", cd.Item, cd.Status, cd.ContractorPosition))
		}
		b.WriteString("\n")
	}

	b.WriteString(`Write a formal insurance dispute letter using the data above.
Include: date, salutation to claims dept, subject line with claim/policy numbers, clear dispute of the carrier's estimate citing specific pricing gaps and coverage disputes, total additional funds requested, request for written response within 10 business days, professional closing.
Plain text only. Return ONLY the letter, no preamble.`)

	// 5. Call LLM
	messages := []llm.Message{
		{
			Role:    "system",
			Content: "You are an insurance claim specialist. Write concise formal dispute letters. Return only the letter text.",
		},
		{
			Role:    "user",
			Content: b.String(),
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.3, 900)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	letterText := response.Choices[0].Message.Content

	// 6. Save to DB
	_, err = s.db.ExecContext(ctx,
		`UPDATE audit_reports SET dispute_letter = $1, updated_at = NOW() WHERE id = $2`,
		letterText, auditReportID,
	)
	if err != nil {
		return "", fmt.Errorf("failed to save dispute letter: %w", err)
	}

	// 7. Log API usage
	_ = s.logAPIUsage(ctx, orgID, response)

	return letterText, nil
}

// GenerateOwnerPitch writes a plain-English email the PM can send to their building
// owner requesting authorization to escalate to legal. Only valid when pm_brain_analysis
// status is LEGAL_REVIEW.
func (s *AuditService) GenerateOwnerPitch(ctx context.Context, auditReportID, userID, orgID string) (string, error) {
	// 1. Fetch audit report with ownership check
	report, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, orgID)
	if err != nil {
		return "", err
	}
	if report.PMBrainAnalysis == nil {
		return "", fmt.Errorf("PM Brain analysis must be run first")
	}

	// 2. Parse PM Brain analysis
	var analysis PMBrainAnalysis
	if err := json.Unmarshal([]byte(*report.PMBrainAnalysis), &analysis); err != nil {
		return "", fmt.Errorf("invalid PM Brain analysis data")
	}
	if analysis.Status != "LEGAL_REVIEW" {
		return "", fmt.Errorf("owner pitch only available when status is LEGAL_REVIEW")
	}

	// 3. Fetch claim context (address, carrier, dates, deductible)
	var address, carrierName, lossType string
	var incidentDate time.Time
	var deductible float64
	err = s.db.QueryRowContext(ctx, `
		SELECT
			p.legal_address,
			ip.carrier_name,
			c.incident_date,
			ip.deductible_value,
			c.loss_type
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		INNER JOIN insurance_policies ip ON c.policy_id = ip.id
		WHERE c.id = $1
	`, report.ClaimID).Scan(
		&address, &carrierName, &incidentDate, &deductible, &lossType,
	)
	if err != nil {
		return "", fmt.Errorf("failed to fetch claim context: %w", err)
	}

	// 4. Build prompt
	var b strings.Builder
	b.WriteString("You are drafting an email for a professional Property Manager to send to their building owner regarding an insurance claim dispute.\n\n")
	b.WriteString("CLAIM CONTEXT:\n")
	b.WriteString(fmt.Sprintf("- Property Address: %s\n", address))
	b.WriteString(fmt.Sprintf("- Loss Type: %s on %s\n", lossType, incidentDate.Format("January 2, 2006")))
	b.WriteString(fmt.Sprintf("- Insurance Carrier: %s\n", carrierName))
	b.WriteString(fmt.Sprintf("- Policy Deductible: $%.2f\n\n", deductible))
	b.WriteString("PM BRAIN ANALYSIS:\n")
	b.WriteString(fmt.Sprintf("- Contractor Estimate: $%.2f\n", analysis.TotalContractorEstimate))
	b.WriteString(fmt.Sprintf("- Carrier Offer: $%.2f\n", analysis.TotalCarrierEstimate))
	b.WriteString(fmt.Sprintf("- Gap (Underpayment): $%.2f\n\n", analysis.TotalDelta))

	if len(analysis.TopDeltaDrivers) > 0 {
		b.WriteString("TOP DELTA DRIVERS:\n")
		for _, d := range analysis.TopDeltaDrivers {
			b.WriteString(fmt.Sprintf("- %s: carrier paid $%.2f vs contractor $%.2f (gap: $%.2f) — %s\n",
				d.LineItem, d.CarrierPrice, d.ContractorPrice, d.Delta, d.Reason))
		}
		b.WriteString("\n")
	}

	if len(analysis.CoverageDisputes) > 0 {
		b.WriteString("COVERAGE DISPUTES:\n")
		for _, cd := range analysis.CoverageDisputes {
			b.WriteString(fmt.Sprintf("- %s (%s): %s\n", cd.Item, cd.Status, cd.ContractorPosition))
		}
		b.WriteString("\n")
	}

	b.WriteString(`Write a professional email FROM the Property Manager TO the building owner.

Requirements:
- Open by stating the carrier has made their final offer on the claim
- Explain the dollar gap in plain English — why this amount is unacceptable
- Cite 2-3 specific line items or coverage disputes showing why the carrier's offer is unreasonable
- Recommend they authorize engaging a public adjuster or real estate attorney
- Close by asking the owner to reply with their approval to proceed
- Tone: competent, direct, professional — like a trusted advisor, NOT a lawyer
- Length: 3-4 short paragraphs, no filler phrases
- Do NOT include a subject line or "Subject:" prefix
- Do NOT use placeholder text like "[Your Name]" — write as "your property manager"
- Return ONLY the email body text, no preamble or explanation`)

	// 5. Call LLM
	messages := []llm.Message{
		{
			Role:    "system",
			Content: "You are a professional property manager writing a clear, persuasive email to a building owner about an insurance dispute. Write in first person as the property manager. Return only the email body, no markdown, no preamble.",
		},
		{
			Role:    "user",
			Content: b.String(),
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.4, 1500)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	pitchText := response.Choices[0].Message.Content

	// 6. Save to DB
	_, err = s.db.ExecContext(ctx,
		`UPDATE audit_reports SET owner_pitch = $1, updated_at = NOW() WHERE id = $2`,
		pitchText, auditReportID,
	)
	if err != nil {
		return "", fmt.Errorf("failed to save owner pitch: %w", err)
	}

	// 7. Log API usage
	_ = s.logAPIUsage(ctx, orgID, response)

	return pitchText, nil
}

// ViabilityAnalysis is the structured result returned by the PM Decision Engine.
type ViabilityAnalysis struct {
	Recommendation       string   `json:"recommendation"`
	NetEstimatedRecovery float64  `json:"net_estimated_recovery"`
	CoverageScore        int      `json:"coverage_score"`
	EconomicsScore       int      `json:"economics_score"`
	TopRisks             []string `json:"top_risks"`
	RequiredNextSteps    []string `json:"required_next_steps"`
	PlainEnglishSummary  string   `json:"plain_english_summary"`
}

// viabilityInputs holds the raw claim + policy facts fed into the Decision Engine.
type viabilityInputs struct {
	auditReportID   string
	lossType        string
	incidentDate    time.Time
	totalRCV        float64
	deductibleValue float64
	exclusions      string
}

// AnalyzeClaimViability runs the PM Decision Engine to produce a 3-tier recommendation
// on whether the claim is worth pursuing, based on economics and coverage risk scoring.
func (s *AuditService) AnalyzeClaimViability(ctx context.Context, claimID, orgID string) (*ViabilityAnalysis, error) {
	// 1. Gather inputs
	inputs, err := s.fetchViabilityInputs(ctx, claimID, orgID)
	if err != nil {
		return nil, err
	}

	// 2. Build the PM Brain prompt
	userPrompt := s.buildViabilityPrompt(inputs)

	// 3. Call the LLM — low temperature for deterministic scoring
	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are an expert Public Adjuster and Property Manager with deep knowledge of insurance claim viability assessment.
Your task is to evaluate claim facts using exact scoring rules and output a structured JSON analysis.
Always respond with valid JSON only, no additional text or explanations.`,
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.1, 1000)
	if err != nil {
		return nil, fmt.Errorf("LLM API call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	// 4. Parse the structured analysis
	analysisJSON := extractJSON(response.Choices[0].Message.Content)
	var analysis ViabilityAnalysis
	if err := json.Unmarshal([]byte(analysisJSON), &analysis); err != nil {
		return nil, fmt.Errorf("invalid JSON response from LLM: %w", err)
	}

	// 5. Persist the result so it survives page reloads
	_, _ = s.db.ExecContext(ctx,
		`UPDATE audit_reports SET viability_analysis = $1, updated_at = NOW() WHERE id = $2`,
		analysisJSON, inputs.auditReportID,
	)

	return &analysis, nil
}

// fetchViabilityInputs gathers all data needed for the Decision Engine in two focused queries.
func (s *AuditService) fetchViabilityInputs(ctx context.Context, claimID, orgID string) (*viabilityInputs, error) {
	// Query claim facts and policy data, verifying org ownership via the property chain.
	claimQuery := `
		SELECT c.loss_type, c.incident_date, ip.deductible_value, COALESCE(ip.exclusions, '')
		FROM claims c
		INNER JOIN insurance_policies ip ON c.policy_id = ip.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE c.id = $1 AND p.organization_id = $2
	`

	var inputs viabilityInputs
	err := s.db.QueryRowContext(ctx, claimQuery, claimID, orgID).Scan(
		&inputs.lossType,
		&inputs.incidentDate,
		&inputs.deductibleValue,
		&inputs.exclusions,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch claim data: %w", err)
	}

	// Fetch the audit report ID and total RCV from the most recent generated estimate.
	estimateQuery := `
		SELECT id, generated_estimate
		FROM audit_reports
		WHERE claim_id = $1 AND generated_estimate IS NOT NULL
		ORDER BY created_at DESC
		LIMIT 1
	`

	var estimateJSON string
	err = s.db.QueryRowContext(ctx, estimateQuery, claimID).Scan(&inputs.auditReportID, &estimateJSON)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("no generated estimate found for claim %s — run industry estimate first", claimID)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to fetch estimate: %w", err)
	}

	// Extract the `total` field from the estimate JSON blob.
	var estimateData map[string]interface{}
	if err := json.Unmarshal([]byte(estimateJSON), &estimateData); err != nil {
		return nil, fmt.Errorf("failed to parse estimate data: %w", err)
	}
	totalRCV, ok := estimateData["total"].(float64)
	if !ok {
		return nil, fmt.Errorf("estimate is missing required 'total' field")
	}
	inputs.totalRCV = totalRCV

	return &inputs, nil
}

// buildViabilityPrompt constructs the PM Brain prompt with claim inputs and explicit scoring rules.
func (s *AuditService) buildViabilityPrompt(inputs *viabilityInputs) string {
	var b strings.Builder

	b.WriteString("Evaluate the following insurance claim and return a viability analysis.\n\n")

	b.WriteString("CLAIM FACTS:\n")
	b.WriteString(fmt.Sprintf("- Loss Type: %s\n", inputs.lossType))
	b.WriteString(fmt.Sprintf("- Loss Date: %s\n", inputs.incidentDate.Format("January 2, 2006")))
	b.WriteString(fmt.Sprintf("- Estimated RCV (Replacement Cost Value): $%.2f\n", inputs.totalRCV))
	b.WriteString("\n")

	b.WriteString("POLICY DETAILS:\n")
	b.WriteString(fmt.Sprintf("- Deductible: $%.2f\n", inputs.deductibleValue))
	if inputs.exclusions != "" {
		b.WriteString(fmt.Sprintf("- Policy Exclusions: %s\n", inputs.exclusions))
	} else {
		b.WriteString("- Policy Exclusions: None listed\n")
	}
	b.WriteString("\n")

	b.WriteString("SCORING RULES — apply these exactly:\n\n")

	b.WriteString("A. ECONOMICS SCORE (0-100):\n")
	b.WriteString("Calculate: net_recovery = Estimated RCV - Deductible\n")
	b.WriteString("Assign score based on net_recovery:\n")
	b.WriteString("  - net_recovery < $2,500             → Score: 15\n")
	b.WriteString("  - $2,500 ≤ net_recovery ≤ $7,500   → Score: 35\n")
	b.WriteString("  - $7,500 < net_recovery ≤ $20,000  → Score: 60\n")
	b.WriteString("  - net_recovery > $20,000            → Score: 85\n\n")

	b.WriteString("B. COVERAGE RISK SCORE (0-100):\n")
	b.WriteString("Start at 100. Apply deductions based on your analysis:\n")
	b.WriteString("  - If the Policy Exclusions EXPLICITLY exclude the Loss Type (e.g., loss is 'Water', exclusions say 'Flood'): Subtract 60\n")
	b.WriteString("  - If the Loss Type is ambiguous or unclear relative to coverage: Subtract 20\n")
	b.WriteString("  - If the Loss Type is Water (risk of repeated seepage clause): Subtract 30\n")
	b.WriteString("  Note: Multiple deductions may apply. Minimum score is 0.\n\n")

	b.WriteString("C. RECOMMENDATION — choose exactly one:\n")
	b.WriteString("  - PURSUE:                 Coverage Score >= 70 AND Economics Score >= 50\n")
	b.WriteString("  - PURSUE_WITH_CONDITIONS: Coverage Score 40-69 OR Economics Score 30-49\n")
	b.WriteString("  - DO_NOT_PURSUE:          Coverage Score < 40 OR Economics Score < 30 OR net_recovery <= 0\n\n")

	b.WriteString("RESPONSE FORMAT:\n")
	b.WriteString("Return ONLY this JSON object, no other text:\n")
	b.WriteString("{\n")
	b.WriteString("  \"recommendation\": \"PURSUE | PURSUE_WITH_CONDITIONS | DO_NOT_PURSUE\",\n")
	b.WriteString("  \"net_estimated_recovery\": <number>,\n")
	b.WriteString("  \"coverage_score\": <integer 0-100>,\n")
	b.WriteString("  \"economics_score\": <integer 0-100>,\n")
	b.WriteString("  \"top_risks\": [\"<risk 1>\", \"<risk 2>\"],\n")
	b.WriteString("  \"required_next_steps\": [\"<step 1 if conditions apply>\"],\n")
	b.WriteString("  \"plain_english_summary\": \"<1-2 sentence plain English summary>\"\n")
	b.WriteString("}\n")

	return b.String()
}

// extractJSON strips markdown code fences and extracts the JSON object from an LLM response.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	// Strip opening ```json or ``` fence
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		}
	}
	// Strip closing ``` fence
	if strings.HasSuffix(s, "```") {
		s = s[:strings.LastIndex(s, "```")]
	}
	s = strings.TrimSpace(s)
	// Extract first { ... } block as a fallback
	if start := strings.Index(s, "{"); start >= 0 {
		if end := strings.LastIndex(s, "}"); end > start {
			return s[start : end+1]
		}
	}
	return s
}
