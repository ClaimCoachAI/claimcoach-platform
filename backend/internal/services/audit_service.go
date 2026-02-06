package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"reflect"
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
	scopeService *ScopeSheetService
}

// NewAuditService creates a new AuditService instance
func NewAuditService(db *sql.DB, llmClient LLMClient, scopeService *ScopeSheetService) *AuditService {
	return &AuditService{
		db:           db,
		llmClient:    llmClient,
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

	// 2. Build the prompt from the scope sheet
	userPrompt := s.buildEstimatePrompt(scopeSheet)

	// 3. Prepare messages for the LLM
	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are an expert construction estimator specializing in insurance claims.
Your task is to produce accurate, industry-standard repair estimates in Xactimate-style format.
Always respond with valid JSON only, no additional text or explanations.`,
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}

	// 4. Call the LLM API
	response, err := s.llmClient.Chat(ctx, messages, 0.2, 2000)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}

	// 5. Extract and validate the response
	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	estimateJSON := response.Choices[0].Message.Content

	// Validate that it's valid JSON
	var validationCheck map[string]interface{}
	if err := json.Unmarshal([]byte(estimateJSON), &validationCheck); err != nil {
		return "", fmt.Errorf("invalid JSON response from LLM: %w", err)
	}

	// 6. Create audit report record
	reportID, err := s.saveAuditReport(ctx, claimID, scopeSheet.ID, userID, estimateJSON)
	if err != nil {
		return "", fmt.Errorf("failed to save audit report: %w", err)
	}

	// 7. Log API usage
	err = s.logAPIUsage(ctx, orgID, response)
	if err != nil {
		// Log the error but don't fail the request
		log.Printf("Warning: failed to log API usage: %v", err)
	}

	return reportID, nil
}

// buildEstimatePrompt creates a comprehensive prompt from the scope sheet data
func (s *AuditService) buildEstimatePrompt(scope *models.ScopeSheet) string {
	var builder strings.Builder

	builder.WriteString("Based on the following scope sheet data and current industry pricing, ")
	builder.WriteString("produce a detailed Xactimate-style estimate in JSON format.\n\n")
	builder.WriteString("SCOPE SHEET DATA:\n")

	// Use reflection to iterate through all non-null fields
	val := reflect.ValueOf(*scope)
	typ := val.Type()

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldType := typ.Field(i)
		jsonTag := fieldType.Tag.Get("json")

		// Skip ID and timestamp fields
		if jsonTag == "id" || jsonTag == "claim_id" || jsonTag == "created_at" || jsonTag == "updated_at" || jsonTag == "submitted_at" {
			continue
		}

		// Check if field has a value (non-nil for pointers, non-zero for booleans)
		if !isFieldEmpty(field) {
			fieldValue := getFieldValue(field)
			builder.WriteString(fmt.Sprintf("- %s: %v\n", jsonTag, fieldValue))
		}
	}

	builder.WriteString("\nRESPONSE FORMAT:\n")
	builder.WriteString("Return ONLY a JSON object with this exact structure:\n")
	builder.WriteString("{\n")
	builder.WriteString("  \"line_items\": [\n")
	builder.WriteString("    {\n")
	builder.WriteString("      \"description\": \"Item description\",\n")
	builder.WriteString("      \"quantity\": number,\n")
	builder.WriteString("      \"unit\": \"unit type (e.g., SF, LF, EA)\",\n")
	builder.WriteString("      \"unit_cost\": number,\n")
	builder.WriteString("      \"total\": number,\n")
	builder.WriteString("      \"category\": \"category name (e.g., Roofing, Exterior Trim)\"\n")
	builder.WriteString("    }\n")
	builder.WriteString("  ],\n")
	builder.WriteString("  \"subtotal\": number,\n")
	builder.WriteString("  \"overhead_profit\": number (typically 20% of subtotal),\n")
	builder.WriteString("  \"total\": number\n")
	builder.WriteString("}\n\n")
	builder.WriteString("Use current 2026 industry-standard pricing for materials and labor. ")
	builder.WriteString("Include all items from the scope sheet with appropriate quantities and costs.")

	return builder.String()
}

// isFieldEmpty checks if a field is empty (nil for pointers, false for bool, empty for strings)
func isFieldEmpty(field reflect.Value) bool {
	switch field.Kind() {
	case reflect.Ptr:
		return field.IsNil()
	case reflect.Bool:
		// For booleans, we only include 'true' values
		return !field.Bool()
	case reflect.String:
		return field.String() == ""
	default:
		return field.IsZero()
	}
}

// getFieldValue extracts the actual value from a field
func getFieldValue(field reflect.Value) interface{} {
	switch field.Kind() {
	case reflect.Ptr:
		if !field.IsNil() {
			return field.Elem().Interface()
		}
		return nil
	default:
		return field.Interface()
	}
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

// CompareEstimates compares industry estimate with carrier estimate using AI
func (s *AuditService) CompareEstimates(ctx context.Context, auditReportID string, userID string, orgID string) error {
	// 1. Get audit report by ID and verify ownership via claim -> property -> org
	auditReport, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, orgID)
	if err != nil {
		return err
	}

	// 2. Verify industry estimate exists
	if auditReport.GeneratedEstimate == nil || *auditReport.GeneratedEstimate == "" {
		return fmt.Errorf("industry estimate not generated yet")
	}

	// 3. Get carrier estimate from carrier_estimate (via claim_id)
	carrierEstimate, err := s.getCarrierEstimate(ctx, auditReport.ClaimID)
	if err != nil {
		return err
	}

	// 4. Verify carrier estimate is parsed
	if carrierEstimate.ParsedData == nil || *carrierEstimate.ParsedData == "" {
		return fmt.Errorf("carrier estimate not parsed yet")
	}

	// 5. Build comparison prompt with both estimates
	prompt := s.buildComparisonPrompt(*auditReport.GeneratedEstimate, *carrierEstimate.ParsedData)

	// 6. Call LLM to generate comparison analysis
	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are an expert insurance claim auditor.
Your task is to compare industry-standard estimates with carrier estimates and identify discrepancies.
Always respond with valid JSON only, no additional text or explanations.`,
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.2, 3000)
	if err != nil {
		return fmt.Errorf("LLM API call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return fmt.Errorf("LLM returned no choices")
	}

	comparisonJSON := response.Choices[0].Message.Content

	// 7. Parse LLM response (JSON with discrepancies, justifications)
	var comparisonData map[string]interface{}
	if err := json.Unmarshal([]byte(comparisonJSON), &comparisonData); err != nil {
		return fmt.Errorf("invalid JSON response from LLM: %w", err)
	}

	// 8. Calculate totals from the comparison response
	totals, err := s.extractTotals(comparisonData)
	if err != nil {
		return fmt.Errorf("failed to extract totals: %w", err)
	}

	// 9. Update audit_report with comparison_data and totals
	err = s.updateAuditReportWithComparison(
		ctx,
		auditReportID,
		comparisonJSON,
		totals.industryTotal,
		totals.carrierTotal,
		totals.delta,
	)
	if err != nil {
		return fmt.Errorf("failed to update audit report: %w", err)
	}

	// 10. Log API usage
	err = s.logAPIUsage(ctx, orgID, response)
	if err != nil {
		// Log the error but don't fail the request
		log.Printf("Warning: failed to log API usage: %v", err)
	}

	return nil
}

// buildComparisonPrompt creates a prompt for comparing industry and carrier estimates
func (s *AuditService) buildComparisonPrompt(industryEstimate, carrierEstimate string) string {
	var builder strings.Builder

	builder.WriteString("Compare these two estimates and identify discrepancies:\n\n")
	builder.WriteString("INDUSTRY ESTIMATE (from contractor scope):\n")
	builder.WriteString(industryEstimate)
	builder.WriteString("\n\n")
	builder.WriteString("CARRIER ESTIMATE (from insurance company):\n")
	builder.WriteString(carrierEstimate)
	builder.WriteString("\n\n")
	builder.WriteString("For each discrepancy, provide:\n")
	builder.WriteString("- Item description\n")
	builder.WriteString("- Industry price vs Carrier price\n")
	builder.WriteString("- Delta amount\n")
	builder.WriteString("- Justification (why industry price is correct)\n\n")
	builder.WriteString("Return JSON:\n")
	builder.WriteString("{\n")
	builder.WriteString("  \"discrepancies\": [\n")
	builder.WriteString("    {\n")
	builder.WriteString("      \"item\": \"description\",\n")
	builder.WriteString("      \"industry_price\": X.XX,\n")
	builder.WriteString("      \"carrier_price\": X.XX,\n")
	builder.WriteString("      \"delta\": X.XX,\n")
	builder.WriteString("      \"justification\": \"detailed explanation\"\n")
	builder.WriteString("    }\n")
	builder.WriteString("  ],\n")
	builder.WriteString("  \"summary\": {\n")
	builder.WriteString("    \"total_industry\": X.XX,\n")
	builder.WriteString("    \"total_carrier\": X.XX,\n")
	builder.WriteString("    \"total_delta\": X.XX\n")
	builder.WriteString("  }\n")
	builder.WriteString("}\n")

	return builder.String()
}

type comparisonTotals struct {
	industryTotal float64
	carrierTotal  float64
	delta         float64
}

// extractTotals extracts the total amounts from the comparison data
func (s *AuditService) extractTotals(data map[string]interface{}) (*comparisonTotals, error) {
	summary, ok := data["summary"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing or invalid summary field")
	}

	industryTotal, ok := summary["total_industry"].(float64)
	if !ok {
		return nil, fmt.Errorf("missing or invalid total_industry field")
	}

	carrierTotal, ok := summary["total_carrier"].(float64)
	if !ok {
		return nil, fmt.Errorf("missing or invalid total_carrier field")
	}

	delta, ok := summary["total_delta"].(float64)
	if !ok {
		return nil, fmt.Errorf("missing or invalid total_delta field")
	}

	return &comparisonTotals{
		industryTotal: industryTotal,
		carrierTotal:  carrierTotal,
		delta:         delta,
	}, nil
}

// GetAuditReportByClaimID retrieves the audit report for a claim with ownership verification
func (s *AuditService) GetAuditReportByClaimID(ctx context.Context, claimID, orgID string) (*models.AuditReport, error) {
	query := `
		SELECT ar.id, ar.claim_id, ar.scope_sheet_id, ar.carrier_estimate_id,
		       ar.generated_estimate, ar.comparison_data, ar.total_contractor_estimate,
		       ar.total_carrier_estimate, ar.total_delta, ar.status, ar.error_message,
		       ar.created_by_user_id, ar.created_at, ar.updated_at
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
		       ar.created_by_user_id, ar.created_at, ar.updated_at
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

// updateAuditReportWithComparison updates the audit report with comparison results
func (s *AuditService) updateAuditReportWithComparison(
	ctx context.Context,
	reportID string,
	comparisonJSON string,
	industryTotal float64,
	carrierTotal float64,
	delta float64,
) error {
	query := `
		UPDATE audit_reports
		SET comparison_data = $1,
		    total_contractor_estimate = $2,
		    total_carrier_estimate = $3,
		    total_delta = $4,
		    status = $5,
		    updated_at = $6
		WHERE id = $7
	`

	now := time.Now()

	_, err := s.db.ExecContext(
		ctx,
		query,
		comparisonJSON,
		industryTotal,
		carrierTotal,
		delta,
		models.AuditStatusCompleted,
		now,
		reportID,
	)

	if err != nil {
		return fmt.Errorf("failed to update audit report: %w", err)
	}

	return nil
}

// GenerateRebuttal generates a professional rebuttal letter based on comparison data
func (s *AuditService) GenerateRebuttal(ctx context.Context, auditReportID string, userID string, orgID string) (string, error) {
	// 1. Get audit report by ID and verify ownership
	auditReport, err := s.getAuditReportWithOwnershipCheck(ctx, auditReportID, orgID)
	if err != nil {
		return "", err
	}

	// 2. Validate comparison_data exists
	if auditReport.ComparisonData == nil || *auditReport.ComparisonData == "" {
		return "", fmt.Errorf("comparison data not available")
	}

	// 3. Parse comparison data
	var comparisonData map[string]interface{}
	if err := json.Unmarshal([]byte(*auditReport.ComparisonData), &comparisonData); err != nil {
		return "", fmt.Errorf("failed to parse comparison data: %w", err)
	}

	// 4. Get property and policy info for context
	propertyInfo, policyInfo, claimInfo, err := s.getClaimContext(ctx, auditReport.ClaimID)
	if err != nil {
		return "", fmt.Errorf("failed to get claim context: %w", err)
	}

	// 5. Build rebuttal prompt with comparison data
	prompt := s.buildRebuttalPrompt(propertyInfo, policyInfo, claimInfo, comparisonData, auditReport)

	// 6. Call LLM to generate professional letter
	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are a professional insurance claim specialist writing formal rebuttal letters.
Your task is to create well-structured, professional business letters that present discrepancies
between carrier estimates and industry-standard pricing with clear justification.
The tone should be professional, factual, and respectful.`,
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.3, 2000)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	rebuttalContent := response.Choices[0].Message.Content

	// 7. Save to rebuttals table
	rebuttalID, err := s.saveRebuttal(ctx, auditReportID, rebuttalContent)
	if err != nil {
		return "", fmt.Errorf("failed to save rebuttal: %w", err)
	}

	// 8. Set audit_report status to "completed" if not already
	if auditReport.Status != models.AuditStatusCompleted {
		err = s.updateAuditReportStatus(ctx, auditReportID, models.AuditStatusCompleted)
		if err != nil {
			// Log but don't fail - the rebuttal was created successfully
			log.Printf("Warning: failed to update audit report status: %v", err)
		}
	}

	// 9. Log API usage
	err = s.logAPIUsage(ctx, orgID, response)
	if err != nil {
		// Log the error but don't fail the request
		log.Printf("Warning: failed to log API usage: %v", err)
	}

	return rebuttalID, nil
}

// getClaimContext retrieves property, policy, and claim information for the rebuttal letter
func (s *AuditService) getClaimContext(ctx context.Context, claimID string) (propertyInfo map[string]interface{}, policyInfo map[string]interface{}, claimInfo map[string]interface{}, err error) {
	query := `
		SELECT
			p.legal_address,
			pol.policy_number,
			pol.carrier_name,
			c.claim_number,
			c.incident_date
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		INNER JOIN policies pol ON c.policy_id = pol.id
		WHERE c.id = $1
	`

	var address, carrierName string
	var policyNumber, claimNumber *string
	var incidentDate time.Time

	err = s.db.QueryRowContext(ctx, query, claimID).Scan(
		&address,
		&policyNumber,
		&carrierName,
		&claimNumber,
		&incidentDate,
	)

	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to get claim context: %w", err)
	}

	propertyInfo = map[string]interface{}{
		"address": address,
	}

	policyInfo = map[string]interface{}{
		"policy_number": policyNumber,
		"carrier_name":  carrierName,
	}

	claimInfo = map[string]interface{}{
		"claim_number":  claimNumber,
		"incident_date": incidentDate.Format("January 2, 2006"),
	}

	return propertyInfo, policyInfo, claimInfo, nil
}

// buildRebuttalPrompt creates a prompt for generating a rebuttal letter
func (s *AuditService) buildRebuttalPrompt(propertyInfo, policyInfo, claimInfo map[string]interface{}, comparisonData map[string]interface{}, auditReport *models.AuditReport) string {
	var builder strings.Builder

	builder.WriteString("Generate a professional rebuttal letter for a property insurance claim.\n\n")

	// Property details
	builder.WriteString("PROPERTY DETAILS:\n")
	builder.WriteString(fmt.Sprintf("- Address: %v\n", propertyInfo["address"]))
	if policyNumber, ok := policyInfo["policy_number"].(*string); ok && policyNumber != nil {
		builder.WriteString(fmt.Sprintf("- Policy Number: %s\n", *policyNumber))
	}
	builder.WriteString(fmt.Sprintf("- Carrier: %v\n", policyInfo["carrier_name"]))
	if claimNumber, ok := claimInfo["claim_number"].(*string); ok && claimNumber != nil {
		builder.WriteString(fmt.Sprintf("- Claim Number: %s\n", *claimNumber))
	}
	builder.WriteString(fmt.Sprintf("- Incident Date: %v\n", claimInfo["incident_date"]))
	builder.WriteString("\n")

	// Comparison summary
	builder.WriteString("COMPARISON SUMMARY:\n")
	if summary, ok := comparisonData["summary"].(map[string]interface{}); ok {
		if industryTotal, ok := summary["total_industry"].(float64); ok {
			builder.WriteString(fmt.Sprintf("- Industry Standard Total: $%.2f\n", industryTotal))
		}
		if carrierTotal, ok := summary["total_carrier"].(float64); ok {
			builder.WriteString(fmt.Sprintf("- Carrier Estimate Total: $%.2f\n", carrierTotal))
		}
		if delta, ok := summary["total_delta"].(float64); ok {
			builder.WriteString(fmt.Sprintf("- Delta: $%.2f\n", delta))
		}
	} else if auditReport.TotalContractorEstimate != nil && auditReport.TotalCarrierEstimate != nil {
		builder.WriteString(fmt.Sprintf("- Industry Standard Total: $%.2f\n", *auditReport.TotalContractorEstimate))
		builder.WriteString(fmt.Sprintf("- Carrier Estimate Total: $%.2f\n", *auditReport.TotalCarrierEstimate))
		if auditReport.TotalDelta != nil {
			builder.WriteString(fmt.Sprintf("- Delta: $%.2f\n", *auditReport.TotalDelta))
		}
	}
	builder.WriteString("\n")

	// Discrepancies
	builder.WriteString("DISCREPANCIES:\n")
	if discrepancies, ok := comparisonData["discrepancies"].([]interface{}); ok {
		for i, d := range discrepancies {
			if disc, ok := d.(map[string]interface{}); ok {
				builder.WriteString(fmt.Sprintf("\n%d. Item: %v\n", i+1, disc["item"]))
				builder.WriteString(fmt.Sprintf("   Industry Price: $%.2f\n", disc["industry_price"]))
				builder.WriteString(fmt.Sprintf("   Carrier Price: $%.2f\n", disc["carrier_price"]))
				builder.WriteString(fmt.Sprintf("   Delta: $%.2f\n", disc["delta"]))
				builder.WriteString(fmt.Sprintf("   Justification: %v\n", disc["justification"]))
			}
		}
	}
	builder.WriteString("\n")

	// Instructions for the letter
	builder.WriteString("Create a formal business letter addressed to the insurance adjuster that:\n")
	builder.WriteString("1. References the claim professionally with property address and claim number\n")
	builder.WriteString("2. States the purpose clearly (requesting reconsideration of the estimate)\n")
	builder.WriteString("3. Presents each discrepancy with industry justification\n")
	builder.WriteString("4. Maintains a professional and respectful tone throughout\n")
	builder.WriteString("5. Includes specific line items and pricing differences\n")
	builder.WriteString("6. Requests a meeting or further discussion\n")
	builder.WriteString("7. Thanks them for their consideration\n\n")

	builder.WriteString("Format as a complete business letter with:\n")
	builder.WriteString("- Date (use today's date)\n")
	builder.WriteString("- Salutation (To: Insurance Adjuster)\n")
	builder.WriteString("- Subject line with claim reference\n")
	builder.WriteString("- Body paragraphs\n")
	builder.WriteString("- Professional closing\n\n")

	builder.WriteString("Do not include placeholder addresses, signatures, or company names in the signature block.\n")
	builder.WriteString("Write the letter ready to be reviewed and signed by the property manager.\n")

	return builder.String()
}

// saveRebuttal saves the generated rebuttal to the database
func (s *AuditService) saveRebuttal(ctx context.Context, auditReportID, content string) (string, error) {
	rebuttalID := uuid.New().String()
	now := time.Now()

	query := `
		INSERT INTO rebuttals (
			id, audit_report_id, content, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`

	var returnedID string
	err := s.db.QueryRowContext(
		ctx,
		query,
		rebuttalID,
		auditReportID,
		content,
		now,
		now,
	).Scan(&returnedID)

	if err != nil {
		return "", fmt.Errorf("failed to insert rebuttal: %w", err)
	}

	return returnedID, nil
}

// updateAuditReportStatus updates the status of an audit report
func (s *AuditService) updateAuditReportStatus(ctx context.Context, reportID, status string) error {
	query := `
		UPDATE audit_reports
		SET status = $1, updated_at = $2
		WHERE id = $3
	`

	_, err := s.db.ExecContext(ctx, query, status, time.Now(), reportID)
	if err != nil {
		return fmt.Errorf("failed to update audit report status: %w", err)
	}

	return nil
}

// GetRebuttal retrieves a rebuttal by ID with ownership verification
func (s *AuditService) GetRebuttal(ctx context.Context, rebuttalID string, orgID string) (*models.Rebuttal, error) {
	query := `
		SELECT r.id, r.audit_report_id, r.content, r.created_at, r.updated_at
		FROM rebuttals r
		INNER JOIN audit_reports ar ON r.audit_report_id = ar.id
		INNER JOIN claims c ON ar.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE r.id = $1 AND p.organization_id = $2
	`

	var rebuttal models.Rebuttal
	err := s.db.QueryRowContext(ctx, query, rebuttalID, orgID).Scan(
		&rebuttal.ID,
		&rebuttal.AuditReportID,
		&rebuttal.Content,
		&rebuttal.CreatedAt,
		&rebuttal.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("rebuttal not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get rebuttal: %w", err)
	}

	return &rebuttal, nil
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
