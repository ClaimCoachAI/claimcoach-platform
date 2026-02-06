package services

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// TestPhase6IntegrationSuccess tests the complete Phase 6 workflow
func TestPhase6IntegrationSuccess(t *testing.T) {
	// Setup database
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Step 1: Create test organization, user, property, policy, claim
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Step 2: Create scope sheet (Task 6.4)
	scopeService := NewScopeSheetService(db)

	roofType := "asphalt_shingles"
	roofSF := 2000
	roofPitch := "6/12"
	fasciaLF := 150

	scopeInput := CreateScopeSheetInput{
		RoofType:          &roofType,
		RoofSquareFootage: &roofSF,
		RoofPitch:         &roofPitch,
		FasciaLF:          &fasciaLF,
		FasciaPaint:       true,
	}

	scopeSheet, err := scopeService.CreateScopeSheet(ctx, claimID, scopeInput)
	require.NoError(t, err)
	require.NotNil(t, scopeSheet)
	assert.NotEmpty(t, scopeSheet.ID)
	assert.Equal(t, claimID, scopeSheet.ClaimID)

	// Submit the scope sheet
	err = scopeService.SubmitScopeSheet(ctx, scopeSheet.ID)
	require.NoError(t, err)

	// Step 3: Generate industry estimate (Task 6.7)
	// Mock LLM response for industry estimate
	industryEstimateJSON := `{
		"line_items": [
			{
				"description": "Remove existing asphalt shingles",
				"quantity": 2000,
				"unit": "SF",
				"unit_cost": 2.50,
				"total": 5000.00,
				"category": "Roofing"
			},
			{
				"description": "Install new asphalt shingles",
				"quantity": 2000,
				"unit": "SF",
				"unit_cost": 4.50,
				"total": 9000.00,
				"category": "Roofing"
			},
			{
				"description": "Paint fascia",
				"quantity": 150,
				"unit": "LF",
				"unit_cost": 3.00,
				"total": 450.00,
				"category": "Exterior Trim"
			}
		],
		"subtotal": 14450.00,
		"overhead_profit": 2890.00,
		"total": 17340.00
	}`

	// Mock comparison response
	comparisonJSON := `{
		"discrepancies": [
			{
				"item": "Install new asphalt shingles",
				"industry_price": 9000.00,
				"carrier_price": 7000.00,
				"delta": 2000.00,
				"justification": "Carrier used outdated pricing. Current market rate for architectural shingles in Austin is $4.50/SF installed."
			},
			{
				"item": "Paint fascia",
				"industry_price": 450.00,
				"carrier_price": 300.00,
				"delta": 150.00,
				"justification": "Carrier underestimated labor. Standard rate for exterior trim painting is $3.00/LF."
			}
		],
		"summary": {
			"total_industry": 17340.00,
			"total_carrier": 14650.00,
			"total_delta": 2690.00
		}
	}`

	// Mock rebuttal response
	rebuttalContent := `Date: February 6, 2026

To: Insurance Adjuster
Re: Claim Review Request - Claim Number TBD

Dear Adjuster,

I am writing to request a reconsideration of the carrier estimate provided for the property damage claim at 123 Test St.

After careful review of the carrier estimate, we have identified significant discrepancies between the carrier's pricing and current industry-standard pricing for the Austin, TX market.

DISCREPANCIES IDENTIFIED:

1. Install new asphalt shingles
   Carrier Estimate: $7,000.00
   Industry Standard: $9,000.00
   Difference: $2,000.00

   Justification: Carrier used outdated pricing. Current market rate for architectural shingles in Austin is $4.50/SF installed.

2. Paint fascia
   Carrier Estimate: $300.00
   Industry Standard: $450.00
   Difference: $150.00

   Justification: Carrier underestimated labor. Standard rate for exterior trim painting is $3.00/LF.

SUMMARY:
Total Carrier Estimate: $14,650.00
Total Industry Standard: $17,340.00
Total Difference: $2,690.00

We respectfully request a meeting to discuss these discrepancies and review the supporting documentation. We believe that adjusting the estimate to reflect current market pricing is fair and appropriate.

Thank you for your time and consideration. I look forward to resolving this matter.

Sincerely,
Property Manager`

	// Setup mock LLM client with testify/mock
	mockLLM := new(MockLLMClient)

	// Mock response for industry estimate generation
	mockLLM.On("Chat", ctx, mock.Anything, 0.2, 2000).Return(&llm.ChatResponse{
		ID:    "test-id-1",
		Model: "mock-model",
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
					Content: industryEstimateJSON,
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     100,
			CompletionTokens: 200,
			TotalTokens:      300,
		},
	}, nil).Once()

	// Mock response for comparison
	mockLLM.On("Chat", ctx, mock.Anything, 0.2, 3000).Return(&llm.ChatResponse{
		ID:    "test-id-2",
		Model: "mock-model",
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
					Content: comparisonJSON,
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     150,
			CompletionTokens: 250,
			TotalTokens:      400,
		},
	}, nil).Once()

	// Mock response for rebuttal generation
	mockLLM.On("Chat", ctx, mock.Anything, 0.3, 2000).Return(&llm.ChatResponse{
		ID:    "test-id-3",
		Model: "mock-model",
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
			PromptTokens:     120,
			CompletionTokens: 180,
			TotalTokens:      300,
		},
	}, nil).Once()

	auditService := NewAuditService(db, mockLLM, scopeService)

	// Generate industry estimate
	reportID, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)
	require.NoError(t, err)
	require.NotEmpty(t, reportID)

	// Verify audit report was created
	auditReport, err := auditService.GetAuditReportByClaimID(ctx, claimID, orgID)
	require.NoError(t, err)
	require.NotNil(t, auditReport)
	assert.Equal(t, reportID, auditReport.ID)
	assert.NotNil(t, auditReport.GeneratedEstimate)
	assert.Contains(t, *auditReport.GeneratedEstimate, "line_items")

	// Step 4: Upload carrier estimate (Task 6.8)
	// Note: In real test, would use storage service. Here we mock the file path.
	carrierEstService := NewCarrierEstimateService(db, nil, NewClaimService(db, NewPropertyService(db)))

	filePath := "organizations/" + orgID + "/claims/" + claimID + "/carrier-estimate/test.pdf"
	fileName := "test_carrier_estimate.pdf"
	fileSize := int64(102400) // 100KB

	carrierEstimate, err := carrierEstService.CreateCarrierEstimate(ctx, claimID, userID, filePath, fileName, fileSize)
	require.NoError(t, err)
	require.NotNil(t, carrierEstimate)
	assert.Equal(t, claimID, carrierEstimate.ClaimID)
	assert.Equal(t, models.ParseStatusPending, carrierEstimate.ParseStatus)

	// Step 5: Parse carrier estimate (Task 6.9) - Mock LLM response
	// Note: In real integration, PDF parser would extract text and call LLM
	// Here we simulate by updating the parsed data directly
	carrierEstimateJSON := `{
		"line_items": [
			{
				"description": "Remove existing asphalt shingles",
				"quantity": 2000,
				"unit": "SF",
				"unit_cost": 2.50,
				"total": 5000.00,
				"category": "Roofing"
			},
			{
				"description": "Install new asphalt shingles",
				"quantity": 2000,
				"unit": "SF",
				"unit_cost": 3.50,
				"total": 7000.00,
				"category": "Roofing"
			},
			{
				"description": "Paint fascia",
				"quantity": 150,
				"unit": "LF",
				"unit_cost": 2.00,
				"total": 300.00,
				"category": "Exterior Trim"
			}
		],
		"total": 14650.00
	}`

	// Update carrier estimate with parsed data
	query := `UPDATE carrier_estimates SET parsed_data = $1, parse_status = $2, parsed_at = $3 WHERE id = $4`
	now := time.Now()
	_, err = db.ExecContext(ctx, query, carrierEstimateJSON, models.ParseStatusCompleted, now, carrierEstimate.ID)
	require.NoError(t, err)

	// Verify parsed data was saved
	carrierEstimates, err := carrierEstService.GetCarrierEstimatesByClaimID(ctx, claimID, orgID)
	require.NoError(t, err)
	require.Len(t, carrierEstimates, 1)
	assert.Equal(t, models.ParseStatusCompleted, carrierEstimates[0].ParseStatus)
	assert.NotNil(t, carrierEstimates[0].ParsedData)

	// Step 6: Compare estimates (Task 6.10)
	err = auditService.CompareEstimates(ctx, auditReport.ID, userID, orgID)
	require.NoError(t, err)

	// Verify comparison data was saved
	auditReport, err = auditService.GetAuditReportByClaimID(ctx, claimID, orgID)
	require.NoError(t, err)
	assert.NotNil(t, auditReport.ComparisonData)
	assert.NotNil(t, auditReport.TotalContractorEstimate)
	assert.NotNil(t, auditReport.TotalCarrierEstimate)
	assert.NotNil(t, auditReport.TotalDelta)
	assert.Equal(t, 17340.00, *auditReport.TotalContractorEstimate)
	assert.Equal(t, 14650.00, *auditReport.TotalCarrierEstimate)
	assert.Equal(t, 2690.00, *auditReport.TotalDelta)

	// Parse and verify comparison data structure
	var comparisonData map[string]interface{}
	err = json.Unmarshal([]byte(*auditReport.ComparisonData), &comparisonData)
	require.NoError(t, err)
	assert.Contains(t, comparisonData, "discrepancies")
	assert.Contains(t, comparisonData, "summary")

	// Step 7: Generate rebuttal (Task 6.11)
	rebuttalID, err := auditService.GenerateRebuttal(ctx, auditReport.ID, userID, orgID)
	require.NoError(t, err)
	require.NotEmpty(t, rebuttalID)

	// Verify rebuttal was saved
	rebuttal, err := auditService.GetRebuttal(ctx, rebuttalID, orgID)
	require.NoError(t, err)
	assert.NotNil(t, rebuttal)
	assert.Equal(t, auditReport.ID, rebuttal.AuditReportID)
	assert.Contains(t, rebuttal.Content, "Insurance Adjuster")
	assert.Contains(t, rebuttal.Content, "discrepancies")

	// Step 8: Verify all data saved correctly
	// Verify scope sheet
	retrievedScope, err := scopeService.GetScopeSheetByClaimID(ctx, claimID)
	require.NoError(t, err)
	assert.Equal(t, scopeSheet.ID, retrievedScope.ID)
	assert.NotNil(t, retrievedScope.SubmittedAt)

	// Verify audit report status
	finalReport, err := auditService.GetAuditReportByClaimID(ctx, claimID, orgID)
	require.NoError(t, err)
	assert.Equal(t, models.AuditStatusCompleted, finalReport.Status)

	// Verify API usage was logged
	var apiLogCount int
	err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM api_usage_logs WHERE organization_id = $1", orgID).Scan(&apiLogCount)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, apiLogCount, 3) // At least 3 API calls (estimate, comparison, rebuttal)

	// Step 9: Verify LLM was called with correct parameters
	mockLLM.AssertExpectations(t) // Verify all expected calls were made
}

// TestPhase6OwnershipChecks verifies that ownership checks work correctly
func TestPhase6OwnershipChecks(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Create org1 with claim
	org1ID := createTestOrg(t, db)
	user1ID := createTestUser(t, db, org1ID)
	property1ID := createTestProperty(t, db, org1ID)
	policy1ID := createTestPolicy(t, db, property1ID, 10000.0)
	claim1ID := createTestClaim(t, db, property1ID, policy1ID, org1ID, user1ID)

	// Create scope sheet for org1
	scopeService := NewScopeSheetService(db)
	roofType := "metal"
	scopeInput := CreateScopeSheetInput{RoofType: &roofType}
	_, err := scopeService.CreateScopeSheet(ctx, claim1ID, scopeInput)
	require.NoError(t, err)

	// Create audit report for org1
	industryEstimateJSON := `{"line_items":[],"total":10000.00}`
	mockLLM := new(MockLLMClient)
	mockLLM.On("Chat", ctx, mock.Anything, mock.Anything, mock.Anything).Return(&llm.ChatResponse{
		ID:    "test-id",
		Model: "mock-model",
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
					Content: industryEstimateJSON,
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     100,
			CompletionTokens: 200,
			TotalTokens:      300,
		},
	}, nil)
	auditService := NewAuditService(db, mockLLM, scopeService)

	reportID, err := auditService.GenerateIndustryEstimate(ctx, claim1ID, user1ID, org1ID)
	require.NoError(t, err)

	// Create org2
	org2ID := createTestOrg(t, db)
	user2ID := createTestUser(t, db, org2ID)

	// Try to access org1's audit report from org2 (should fail)
	_, err = auditService.GetAuditReportByClaimID(ctx, claim1ID, org2ID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "audit report not found")

	// Try to compare estimates from org2 (should fail)
	err = auditService.CompareEstimates(ctx, reportID, user2ID, org2ID)
	assert.Error(t, err)

	// Try to generate rebuttal from org2 (should fail)
	_, err = auditService.GenerateRebuttal(ctx, reportID, user2ID, org2ID)
	assert.Error(t, err)

	// Verify org1 can still access their data
	report, err := auditService.GetAuditReportByClaimID(ctx, claim1ID, org1ID)
	require.NoError(t, err)
	assert.Equal(t, reportID, report.ID)
}

// TestPhase6ErrorHandling tests error scenarios
func TestPhase6ErrorHandling(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()

	// Setup
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	scopeService := NewScopeSheetService(db)
	mockLLM := new(MockLLMClient)
	auditService := NewAuditService(db, mockLLM, scopeService)

	// Test: Generate industry estimate without scope sheet (should fail)
	_, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "scope sheet not found")

	// Create scope sheet
	roofType := "tile"
	scopeInput := CreateScopeSheetInput{RoofType: &roofType}
	_, err = scopeService.CreateScopeSheet(ctx, claimID, scopeInput)
	require.NoError(t, err)

	// Test: Generate estimate with invalid JSON response
	mockLLM.On("Chat", ctx, mock.Anything, mock.Anything, mock.Anything).Return(&llm.ChatResponse{
		ID:    "test-id",
		Model: "mock-model",
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
					Content: "not valid json",
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     100,
			CompletionTokens: 200,
			TotalTokens:      300,
		},
	}, nil).Once()

	_, err = auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid JSON")

	// Test: Compare estimates without industry estimate
	validJSON := `{"line_items":[],"total":10000.00}`
	mockLLM.On("Chat", ctx, mock.Anything, mock.Anything, mock.Anything).Return(&llm.ChatResponse{
		ID:    "test-id-2",
		Model: "mock-model",
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
					Content: validJSON,
				},
			},
		},
		Usage: struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		}{
			PromptTokens:     100,
			CompletionTokens: 200,
			TotalTokens:      300,
		},
	}, nil).Once()

	reportID, err := auditService.GenerateIndustryEstimate(ctx, claimID, userID, orgID)
	require.NoError(t, err)

	// Try to compare without carrier estimate
	err = auditService.CompareEstimates(ctx, reportID, userID, orgID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "carrier estimate not found")

	// Test: Generate rebuttal without comparison data
	_, err = auditService.GenerateRebuttal(ctx, reportID, userID, orgID)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "comparison data not available")
}

// TestPhase6MissingScope verifies handling of missing scope sheet
func TestPhase6MissingScope(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()

	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	scopeService := NewScopeSheetService(db)

	// Try to get non-existent scope sheet
	scopeSheet, err := scopeService.GetScopeSheetByClaimID(ctx, claimID)
	require.NoError(t, err)
	assert.Nil(t, scopeSheet)

	// Try to submit non-existent scope sheet
	err = scopeService.SubmitScopeSheet(ctx, "non-existent-id")
	assert.Error(t, err)
}

// TestPhase6CarrierEstimateValidation tests carrier estimate validation
func TestPhase6CarrierEstimateValidation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()

	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	carrierEstService := NewCarrierEstimateService(db, nil, NewClaimService(db, NewPropertyService(db)))

	// Create carrier estimate with empty file path (should fail)
	_, err := carrierEstService.CreateCarrierEstimate(ctx, claimID, userID, "", "test.pdf", 1024)
	assert.Error(t, err)

	// Create carrier estimate with valid data
	filePath := "organizations/" + orgID + "/claims/" + claimID + "/carrier-estimate/test.pdf"
	estimate, err := carrierEstService.CreateCarrierEstimate(ctx, claimID, userID, filePath, "test.pdf", 1024)
	require.NoError(t, err)
	assert.NotNil(t, estimate)

	// Verify multiple carrier estimates can exist for same claim
	estimate2, err := carrierEstService.CreateCarrierEstimate(ctx, claimID, userID, filePath+"2", "test2.pdf", 2048)
	require.NoError(t, err)
	assert.NotNil(t, estimate2)

	// Verify both are returned
	estimates, err := carrierEstService.GetCarrierEstimatesByClaimID(ctx, claimID, orgID)
	require.NoError(t, err)
	assert.Len(t, estimates, 2)
}
