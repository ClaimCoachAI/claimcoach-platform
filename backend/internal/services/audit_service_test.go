package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
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

func TestCompareEstimates_Success(t *testing.T) {
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
	input := CreateScopeSheetInput{
		RoofType:          &roofType,
		RoofSquareFootage: &roofSquareFootage,
	}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create industry estimate
	industryEstimateJSON := `{
		"line_items": [
			{"description": "Roof shingles", "quantity": 20, "unit": "square", "unit_cost": 350.00, "total": 7000.00, "category": "Roofing"}
		],
		"subtotal": 7000.00,
		"overhead_profit": 1400.00,
		"total": 8400.00
	}`

	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// Create carrier estimate
	carrierEstimateJSON := `{
		"line_items": [
			{"description": "Roof shingles", "quantity": 20, "unit": "square", "unit_cost": 300.00, "total": 6000.00, "category": "Roofing"}
		],
		"subtotal": 6000.00,
		"overhead_profit": 1200.00,
		"total": 7200.00
	}`

	carrierEstimateID := createTestCarrierEstimate(t, db, claimID, userID, carrierEstimateJSON)
	assert.NotEmpty(t, carrierEstimateID)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)

	// Prepare comparison response
	comparisonResponse := map[string]interface{}{
		"discrepancies": []map[string]interface{}{
			{
				"item":            "Roof shingles",
				"industry_price":  7000.00,
				"carrier_price":   6000.00,
				"delta":           1000.00,
				"justification":   "Industry standard pricing for high-quality shingles",
			},
		},
		"summary": map[string]interface{}{
			"total_industry": 8400.00,
			"total_carrier":  7200.00,
			"total_delta":    1200.00,
		},
	}

	comparisonJSONBytes, _ := json.Marshal(comparisonResponse)
	mockResponse := &llm.ChatResponse{
		ID:    "test-comparison-id",
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
					Content: string(comparisonJSONBytes),
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     600,
			CompletionTokens: 400,
			TotalTokens:      1000,
		},
	}

	// Set up mock expectation
	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.2, 3000).Return(mockResponse, nil)

	// Create audit service
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	err = auditService.CompareEstimates(ctx, auditReportID, userID, orgID)

	// Assert
	assert.NoError(t, err)

	// Verify the audit report was updated
	var updatedReport struct {
		ComparisonData          *string
		TotalContractorEstimate *float64
		TotalCarrierEstimate    *float64
		TotalDelta              *float64
		Status                  string
	}
	query := `SELECT comparison_data, total_contractor_estimate, total_carrier_estimate, total_delta, status
	          FROM audit_reports WHERE id = $1`
	err = db.QueryRowContext(ctx, query, auditReportID).Scan(
		&updatedReport.ComparisonData,
		&updatedReport.TotalContractorEstimate,
		&updatedReport.TotalCarrierEstimate,
		&updatedReport.TotalDelta,
		&updatedReport.Status,
	)
	assert.NoError(t, err)
	assert.NotNil(t, updatedReport.ComparisonData)
	assert.Equal(t, 8400.00, *updatedReport.TotalContractorEstimate)
	assert.Equal(t, 7200.00, *updatedReport.TotalCarrierEstimate)
	assert.Equal(t, 1200.00, *updatedReport.TotalDelta)
	assert.Equal(t, models.AuditStatusCompleted, updatedReport.Status)

	// Verify comparison JSON content
	var parsedComparison map[string]interface{}
	err = json.Unmarshal([]byte(*updatedReport.ComparisonData), &parsedComparison)
	assert.NoError(t, err)
	assert.NotNil(t, parsedComparison["discrepancies"])
	assert.NotNil(t, parsedComparison["summary"])

	// Verify mock was called
	mockLLM.AssertExpectations(t)
}

func TestCompareEstimates_NoIndustryEstimate(t *testing.T) {
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
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report WITHOUT industry estimate
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, "")

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	err = auditService.CompareEstimates(ctx, auditReportID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "industry estimate not generated yet")
}

func TestCompareEstimates_NoCarrierEstimate(t *testing.T) {
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
	input := CreateScopeSheetInput{
		RoofType: &roofType,
	}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report with industry estimate
	industryEstimateJSON := `{"total": 10000.00}`
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// DO NOT create carrier estimate

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	err = auditService.CompareEstimates(ctx, auditReportID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "carrier estimate not found")
}

func TestCompareEstimates_CarrierEstimateNotParsed(t *testing.T) {
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
	input := CreateScopeSheetInput{
		RoofType: &roofType,
	}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report with industry estimate
	industryEstimateJSON := `{"total": 10000.00}`
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// Create carrier estimate WITHOUT parsed data
	carrierEstimateID := createTestCarrierEstimate(t, db, claimID, userID, "")
	assert.NotEmpty(t, carrierEstimateID)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	err = auditService.CompareEstimates(ctx, auditReportID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "carrier estimate not parsed yet")
}

func TestCompareEstimates_AuditReportNotFound(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	scopeService := NewScopeSheetService(db)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test with non-existent audit report ID
	ctx := context.Background()
	err := auditService.CompareEstimates(ctx, "non-existent-id", userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "audit report not found")
}

// Helper function to create test audit report
func createTestAuditReport(t *testing.T, db *sql.DB, claimID, scopeSheetID, userID, estimateJSON string) string {
	reportID := uuid.New().String()
	now := time.Now()

	var generatedEstimate *string
	if estimateJSON != "" {
		generatedEstimate = &estimateJSON
	}

	query := `
		INSERT INTO audit_reports (
			id, claim_id, scope_sheet_id, generated_estimate,
			status, created_by_user_id, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`

	var returnedID string
	err := db.QueryRow(
		query,
		reportID,
		claimID,
		scopeSheetID,
		generatedEstimate,
		models.AuditStatusCompleted,
		userID,
		now,
		now,
	).Scan(&returnedID)

	assert.NoError(t, err)
	return returnedID
}

// Helper function to create test carrier estimate
func createTestCarrierEstimate(t *testing.T, db *sql.DB, claimID, userID, parsedJSON string) string {
	estimateID := uuid.New().String()
	now := time.Now()

	var parsedData *string
	parseStatus := models.ParseStatusPending
	if parsedJSON != "" {
		parsedData = &parsedJSON
		parseStatus = models.ParseStatusCompleted
	}

	query := `
		INSERT INTO carrier_estimates (
			id, claim_id, uploaded_by_user_id, file_path, file_name,
			parsed_data, parse_status, uploaded_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`

	var returnedID string
	err := db.QueryRow(
		query,
		estimateID,
		claimID,
		userID,
		"test/path.pdf",
		"test.pdf",
		parsedData,
		parseStatus,
		now,
	).Scan(&returnedID)

	assert.NoError(t, err)
	return returnedID
}
