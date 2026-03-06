package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

type mockInspectionService struct {
	getByTokenFn      func(token string) (*getSetupResponse, error)
	saveSetupFn       func(token string, input saveSetupInput) (*inspectionV2Response, error)
	getElevationsFn   func(token string) ([]inspectionElevResponse, error)
	saveElevationFn   func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
	listRoofSectionsFn         func(token string) ([]roofSectionResponse, error)
	createRoofSectionFn        func(token string, input createRoofSectionInput) (*roofSectionResponse, error)
	updateRoofSectionFn        func(token string, roofID string, input updateRoofSectionInput) (*roofSectionResponse, error)
	deleteRoofSectionFn        func(token string, roofID string) error
	addRoofSectionDamageSpotFn func(token string, roofID string, input addDamageSpotInput) (*roofDamageSpotResp, error)
	deleteRoofSectionDamageSpotFn func(token string, roofID string, spotID string) error
	getRoomsFn        func(token string) ([]roomResponse, error)
	createRoomFn      func(token string, input createRoomInput) (*roomResponse, error)
	updateRoomFn      func(token string, roomID string, input updateRoomInput) (*roomResponse, error)
	deleteRoomFn      func(token string, roomID string) error
	addRoomPhotoFn    func(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error)
	deleteRoomPhotoFn    func(token string, photoID string) error
	submitInspectionFn  func(token string) (*submitInspectionResponse, error)
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

func (m *mockInspectionService) ListRoofSections(token string) ([]roofSectionResponse, error) {
	if m.listRoofSectionsFn != nil {
		return m.listRoofSectionsFn(token)
	}
	return nil, nil
}
func (m *mockInspectionService) CreateRoofSection(token string, input createRoofSectionInput) (*roofSectionResponse, error) {
	if m.createRoofSectionFn != nil {
		return m.createRoofSectionFn(token, input)
	}
	return nil, nil
}
func (m *mockInspectionService) UpdateRoofSection(token string, roofID string, input updateRoofSectionInput) (*roofSectionResponse, error) {
	if m.updateRoofSectionFn != nil {
		return m.updateRoofSectionFn(token, roofID, input)
	}
	return nil, nil
}
func (m *mockInspectionService) DeleteRoofSection(token string, roofID string) error {
	if m.deleteRoofSectionFn != nil {
		return m.deleteRoofSectionFn(token, roofID)
	}
	return nil
}
func (m *mockInspectionService) AddRoofSectionDamageSpot(token string, roofID string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
	if m.addRoofSectionDamageSpotFn != nil {
		return m.addRoofSectionDamageSpotFn(token, roofID, input)
	}
	return nil, nil
}
func (m *mockInspectionService) DeleteRoofSectionDamageSpot(token string, roofID string, spotID string) error {
	if m.deleteRoofSectionDamageSpotFn != nil {
		return m.deleteRoofSectionDamageSpotFn(token, roofID, spotID)
	}
	return nil
}
func (m *mockInspectionService) GetRooms(token string) ([]roomResponse, error) {
	return m.getRoomsFn(token)
}
func (m *mockInspectionService) CreateRoom(token string, input createRoomInput) (*roomResponse, error) {
	return m.createRoomFn(token, input)
}
func (m *mockInspectionService) UpdateRoom(token string, roomID string, input updateRoomInput) (*roomResponse, error) {
	return m.updateRoomFn(token, roomID, input)
}
func (m *mockInspectionService) DeleteRoom(token string, roomID string) error {
	return m.deleteRoomFn(token, roomID)
}
func (m *mockInspectionService) AddRoomPhoto(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error) {
	return m.addRoomPhotoFn(token, roomID, input)
}
func (m *mockInspectionService) DeleteRoomPhoto(token string, photoID string) error {
	return m.deleteRoomPhotoFn(token, photoID)
}
func (m *mockInspectionService) SubmitInspection(token string) (*submitInspectionResponse, error) {
	return m.submitInspectionFn(token)
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

func TestInspectionHandler_ListRoofSections_ReturnsEmptySlice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		listRoofSectionsFn: func(token string) ([]roofSectionResponse, error) {
			return []roofSectionResponse{}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/roof-sections", handler.ListRoofSections)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/roof-sections", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].([]interface{})
	assert.Len(t, data, 0)
}

func TestInspectionHandler_CreateRoofSection_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		createRoofSectionFn: func(token string, input createRoofSectionInput) (*roofSectionResponse, error) {
			return &roofSectionResponse{ID: "roof-uuid-123", InspectionID: "insp-uuid-456"}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/roof-sections", handler.CreateRoofSection)
	payload := map[string]interface{}{"has_ridge_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/roof-sections", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "roof-uuid-123", data["id"])
}

func TestInspectionHandler_AddRoofSectionDamageSpot_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	caption := "NW valley crack"
	mock := &mockInspectionService{
		addRoofSectionDamageSpotFn: func(token string, roofID string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
			return &roofDamageSpotResp{ID: "spot-uuid-789", Caption: &caption}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots", handler.AddRoofSectionDamageSpot)
	payload := map[string]interface{}{"caption": caption}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/roof-sections/roof-uuid-123/damage-spots", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "spot-uuid-789", data["id"])
}

func TestInspectionHandler_DeleteRoofSectionDamageSpot_Returns204OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoofSectionDamageSpotFn: func(token string, roofID string, spotID string) error { return nil },
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId", handler.DeleteRoofSectionDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof-sections/roof-uuid-123/damage-spots/spot-uuid-789", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestInspectionHandler_DeleteRoofSectionDamageSpot_Returns404ForUnknownSpot(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoofSectionDamageSpotFn: func(token string, roofID string, spotID string) error {
			return fmt.Errorf("damage spot not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId", handler.DeleteRoofSectionDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof-sections/roof-uuid-123/damage-spots/nonexistent", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, false, resp["success"])
	assert.Contains(t, resp["error"], "not found")
}

func TestInspectionHandler_GetRooms_ReturnsEmptySlice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getRoomsFn: func(token string) ([]roomResponse, error) {
			return []roomResponse{}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/rooms", handler.GetRooms)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/rooms", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].([]interface{})
	assert.Len(t, data, 0)
}

func TestInspectionHandler_CreateRoom_Returns201WithRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		createRoomFn: func(token string, input createRoomInput) (*roomResponse, error) {
			return &roomResponse{
				ID:           "room-uuid-111",
				InspectionID: "insp-uuid-222",
				Name:         "Living Room",
				Photos:       []models.InspectionRoomPhoto{},
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/rooms", handler.CreateRoom)
	payload := map[string]interface{}{"name": "Living Room"}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/rooms", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "room-uuid-111", data["id"])
	assert.Equal(t, "Living Room", data["name"])
}

func TestInspectionHandler_UpdateRoom_Returns200WithRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		updateRoomFn: func(token string, roomID string, input updateRoomInput) (*roomResponse, error) {
			return &roomResponse{
				ID:     roomID,
				Name:   input.Name,
				Photos: []models.InspectionRoomPhoto{},
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.UpdateRoom)
	payload := map[string]interface{}{"name": "Kitchen"}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "Kitchen", data["name"])
}

func TestInspectionHandler_DeleteRoom_Returns204OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoomFn: func(token string, roomID string) error { return nil },
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.DeleteRoom)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestInspectionHandler_DeleteRoom_Returns404ForUnknownRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoomFn: func(token string, roomID string) error {
			return fmt.Errorf("room not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.DeleteRoom)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/rooms/nonexistent", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, false, resp["success"])
	assert.Contains(t, resp["error"], "not found")
}

func TestInspectionHandler_AddRoomPhoto_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	caption := "Water stain on south wall"
	mock := &mockInspectionService{
		addRoomPhotoFn: func(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error) {
			return &roomPhotoResponse{ID: "photo-uuid-333", RoomID: roomID, Caption: &caption}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos", handler.AddRoomPhoto)
	payload := map[string]interface{}{"caption": caption}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111/photos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "photo-uuid-333", data["id"])
}

func TestInspectionHandler_SubmitInspection_Returns200OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	now := time.Now()
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return &submitInspectionResponse{
				ID:          "insp-uuid-001",
				Status:      "submitted",
				SubmittedAt: &now,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, true, resp["success"])
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "submitted", data["status"])
}

func TestInspectionHandler_SubmitInspection_Returns401ForInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return nil, fmt.Errorf("invalid or expired token: %s", token)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/bad-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestInspectionHandler_SubmitInspection_Returns404WhenNoInspection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		submitInspectionFn: func(token string) (*submitInspectionResponse, error) {
			return nil, fmt.Errorf("inspection not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/submit", handler.SubmitInspection)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/submit", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Contains(t, resp["error"], "not found")
}
