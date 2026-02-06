package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/claimcoach/backend/internal/llm"
	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockAuditService is a mock implementation of the AuditService for testing
type MockAuditService struct {
	mock.Mock
}

func (m *MockAuditService) GenerateIndustryEstimate(ctx context.Context, claimID, userID, orgID string) (string, error) {
	args := m.Called(ctx, claimID, userID, orgID)
	return args.String(0), args.Error(1)
}

func (m *MockAuditService) CompareEstimates(ctx context.Context, auditReportID string, userID string, orgID string) error {
	args := m.Called(ctx, auditReportID, userID, orgID)
	return args.Error(0)
}

func (m *MockAuditService) Chat(ctx context.Context, messages []llm.Message, temperature float64, maxTokens int) (*llm.ChatResponse, error) {
	args := m.Called(ctx, messages, temperature, maxTokens)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*llm.ChatResponse), args.Error(1)
}

func setupAuditTestRouter(mockService *MockAuditService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	// Create handler
	handler := NewAuditHandler(mockService)

	// Middleware to inject test user
	r.Use(func(c *gin.Context) {
		c.Set("user", models.User{
			ID:             "test-user-id",
			OrganizationID: "test-org-id",
			Email:          "test@example.com",
		})
		c.Next()
	})

	// Register route
	r.POST("/api/claims/:id/audit/:auditId/compare", handler.CompareEstimates)

	return r
}

func TestCompareEstimatesHandler_Success(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "test-audit-report-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").Return(nil)

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "success")
	assert.Contains(t, w.Body.String(), "Estimates compared successfully")

	mockService.AssertExpectations(t)
}

func TestCompareEstimatesHandler_AuditReportNotFound(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "non-existent-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").
		Return(errors.New("audit report not found"))

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Contains(t, w.Body.String(), "Audit report not found")

	mockService.AssertExpectations(t)
}

func TestCompareEstimatesHandler_IndustryEstimateNotGenerated(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "test-audit-report-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").
		Return(errors.New("industry estimate not generated yet"))

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Industry estimate not generated yet")

	mockService.AssertExpectations(t)
}

func TestCompareEstimatesHandler_CarrierEstimateNotUploaded(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "test-audit-report-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").
		Return(errors.New("carrier estimate not found"))

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Carrier estimate not uploaded yet")

	mockService.AssertExpectations(t)
}

func TestCompareEstimatesHandler_CarrierEstimateNotParsed(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "test-audit-report-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").
		Return(errors.New("carrier estimate not parsed yet"))

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Carrier estimate not parsed yet")

	mockService.AssertExpectations(t)
}

func TestCompareEstimatesHandler_InternalError(t *testing.T) {
	// Setup
	mockService := new(MockAuditService)
	router := setupAuditTestRouter(mockService)

	auditReportID := "test-audit-report-id"
	claimID := "test-claim-id"

	// Set up expectations
	mockService.On("CompareEstimates", mock.Anything, auditReportID, "test-user-id", "test-org-id").
		Return(errors.New("database connection failed"))

	// Create request
	req, _ := http.NewRequest("POST", "/api/claims/"+claimID+"/audit/"+auditReportID+"/compare", nil)
	w := httptest.NewRecorder()

	// Execute
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), "Failed to compare estimates")

	mockService.AssertExpectations(t)
}
