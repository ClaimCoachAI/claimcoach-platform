package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockInspectionService struct {
	getByTokenFn func(token string) (*getSetupResponse, error)
	saveSetupFn  func(token string, input saveSetupInput) (*inspectionV2Response, error)
}

func (m *mockInspectionService) GetByToken(token string) (*getSetupResponse, error) {
	return m.getByTokenFn(token)
}

func (m *mockInspectionService) SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error) {
	return m.saveSetupFn(token, input)
}

func TestInspectionHandler_GetSetup_ReturnsAddressWhenNoDraft(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getByTokenFn: func(token string) (*getSetupResponse, error) {
			return &getSetupResponse{
				PropertyAddress: "123 Elm St, Anytown, FL",
				ContractorName:  "Bob",
				Inspection:      nil,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection", handler.GetSetup)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].(map[string]interface{})
	assert.Equal(t, "123 Elm St, Anytown, FL", data["property_address"])
	assert.Nil(t, data["inspection"])
}

func TestInspectionHandler_SaveSetup_ReturnsBadRequestWhenNoAreaSelected(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewInspectionHandler(&mockInspectionService{})
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection", handler.SaveSetup)
	payload := map[string]interface{}{
		"property_type": "sfh",
		"stories":       2,
		"area_selection": map[string]bool{
			"include_roof": false, "include_exterior": false,
			"include_interior": false, "include_porch": false,
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestInspectionHandler_SaveSetup_Returns201WhenValid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	propType := "sfh"
	stories := 2
	mock := &mockInspectionService{
		saveSetupFn: func(token string, input saveSetupInput) (*inspectionV2Response, error) {
			return &inspectionV2Response{
				ID:           "uuid-123",
				PropertyType: &propType,
				Stories:      &stories,
				CurrentStep:  2,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection", handler.SaveSetup)
	payload := map[string]interface{}{
		"property_type": "sfh",
		"stories":       2,
		"area_selection": map[string]bool{
			"include_roof": true, "include_exterior": false,
			"include_interior": false, "include_porch": false,
		},
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
}
