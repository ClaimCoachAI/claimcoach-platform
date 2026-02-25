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
	input := CreateScopeSheetInput{
		Areas: []models.ScopeArea{
			{
				Category:   "Roofing",
				Tags:       []string{"asphalt_shingles", "6/12", "Shingles_Damaged"},
				Dimensions: map[string]float64{"square_footage": 2000},
			},
			{
				Category:   "Exterior Trim",
				Tags:       []string{"fascia_damaged", "fascia_paint"},
				Dimensions: map[string]float64{"length": 150},
			},
		},
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
	input := CreateScopeSheetInput{
		Areas: []models.ScopeArea{{Category: "Roofing", Tags: []string{"metal_roof"}}},
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
	auditService := &AuditService{db: nil, llmClient: nil}

	notes := "Additional damage to fascia boards"
	scopeSheet := &models.ScopeSheet{
		Areas: []models.ScopeArea{
			{
				Category:   "Roofing",
				Tags:       []string{"asphalt_shingles", "8/12", "Shingles_Damaged"},
				Dimensions: map[string]float64{"square_footage": 2500},
				Notes:      "Steep pitch, full replacement needed",
			},
			{
				Category:   "Exterior Trim",
				Tags:       []string{"fascia_damaged", "fascia_paint"},
				Dimensions: map[string]float64{"length": 200},
			},
		},
		GeneralNotes: &notes,
	}

	prompt := auditService.buildEstimatePrompt(scopeSheet)

	assert.NotEmpty(t, prompt)
	assert.Contains(t, prompt, "asphalt_shingles")
	assert.Contains(t, prompt, "2500")
	assert.Contains(t, prompt, "8/12")
	assert.Contains(t, prompt, "200")
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
	input := CreateScopeSheetInput{
		Areas: []models.ScopeArea{
			{Category: "Roofing", Tags: []string{"asphalt_shingles"}, Dimensions: map[string]float64{"square_footage": 2000}},
		},
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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

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

func TestGenerateRebuttal_Success(t *testing.T) {
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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report with comparison data
	industryEstimateJSON := `{"total": 8400.00}`
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// Add comparison data to the audit report
	comparisonData := map[string]interface{}{
		"discrepancies": []map[string]interface{}{
			{
				"item":            "Roof shingles",
				"industry_price":  7000.00,
				"carrier_price":   6000.00,
				"delta":           1000.00,
				"justification":   "Industry standard pricing for high-quality materials",
			},
		},
		"summary": map[string]interface{}{
			"total_industry": 8400.00,
			"total_carrier":  7200.00,
			"total_delta":    1200.00,
		},
	}
	comparisonJSON, _ := json.Marshal(comparisonData)
	updateQuery := `UPDATE audit_reports SET comparison_data = $1, total_contractor_estimate = $2,
	                total_carrier_estimate = $3, total_delta = $4 WHERE id = $5`
	_, err = db.Exec(updateQuery, string(comparisonJSON), 8400.00, 7200.00, 1200.00, auditReportID)
	assert.NoError(t, err)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)

	// Prepare rebuttal response
	rebuttalContent := `Date: January 15, 2026

To: Insurance Adjuster
Subject: Request for Reconsideration - Claim #12345

Dear Adjuster,

I am writing to request a reconsideration of the estimate provided for the property damage claim at 123 Main Street.

After careful review and comparison with industry-standard pricing, we have identified the following discrepancies:

1. Roof Shingles:
   - Industry Standard Price: $7,000.00
   - Carrier Estimate: $6,000.00
   - Difference: $1,000.00
   - Justification: Industry standard pricing for high-quality materials reflects current market rates for comparable materials and labor.

The total difference between the industry-standard estimate ($8,400.00) and the carrier estimate ($7,200.00) is $1,200.00.

We respectfully request a meeting to discuss these discrepancies and work toward a fair resolution.

Thank you for your consideration.

Sincerely,`

	mockResponse := &llm.ChatResponse{
		ID:    "test-rebuttal-id",
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
					Content: rebuttalContent,
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     800,
			CompletionTokens: 500,
			TotalTokens:      1300,
		},
	}

	// Set up mock expectation
	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.3, 2000).Return(mockResponse, nil)

	// Create audit service
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	rebuttalID, err := auditService.GenerateRebuttal(ctx, auditReportID, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.NotEmpty(t, rebuttalID)

	// Verify the rebuttal was created
	var rebuttal models.Rebuttal
	query := `SELECT id, audit_report_id, content FROM rebuttals WHERE id = $1`
	err = db.QueryRowContext(ctx, query, rebuttalID).Scan(
		&rebuttal.ID,
		&rebuttal.AuditReportID,
		&rebuttal.Content,
	)
	assert.NoError(t, err)
	assert.Equal(t, auditReportID, rebuttal.AuditReportID)
	assert.Contains(t, rebuttal.Content, "Request for Reconsideration")
	assert.Contains(t, rebuttal.Content, "$1,200.00")
	assert.Contains(t, rebuttal.Content, "Roof Shingles")

	// Verify API usage was logged
	var apiLogCount int
	logCountQuery := `SELECT COUNT(*) FROM api_usage_logs WHERE organization_id = $1`
	err = db.QueryRowContext(ctx, logCountQuery, orgID).Scan(&apiLogCount)
	assert.NoError(t, err)
	assert.Greater(t, apiLogCount, 0)

	// Verify mock was called
	mockLLM.AssertExpectations(t)
}

func TestGenerateRebuttal_NoComparisonData(t *testing.T) {
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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report WITHOUT comparison data
	industryEstimateJSON := `{"total": 8400.00}`
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	rebuttalID, err := auditService.GenerateRebuttal(ctx, auditReportID, userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Empty(t, rebuttalID)
	assert.Contains(t, err.Error(), "comparison data not available")
}

func TestGenerateRebuttal_AuditReportNotFound(t *testing.T) {
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

	// Test with non-existent audit report
	ctx := context.Background()
	rebuttalID, err := auditService.GenerateRebuttal(ctx, "non-existent-id", userID, orgID)

	// Assert
	assert.Error(t, err)
	assert.Empty(t, rebuttalID)
	assert.Contains(t, err.Error(), "audit report not found")
}

func TestGetRebuttal_Success(t *testing.T) {
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
	input := CreateScopeSheetInput{Areas: []models.ScopeArea{}}

	ctx := context.Background()
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, input)
	assert.NoError(t, err)

	// Create audit report
	industryEstimateJSON := `{"total": 8400.00}`
	auditReportID := createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, industryEstimateJSON)

	// Create rebuttal directly
	rebuttalID := uuid.New().String()
	rebuttalContent := "Test rebuttal letter content"
	now := time.Now()
	insertQuery := `INSERT INTO rebuttals (id, audit_report_id, content, created_at, updated_at)
	                VALUES ($1, $2, $3, $4, $5)`
	_, err = db.Exec(insertQuery, rebuttalID, auditReportID, rebuttalContent, now, now)
	assert.NoError(t, err)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test
	rebuttal, err := auditService.GetRebuttal(ctx, rebuttalID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, rebuttal)
	assert.Equal(t, rebuttalID, rebuttal.ID)
	assert.Equal(t, auditReportID, rebuttal.AuditReportID)
	assert.Equal(t, rebuttalContent, rebuttal.Content)
}

func TestGetRebuttal_NotFound(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	// Create test data
	orgID := createTestOrg(t, db)

	// Create mock LLM client
	mockLLM := new(MockLLMClient)
	scopeService := NewScopeSheetService(db)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test with non-existent rebuttal
	ctx := context.Background()
	rebuttal, err := auditService.GetRebuttal(ctx, "non-existent-id", orgID)

	// Assert
	assert.Error(t, err)
	assert.Nil(t, rebuttal)
	assert.Contains(t, err.Error(), "rebuttal not found")
}

// ---- Viability Analysis test helpers ----

// createTestPolicyWithExclusions creates a test policy with an exclusions text block
func createTestPolicyWithExclusions(t *testing.T, db *sql.DB, propertyID string, deductible float64, exclusions string) string {
	t.Helper()

	policyID := uuid.New().String()
	query := `INSERT INTO insurance_policies (id, property_id, carrier_name, deductible_value, exclusions, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`
	_, err := db.Exec(query, policyID, propertyID, "Test Insurance Co", deductible, exclusions)
	if err != nil {
		t.Fatalf("Failed to create test policy with exclusions: %v", err)
	}
	return policyID
}

// createTestClaimWithLossType creates a test claim with a specified loss type
func createTestClaimWithLossType(t *testing.T, db *sql.DB, propertyID, policyID, userID, lossType string) string {
	t.Helper()

	claimID := uuid.New().String()
	query := `INSERT INTO claims (id, property_id, policy_id, loss_type, incident_date, status, created_by_user_id, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`
	incidentDate := time.Now().Add(-48 * time.Hour)
	_, err := db.Exec(query, claimID, propertyID, policyID, lossType, incidentDate, "draft", userID)
	if err != nil {
		t.Fatalf("Failed to create test claim with loss type: %v", err)
	}
	return claimID
}

// makeMockViabilityResponse builds a reusable llm.ChatResponse for viability tests
func makeMockViabilityResponse(content string) *llm.ChatResponse {
	return &llm.ChatResponse{
		ID:    "test-viability-id",
		Model: "claude-sonnet-4-6",
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
				}{Role: "assistant", Content: content},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{PromptTokens: 350, CompletionTokens: 180, TotalTokens: 530},
	}
}

// ---- Viability Analysis tests ----

func TestAnalyzeClaimViability_PURSUE(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	// Hail loss, $5,000 deductible, exclusions irrelevant to hail
	policyID := createTestPolicyWithExclusions(t, db, propertyID, 5000.0, "Flood damage is excluded")
	claimID := createTestClaimWithLossType(t, db, propertyID, policyID, userID, "Hail")

	// Estimate total = $25,000 → net_recovery = $20,000 → economics score 85
	scopeService := NewScopeSheetService(db)
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, CreateScopeSheetInput{Areas: []models.ScopeArea{}})
	assert.NoError(t, err)
	estimateJSON := `{"line_items":[],"subtotal":20833,"overhead_profit":4167,"total":25000}`
	createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, estimateJSON)

	// LLM mock: returns PURSUE
	llmResult := map[string]interface{}{
		"recommendation":         "PURSUE",
		"net_estimated_recovery": 20000.0,
		"coverage_score":         100,
		"economics_score":        85,
		"top_risks":              []string{},
		"required_next_steps":    []string{},
		"plain_english_summary":  "Strong hail claim. Net recovery well exceeds deductible with no applicable exclusions.",
	}
	responseBytes, _ := json.Marshal(llmResult)
	mockLLM := new(MockLLMClient)
	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.1, 1000).
		Return(makeMockViabilityResponse(string(responseBytes)), nil)

	auditService := NewAuditService(db, mockLLM, scopeService)
	analysis, err := auditService.AnalyzeClaimViability(ctx, claimID, orgID)

	assert.NoError(t, err)
	assert.NotNil(t, analysis)
	assert.Equal(t, "PURSUE", analysis.Recommendation)
	assert.Equal(t, 85, analysis.EconomicsScore)
	assert.Equal(t, 100, analysis.CoverageScore)
	assert.InDelta(t, 20000.0, analysis.NetEstimatedRecovery, 0.01)
	assert.NotEmpty(t, analysis.PlainEnglishSummary)
	mockLLM.AssertExpectations(t)
}

func TestAnalyzeClaimViability_PursueWithConditions(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	// Water loss with flood exclusion — coverage risk applies
	policyID := createTestPolicyWithExclusions(t, db, propertyID, 3000.0, "Flood and surface water damage excluded")
	claimID := createTestClaimWithLossType(t, db, propertyID, policyID, userID, "Water")

	// Estimate total = $14,000 → net_recovery = $11,000 → economics score 60
	scopeService := NewScopeSheetService(db)
	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, CreateScopeSheetInput{Areas: []models.ScopeArea{}})
	assert.NoError(t, err)
	estimateJSON := `{"line_items":[],"subtotal":11667,"overhead_profit":2333,"total":14000}`
	createTestAuditReport(t, db, claimID, scopeSheet.ID, userID, estimateJSON)

	// LLM mock: returns PURSUE_WITH_CONDITIONS (water risk + ambiguous exclusion lowers coverage score)
	llmResult := map[string]interface{}{
		"recommendation":         "PURSUE_WITH_CONDITIONS",
		"net_estimated_recovery": 11000.0,
		"coverage_score":         50,
		"economics_score":        60,
		"top_risks":              []string{"Water loss carries seepage risk", "Flood exclusion may apply depending on cause"},
		"required_next_steps":    []string{"Upload plumber report confirming sudden discharge"},
		"plain_english_summary":  "Damages exceed deductible, but water claims carry coverage risk. Get plumber report first.",
	}
	responseBytes, _ := json.Marshal(llmResult)
	mockLLM := new(MockLLMClient)
	mockLLM.On("Chat", ctx, mock.AnythingOfType("[]llm.Message"), 0.1, 1000).
		Return(makeMockViabilityResponse(string(responseBytes)), nil)

	auditService := NewAuditService(db, mockLLM, scopeService)
	analysis, err := auditService.AnalyzeClaimViability(ctx, claimID, orgID)

	assert.NoError(t, err)
	assert.NotNil(t, analysis)
	assert.Equal(t, "PURSUE_WITH_CONDITIONS", analysis.Recommendation)
	assert.Equal(t, 50, analysis.CoverageScore)
	assert.Equal(t, 60, analysis.EconomicsScore)
	assert.NotEmpty(t, analysis.RequiredNextSteps)
	assert.NotEmpty(t, analysis.TopRisks)
	mockLLM.AssertExpectations(t)
}

func TestAnalyzeClaimViability_ClaimNotFound(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	orgID := createTestOrg(t, db)
	mockLLM := new(MockLLMClient)
	scopeService := NewScopeSheetService(db)
	auditService := NewAuditService(db, mockLLM, scopeService)

	analysis, err := auditService.AnalyzeClaimViability(ctx, "non-existent-claim-id", orgID)

	assert.Error(t, err)
	assert.Nil(t, analysis)
	assert.Contains(t, err.Error(), "claim not found")
}

func TestAnalyzeClaimViability_NoEstimate(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()
	ctx := context.Background()

	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 5000.0)
	claimID := createTestClaimWithLossType(t, db, propertyID, policyID, userID, "Hail")
	// Intentionally no audit_report created

	mockLLM := new(MockLLMClient)
	scopeService := NewScopeSheetService(db)
	auditService := NewAuditService(db, mockLLM, scopeService)

	analysis, err := auditService.AnalyzeClaimViability(ctx, claimID, orgID)

	assert.Error(t, err)
	assert.Nil(t, analysis)
	assert.Contains(t, err.Error(), "no generated estimate found")
}

func TestBuildViabilityPrompt(t *testing.T) {
	auditService := &AuditService{db: nil, llmClient: nil}

	inputs := &viabilityInputs{
		lossType:        "Water",
		incidentDate:    time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC),
		totalRCV:        15000.0,
		deductibleValue: 3600.0,
		exclusions:      "Flood and surface water damage excluded",
	}

	prompt := auditService.buildViabilityPrompt(inputs)

	assert.Contains(t, prompt, "Water")
	assert.Contains(t, prompt, "$15000.00")
	assert.Contains(t, prompt, "$3600.00")
	assert.Contains(t, prompt, "Flood and surface water damage excluded")
	assert.Contains(t, prompt, "ECONOMICS SCORE")
	assert.Contains(t, prompt, "COVERAGE RISK SCORE")
	assert.Contains(t, prompt, "PURSUE")
	assert.Contains(t, prompt, "PURSUE_WITH_CONDITIONS")
	assert.Contains(t, prompt, "DO_NOT_PURSUE")
	assert.Contains(t, prompt, "net_estimated_recovery")
	assert.Contains(t, prompt, "plain_english_summary")
}
