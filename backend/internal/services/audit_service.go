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
