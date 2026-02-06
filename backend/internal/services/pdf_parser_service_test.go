package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/stretchr/testify/assert"
)

// MockStorageClient for testing
type MockStorageClient struct {
	DownloadURLFunc func(filePath string) (string, error)
}

func (m *MockStorageClient) GenerateDownloadURL(filePath string) (string, error) {
	if m.DownloadURLFunc != nil {
		return m.DownloadURLFunc(filePath)
	}
	return "https://example.com/download", nil
}

func (m *MockStorageClient) GenerateUploadURL(organizationID, claimID, documentType, fileName string) (string, string, error) {
	return "", "", nil
}

func (m *MockStorageClient) DeleteFile(filePath string) error {
	return nil
}

func (m *MockStorageClient) GetPublicURL(filePath string) string {
	return ""
}

// MockPerplexityClient for testing
type MockPerplexityClient struct {
	ChatFunc func(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error)
}

func (m *MockPerplexityClient) Chat(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
	if m.ChatFunc != nil {
		return m.ChatFunc(ctx, messages, temperature, maxTokens)
	}
	return nil, errors.New("not implemented")
}

// MockClaimService for testing
type MockClaimService struct {
	GetClaimFunc func(claimID, organizationID string) (*models.Claim, error)
}

func (m *MockClaimService) GetClaim(claimID, organizationID string) (*models.Claim, error) {
	if m.GetClaimFunc != nil {
		return m.GetClaimFunc(claimID, organizationID)
	}
	return &models.Claim{ID: claimID}, nil
}

func TestGetCarrierEstimate(t *testing.T) {
	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	service := &PDFParserService{
		db: db,
	}

	estimateID := "est-123"
	claimID := "claim-123"

	t.Run("success", func(t *testing.T) {
		var fileSize int64 = 1024
		uploadedAt := time.Now()

		rows := sqlmock.NewRows([]string{
			"id", "claim_id", "uploaded_by_user_id", "file_path", "file_name",
			"file_size_bytes", "parsed_data", "parse_status", "parse_error",
			"uploaded_at", "parsed_at",
		}).AddRow(
			estimateID, claimID, "user-123", "/path/to/file.pdf", "estimate.pdf",
			fileSize, nil, models.ParseStatusPending, nil,
			uploadedAt, nil,
		)

		mock.ExpectQuery("SELECT (.+) FROM carrier_estimates").
			WithArgs(estimateID).
			WillReturnRows(rows)

		estimate, err := service.getCarrierEstimate(context.Background(), estimateID)
		assert.NoError(t, err)
		assert.NotNil(t, estimate)
		assert.Equal(t, estimateID, estimate.ID)
		assert.Equal(t, claimID, estimate.ClaimID)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("not found", func(t *testing.T) {
		mock.ExpectQuery("SELECT (.+) FROM carrier_estimates").
			WithArgs(estimateID).
			WillReturnError(sql.ErrNoRows)

		estimate, err := service.getCarrierEstimate(context.Background(), estimateID)
		assert.Error(t, err)
		assert.Nil(t, estimate)
		assert.Contains(t, err.Error(), "carrier estimate not found")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestUpdateParseStatus(t *testing.T) {
	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	service := &PDFParserService{
		db: db,
	}

	estimateID := "est-123"
	errorMsg := "test error"

	t.Run("success with error", func(t *testing.T) {
		mock.ExpectExec("UPDATE carrier_estimates").
			WithArgs(models.ParseStatusFailed, &errorMsg, estimateID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.updateParseStatus(context.Background(), estimateID, models.ParseStatusFailed, &errorMsg)
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("success without error", func(t *testing.T) {
		mock.ExpectExec("UPDATE carrier_estimates").
			WithArgs(models.ParseStatusProcessing, nil, estimateID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.updateParseStatus(context.Background(), estimateID, models.ParseStatusProcessing, nil)
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestUpdateParsedData(t *testing.T) {
	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	service := &PDFParserService{
		db: db,
	}

	estimateID := "est-123"
	parsedData := `{"line_items": []}`

	t.Run("success", func(t *testing.T) {
		mock.ExpectExec("UPDATE carrier_estimates").
			WithArgs(&parsedData, models.ParseStatusCompleted, sqlmock.AnyArg(), estimateID).
			WillReturnResult(sqlmock.NewResult(0, 1))

		err := service.updateParsedData(context.Background(), estimateID, &parsedData)
		assert.NoError(t, err)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestStructureDataWithLLM(t *testing.T) {
	db, _, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	extractedText := `
Roof Replacement Estimate

Item                    Qty    Unit   Unit Cost   Total
Remove shingles         1900   SF     2.50       4750.00
Install new shingles    1900   SF     4.00       7600.00
Ridge caps              100    LF     8.00       800.00

Total: $13,150.00
`

	t.Run("success", func(t *testing.T) {
		mockLLM := &MockPerplexityClient{
			ChatFunc: func(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
				// Verify temperature is set correctly
				assert.Equal(t, 0.1, temperature)

				response := &llm.ChatResponse{
					Choices: []struct {
						Index   int `json:"index"`
						Message struct {
							Role    string `json:"role"`
							Content string `json:"content"`
						} `json:"message"`
					}{
						{
							Message: struct {
								Role    string `json:"role"`
								Content string `json:"content"`
							}{
								Role: "assistant",
								Content: `{
									"line_items": [
										{
											"description": "Remove shingles",
											"quantity": 1900,
											"unit": "SF",
											"unit_cost": 2.50,
											"total": 4750.00,
											"category": "Roofing"
										},
										{
											"description": "Install new shingles",
											"quantity": 1900,
											"unit": "SF",
											"unit_cost": 4.00,
											"total": 7600.00,
											"category": "Roofing"
										}
									],
									"total": 12350.00
								}`,
							},
						},
					},
				}
				return response, nil
			},
		}

		service := &PDFParserService{
			db:        db,
			llmClient: LLMClient(mockLLM),
		}

		parsedData, err := service.structureDataWithLLM(context.Background(), extractedText)
		assert.NoError(t, err)
		assert.NotNil(t, parsedData)
		assert.Len(t, parsedData.LineItems, 2)
		assert.Equal(t, "Remove shingles", parsedData.LineItems[0].Description)
		assert.Equal(t, 1900.0, parsedData.LineItems[0].Quantity)
		assert.Equal(t, 12350.00, parsedData.Total)
	})

	t.Run("LLM error", func(t *testing.T) {
		mockLLM := &MockPerplexityClient{
			ChatFunc: func(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
				return nil, errors.New("LLM service unavailable")
			},
		}

		service := &PDFParserService{
			db:        db,
			llmClient: LLMClient(mockLLM),
		}

		parsedData, err := service.structureDataWithLLM(context.Background(), extractedText)
		assert.Error(t, err)
		assert.Nil(t, parsedData)
		assert.Contains(t, err.Error(), "LLM request failed")
	})

	t.Run("invalid JSON response", func(t *testing.T) {
		mockLLM := &MockPerplexityClient{
			ChatFunc: func(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
				response := &llm.ChatResponse{
					Choices: []struct {
						Index   int `json:"index"`
						Message struct {
							Role    string `json:"role"`
							Content string `json:"content"`
						} `json:"message"`
					}{
						{
							Message: struct {
								Role    string `json:"role"`
								Content string `json:"content"`
							}{
								Role:    "assistant",
								Content: "This is not valid JSON",
							},
						},
					},
				}
				return response, nil
			},
		}

		service := &PDFParserService{
			db:        db,
			llmClient: LLMClient(mockLLM),
		}

		parsedData, err := service.structureDataWithLLM(context.Background(), extractedText)
		assert.Error(t, err)
		assert.Nil(t, parsedData)
		assert.Contains(t, err.Error(), "failed to parse LLM response as JSON")
	})

	t.Run("no line items extracted", func(t *testing.T) {
		mockLLM := &MockPerplexityClient{
			ChatFunc: func(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
				response := &llm.ChatResponse{
					Choices: []struct {
						Index   int `json:"index"`
						Message struct {
							Role    string `json:"role"`
							Content string `json:"content"`
						} `json:"message"`
					}{
						{
							Message: struct {
								Role    string `json:"role"`
								Content string `json:"content"`
							}{
								Role: "assistant",
								Content: `{
									"line_items": [],
									"total": 0
								}`,
							},
						},
					},
				}
				return response, nil
			},
		}

		service := &PDFParserService{
			db:        db,
			llmClient: LLMClient(mockLLM),
		}

		parsedData, err := service.structureDataWithLLM(context.Background(), extractedText)
		assert.Error(t, err)
		assert.Nil(t, parsedData)
		assert.Contains(t, err.Error(), "no line items extracted")
	})
}

func TestParseCarrierEstimate_AuthorizationFlow(t *testing.T) {
	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	estimateID := "est-123"
	claimID := "claim-123"
	organizationID := "org-123"

	t.Run("unauthorized access", func(t *testing.T) {
		var fileSize int64 = 1024
		uploadedAt := time.Now()

		// Mock getCarrierEstimate to return a valid estimate
		rows := sqlmock.NewRows([]string{
			"id", "claim_id", "uploaded_by_user_id", "file_path", "file_name",
			"file_size_bytes", "parsed_data", "parse_status", "parse_error",
			"uploaded_at", "parsed_at",
		}).AddRow(
			estimateID, claimID, "user-123", "/path/to/file.pdf", "estimate.pdf",
			fileSize, nil, models.ParseStatusPending, nil,
			uploadedAt, nil,
		)

		mock.ExpectQuery("SELECT (.+) FROM carrier_estimates").
			WithArgs(estimateID).
			WillReturnRows(rows)

		mockClaimService := &MockClaimService{
			GetClaimFunc: func(cID, orgID string) (*models.Claim, error) {
				return nil, errors.New("claim not found")
			},
		}

		service := &PDFParserService{
			db:          db,
			claimGetter: ClaimGetter(mockClaimService),
		}

		err := service.ParseCarrierEstimate(context.Background(), estimateID, organizationID)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unauthorized access")
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestLineItemSerialization(t *testing.T) {
	t.Run("marshal and unmarshal", func(t *testing.T) {
		data := ParsedEstimateData{
			LineItems: []LineItem{
				{
					Description: "Test item",
					Quantity:    10.5,
					Unit:        "SF",
					UnitCost:    5.25,
					Total:       55.13,
					Category:    "Roofing",
				},
			},
			Total: 55.13,
		}

		jsonBytes, err := json.Marshal(data)
		assert.NoError(t, err)

		var unmarshaled ParsedEstimateData
		err = json.Unmarshal(jsonBytes, &unmarshaled)
		assert.NoError(t, err)

		assert.Len(t, unmarshaled.LineItems, 1)
		assert.Equal(t, "Test item", unmarshaled.LineItems[0].Description)
		assert.Equal(t, 10.5, unmarshaled.LineItems[0].Quantity)
		assert.Equal(t, 55.13, unmarshaled.Total)
	})
}
