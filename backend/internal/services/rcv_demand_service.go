package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// RCVDemandService handles RCV demand letter generation
type RCVDemandService struct {
	db             *sql.DB
	llmClient      LLMClient
	claimService   *ClaimService
	paymentService *PaymentService
}

// NewRCVDemandService creates a new RCVDemandService instance
func NewRCVDemandService(db *sql.DB, llmClient LLMClient, claimService *ClaimService, paymentService *PaymentService) *RCVDemandService {
	return &RCVDemandService{
		db:             db,
		llmClient:      llmClient,
		claimService:   claimService,
		paymentService: paymentService,
	}
}

// GenerateRCVDemandLetter generates a demand letter for outstanding RCV payments
func (s *RCVDemandService) GenerateRCVDemandLetter(ctx context.Context, claimID, userID, orgID string) (string, error) {
	// Get claim details
	claim, err := s.claimService.GetClaim(claimID, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to get claim: %w", err)
	}
	if claim == nil {
		return "", fmt.Errorf("claim not found")
	}

	// Get payment summary
	summary, err := s.paymentService.GetPaymentSummary(ctx, claimID, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to get payment summary: %w", err)
	}

	// Calculate outstanding RCV
	rcvOutstanding := summary.ExpectedRCV - summary.TotalRCVReceived
	if rcvOutstanding <= 0 {
		return "", fmt.Errorf("no outstanding RCV payment")
	}

	// Get claim context (property, policy)
	claimContext, err := s.getClaimContext(ctx, claimID)
	if err != nil {
		return "", fmt.Errorf("failed to get claim context: %w", err)
	}

	// Build prompt
	prompt := s.buildRCVDemandPrompt(claimContext, summary.TotalACVReceived, summary.ExpectedRCV, rcvOutstanding)

	// Call LLM
	messages := []llm.Message{
		{
			Role: "system",
			Content: `You are a professional insurance claim specialist writing RCV (Replacement Cost Value) demand letters.
Your letters should be formal, professional, and persuasive while maintaining a respectful tone.
Return only the letter content, no additional commentary or explanation.`,
		},
		{
			Role:    "user",
			Content: prompt,
		},
	}

	response, err := s.llmClient.Chat(ctx, messages, 0.3, 1500)
	if err != nil {
		return "", fmt.Errorf("LLM API call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("LLM returned no choices")
	}

	letterContent := response.Choices[0].Message.Content

	// Save demand letter
	demandLetterID, err := s.saveRCVDemandLetter(ctx, claimID, userID, letterContent, summary.TotalACVReceived, summary.ExpectedRCV, rcvOutstanding)
	if err != nil {
		return "", fmt.Errorf("failed to save demand letter: %w", err)
	}

	// Log API usage
	err = s.logAPIUsage(ctx, demandLetterID, response.Usage.TotalTokens)
	if err != nil {
		log.Printf("Warning: failed to log API usage: %v", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"demand_letter_id": demandLetterID,
		"rcv_outstanding":  rcvOutstanding,
		"acv_received":     summary.TotalACVReceived,
	}
	err = s.logActivity(ctx, claimID, userID, "rcv_demand_generated", fmt.Sprintf("RCV demand letter generated for $%.2f", rcvOutstanding), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return demandLetterID, nil
}

// GetRCVDemandLetter retrieves a demand letter by ID with ownership check
func (s *RCVDemandService) GetRCVDemandLetter(ctx context.Context, demandLetterID, orgID string) (*models.RCVDemandLetter, error) {
	query := `
		SELECT rcv.*
		FROM rcv_demand_letters rcv
		INNER JOIN claims c ON rcv.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE rcv.id = $1 AND p.organization_id = $2
	`

	var letter models.RCVDemandLetter
	err := s.db.QueryRowContext(ctx, query, demandLetterID, orgID).Scan(
		&letter.ID,
		&letter.ClaimID,
		&letter.PaymentID,
		&letter.Content,
		&letter.ACVReceived,
		&letter.RCVExpected,
		&letter.RCVOutstanding,
		&letter.CreatedByUserID,
		&letter.CreatedAt,
		&letter.UpdatedAt,
		&letter.SentAt,
		&letter.SentToEmail,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get demand letter: %w", err)
	}

	return &letter, nil
}

// ListRCVDemandLettersByClaimID retrieves all demand letters for a claim
func (s *RCVDemandService) ListRCVDemandLettersByClaimID(ctx context.Context, claimID, orgID string) ([]models.RCVDemandLetter, error) {
	query := `
		SELECT rcv.*
		FROM rcv_demand_letters rcv
		INNER JOIN claims c ON rcv.claim_id = c.id
		INNER JOIN properties p ON c.property_id = p.id
		WHERE rcv.claim_id = $1 AND p.organization_id = $2
		ORDER BY rcv.created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to list demand letters: %w", err)
	}
	defer rows.Close()

	var letters []models.RCVDemandLetter
	for rows.Next() {
		var letter models.RCVDemandLetter
		err := rows.Scan(
			&letter.ID,
			&letter.ClaimID,
			&letter.PaymentID,
			&letter.Content,
			&letter.ACVReceived,
			&letter.RCVExpected,
			&letter.RCVOutstanding,
			&letter.CreatedByUserID,
			&letter.CreatedAt,
			&letter.UpdatedAt,
			&letter.SentAt,
			&letter.SentToEmail,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan demand letter: %w", err)
		}
		letters = append(letters, letter)
	}

	return letters, nil
}

// MarkAsSentInput contains data for marking a demand letter as sent
type MarkAsSentInput struct {
	SentToEmail string `json:"sent_to_email"`
}

// MarkAsSent records when a demand letter was sent
func (s *RCVDemandService) MarkAsSent(ctx context.Context, demandLetterID, userID, orgID string, input MarkAsSentInput) error {
	// Verify ownership
	letter, err := s.GetRCVDemandLetter(ctx, demandLetterID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get demand letter: %w", err)
	}
	if letter == nil {
		return fmt.Errorf("demand letter not found")
	}

	// Update letter
	query := `
		UPDATE rcv_demand_letters
		SET sent_at = NOW(), sent_to_email = $1, updated_at = NOW()
		WHERE id = $2
	`

	_, err = s.db.ExecContext(ctx, query, input.SentToEmail, demandLetterID)
	if err != nil {
		return fmt.Errorf("failed to mark demand letter as sent: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"demand_letter_id": demandLetterID,
		"sent_to_email":    input.SentToEmail,
	}
	err = s.logActivity(ctx, letter.ClaimID, userID, "rcv_demand_sent", fmt.Sprintf("RCV demand letter sent to %s", input.SentToEmail), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// Helper: getClaimContext retrieves claim, property, and policy details
func (s *RCVDemandService) getClaimContext(ctx context.Context, claimID string) (map[string]interface{}, error) {
	query := `
		SELECT
			c.claim_number,
			c.loss_type,
			c.incident_date,
			p.nickname,
			p.legal_address,
			pol.policy_number,
			pol.carrier
		FROM claims c
		INNER JOIN properties p ON c.property_id = p.id
		LEFT JOIN insurance_policies pol ON p.id = pol.property_id
		WHERE c.id = $1
	`

	var claimNumber, lossType, propertyNickname, propertyAddress sql.NullString
	var policyNumber, carrier sql.NullString
	var incidentDate sql.NullTime

	err := s.db.QueryRowContext(ctx, query, claimID).Scan(
		&claimNumber,
		&lossType,
		&incidentDate,
		&propertyNickname,
		&propertyAddress,
		&policyNumber,
		&carrier,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get claim context: %w", err)
	}

	context := map[string]interface{}{
		"claim_number":      claimNumber.String,
		"loss_type":         lossType.String,
		"property_nickname": propertyNickname.String,
		"property_address":  propertyAddress.String,
		"policy_number":     policyNumber.String,
		"carrier":           carrier.String,
	}

	if incidentDate.Valid {
		context["incident_date"] = incidentDate.Time.Format("2006-01-02")
	}

	return context, nil
}

// Helper: buildRCVDemandPrompt builds the LLM prompt for demand letter generation
func (s *RCVDemandService) buildRCVDemandPrompt(claimContext map[string]interface{}, acvReceived, rcvExpected, rcvOutstanding float64) string {
	percentageOutstanding := (rcvOutstanding / rcvExpected) * 100

	prompt := fmt.Sprintf(`Generate a professional RCV (Replacement Cost Value) demand letter for an insurance claim.

CLAIM DETAILS:
- Claim Number: %s
- Property: %s (%s)
- Loss Type: %s
- Policy Number: %s
- Carrier: %s

PAYMENT SUMMARY:
- ACV Received: $%.2f
- RCV Expected: $%.2f
- RCV Outstanding: $%.2f (%.1f%% of total RCV)

REQUIREMENTS:
1. Use formal business letter format
2. Include current date
3. Reference claim number and policy prominently
4. Explain that ACV has been received and repairs completed
5. Request the outstanding RCV payment
6. Be professional and respectful but firm
7. Request a response within 30 days
8. Include appropriate closing

Return only the letter content. Do not include any meta-commentary or explanations.`,
		claimContext["claim_number"],
		claimContext["property_nickname"],
		claimContext["property_address"],
		claimContext["loss_type"],
		claimContext["policy_number"],
		claimContext["carrier"],
		acvReceived,
		rcvExpected,
		rcvOutstanding,
		percentageOutstanding,
	)

	return prompt
}

// Helper: saveRCVDemandLetter saves the generated demand letter to database
func (s *RCVDemandService) saveRCVDemandLetter(ctx context.Context, claimID, userID, content string, acvReceived, rcvExpected, rcvOutstanding float64) (string, error) {
	demandLetterID := uuid.New().String()

	query := `
		INSERT INTO rcv_demand_letters (
			id, claim_id, content, acv_received, rcv_expected, rcv_outstanding, created_by_user_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := s.db.ExecContext(
		ctx,
		query,
		demandLetterID,
		claimID,
		content,
		acvReceived,
		rcvExpected,
		rcvOutstanding,
		userID,
	)
	if err != nil {
		return "", fmt.Errorf("failed to save demand letter: %w", err)
	}

	return demandLetterID, nil
}

// Helper: logAPIUsage logs API usage for cost tracking
func (s *RCVDemandService) logAPIUsage(ctx context.Context, demandLetterID string, tokensUsed int) error {
	// Estimate cost based on tokens (rough estimate for Perplexity API)
	// Adjust based on actual API pricing
	estimatedCost := float64(tokensUsed) * 0.000001 // $0.000001 per token (example)

	query := `
		INSERT INTO api_usage_logs (id, api_call_type, tokens_used, estimated_cost)
		VALUES ($1, $2, $3, $4)
	`

	_, err := s.db.ExecContext(
		ctx,
		query,
		uuid.New().String(),
		"rcv_demand_generation",
		tokensUsed,
		estimatedCost,
	)

	return err
}

// Helper: logActivity logs an activity for a claim
func (s *RCVDemandService) logActivity(ctx context.Context, claimID, userID, activityType, description string, metadata map[string]interface{}) error {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		INSERT INTO claim_activities (id, claim_id, user_id, activity_type, description, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		uuid.New().String(),
		claimID,
		userID,
		activityType,
		description,
		string(metadataJSON),
	)

	return err
}
