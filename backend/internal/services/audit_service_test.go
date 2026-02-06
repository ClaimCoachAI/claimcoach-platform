package services

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockLLMClient is a mock implementation of the LLM client for testing
type MockLLMClient struct {
	mock.Mock
}

func (m *MockLLMClient) Chat(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
	args := m.Called(ctx, messages, temperature, maxTokens)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*llm.ChatResponse), args.Error(1)
}

func TestGenerateIndustryEstimate_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create scope sheet
	scopeService := NewScopeSheetService(db)
	roofType := "asphalt_shingles"
	roofSquareFootage := 2000
	roofPitch := "6/12"
	fasciaLF := 150

	input := CreateScopeSheetInput{
		RoofType:          &roofType,
		RoofSquareFootage: &roofSquareFootage,
		RoofPitch:         &roofPitch,
		FasciaLF:          &fasciaLF,
		FasciaPaint:       true,
	}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)

	// Prepare mock response with valid JSON estimate
	estimateJSON := map[string]interface{}{
		"line_items": []map[string]interface{}{
			{
				"description": "Roof shingle replacement",
				"quantity":    20,
				"unit":        "square",
				"unit_cost":   350.00,
				"total":       7000.00,
				"category":    "Roofing",
			},
			{
				"description": "Fascia board replacement",
				"quantity":    150,
				"unit":        "LF",
				"unit_cost":   12.50,
				"total":       1875.00,
				"category":    "Exterior Trim",
			},
		},
		"subtotal":        8875.00,
		"overhead_profit": 1775.00,
		"total":           10650.00,
	}

	estimateJSONBytes, _ := json.Marshal(estimateJSON)
	mockResponse := &llm.ChatResponse{
		ID:    "test-response-id",
		Model: "llama-3.1-sonar-large-128k-online",
		Choices: []struct {
			Index   int `json:"index"`
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
		}{
			{
				Index: 0,
				Message: struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				}{
					Role:    "assistant",
					Content: string(estimateJSONBytes),
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     500,
			CompletionTokens: 800,
			TotalTokens:      1300,
		},
	}

	// Set up mock expectation
	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.2, 2000).Return(mockResponse, nil)

	// Create audit service with mock LLM client
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	reportID, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.NotEmpty(t, reportID)

	// Verify the audit report was created
	var auditReport models.AuditReport
	query := `SELECT id, claim_id, scope_sheet_id, generated_estimate, status FROM audit_reports WHERE id = $1`
	err = db.QueryRowContext(ctx, query, reportID).Scan(
		&auditReport.ID,
		&auditReport.ClaimID,
		&auditReport.ScopeSheetID,
		&auditReport.GeneratedEstimate,
		&auditReport.Status,
	)
	assert.NoError(t, err)
	assert.Equal(t, claimID, auditReport.ClaimID)
	assert.Equal(t, scopeSheet.ID, auditReport.ScopeSheetID)
	assert.NotNil(t, auditReport.GeneratedEstimate)
	assert.Equal(t, models.AuditStatusCompleted, auditReport.Status)

	// Verify JSON content
	var parsedEstimate map[string]interface{}
	err = json.Unmarshal([]byte(*auditReport.GeneratedEstimate), &parsedEstimate)
	assert.NoError(t, err)
	assert.Equal(t, 10650.00, parsedEstimate["total"])
	assert.NotNil(t, parsedEstimate["line_items"])

	// Verify API usage was logged
	var apiLog struct {
		Model            string
		PromptTokens     int
		CompletionTokens int
		TotalTokens      int
		EstimatedCost    float64
	}
	logQuery := `SELECT model, prompt_tokens, completion_tokens, total_tokens, estimated_cost
	             FROM api_usage_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`
	err = db.QueryRowContext(ctx, logQuery, orgID).Scan(
		&apiLog.Model,
		&apiLog.PromptTokens,
		&apiLog.CompletionTokens,
		&apiLog.TotalTokens,
		&apiLog.EstimatedCost,
	)
	assert.NoError(t, err)
	assert.Equal(t, "llama-3.1-sonar-large-128k-online", apiLog.Model)
	assert.Equal(t, 500, apiLog.PromptTokens)
	assert.Equal(t, 800, apiLog.CompletionTokens)
	assert.Equal(t, 1300, apiLog.TotalTokens)
	assert.Greater(t, apiLog.EstimatedCost, 0.0)

	// Verify mock was called correctly
	mockLLM.AssertExpectations(t)
}

func TestGenerateIndustryEstimate_NoScopeSheet(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data (but no scope sheet)
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create mock LLM client and services
	mockLLM := new(MockLLMClient)
	scopeService := NewScopeSheetService(db)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	ctx := context.Background()
	reportID, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Empty(t, reportID)
	assert.Contains(t, err.Error(), "scope sheet not found")
}

func TestGenerateIndustryEstimate_InvalidJSON(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Create scope sheet
	scopeService := NewScopeSheetService(db)
	roofType := "metal"
	input := CreateScopeSheetInput{
		RoofType: &roofType,
	}

	ctx := context.Background()
	_, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create mock LLM client with invalid JSON response
	mockLLM := new(MockLLMClient)
	mockResponse := &llm.ChatResponse{
		ID:    "test-response-id",
		Model: "llama-3.1-sonar-large-128k-online",
		Choices: []struct {
			Index   int `json:"index"`
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
		}{
			{
				Index: 0,
				Message: struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				}{
					Role:    "assistant",
					Content: "This is not valid JSON",
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     100,
			CompletionTokens: 50,
			TotalTokens:      150,
		},
	}

	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.2, 2000).Return(mockResponse, nil)

	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	reportID, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Empty(t, reportID)
	assert.Contains(t, err.Error(), "invalid JSON")

	mockLLM.AssertExpectations(t)
}

func TestBuildEstimatePrompt(t *testing.T) {
	// Setup - no database needed for this test
	mockLLM := new(MockLLMClient)
	auditService := &AuditService{
		db:        nil,
		llmClient: mockLLM,
	}

	// Create scope sheet with various fields
	roofType := "asphalt_shingles"
	roofSquareFootage := 2500
	roofPitch := "8/12"
	fasciaLF := 200
	notes := "Additional damage to fascia boards"

	scopeSheet := &models.ScopeSheet{
		RoofType:          &roofType,
		RoofSquareFootage: &roofSquareFootage,
		RoofPitch:         &roofPitch,
		FasciaLF:          &fasciaLF,
		FasciaPaint:       true,
		Notes:             &notes,
	}

	// Test
	prompt := auditService.buildEstimatePrompt(scopeSheet)

	// Assert
	assert.NotEmpty(t, prompt)
	assert.Contains(t, prompt, "asphalt_shingles")
	assert.Contains(t, prompt, "2500")
	assert.Contains(t, prompt, "8/12")
	assert.Contains(t, prompt, "200")
	assert.Contains(t, prompt, "fascia_paint: true")
	assert.Contains(t, prompt, "Additional damage to fascia boards")
	assert.Contains(t, prompt, "Xactimate-style estimate")
	assert.Contains(t, prompt, "JSON")
	assert.Contains(t, prompt, "line_items")
	assert.Contains(t, prompt, "category")
	assert.Contains(t, prompt, "overhead_profit")
}
