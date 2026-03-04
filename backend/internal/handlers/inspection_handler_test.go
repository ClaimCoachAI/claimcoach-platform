package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockInspectionService struct {
	getByTokenFn    func(token string) (*getSetupResponse, error)
	saveSetupFn     func(token string, input saveSetupInput) (*inspectionV2Response, error)
	getElevationsFn func(token string) ([]inspectionElevResponse, error)
	saveElevationFn func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
}

func (m *mockInspectionService) GetByToken(token string) (*getSetupResponse, error) {
	return m.getByTokenFn(token)
}

func (m *mockInspectionService) SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error) {
	return m.saveSetupFn(token, input)
}

func (m *mockInspectionService) GetElevations(token string) ([]inspectionElevResponse, error) {
	return m.getElevationsFn(token)
}

func (m *mockInspectionService) SaveElevation(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
	return m.saveElevationFn(token, side, input)
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

func TestInspectionHandler_GetElevations_ReturnsEmptySlice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getElevationsFn: func(token string) ([]inspectionElevResponse, error) {
			return []inspectionElevResponse{}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/elevations", handler.GetElevations)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/elevations", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].([]interface{})
	assert.Len(t, data, 0)
}

func TestInspectionHandler_SaveElevation_ReturnsBadRequestForInvalidSide(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewInspectionHandler(&mockInspectionService{})
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/elevations/diagonal", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Contains(t, resp["error"], "Invalid elevation side")
}

func TestInspectionHandler_SaveElevation_Returns201WhenValid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		saveElevationFn: func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
			return &inspectionElevResponse{
				ID:        "elev-uuid-123",
				Side:      models.ElevationSide(side),
				HasDamage: false,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/elevations/front", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "elev-uuid-123", data["id"])
	assert.Equal(t, "front", data["side"])
}

func TestInspectionHandler_SaveElevation_Returns401ForInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		saveElevationFn: func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
			return nil, fmt.Errorf("invalid or expired token: token has expired")
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/expired-token/v2/inspection/elevations/front", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, false, resp["success"])
	assert.Contains(t, resp["error"], "Invalid or expired magic link")
}
