package handlers

import (
	"bytes"
	"database/sql"
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
	getByTokenFn      func(token string) (*getSetupResponse, error)
	saveSetupFn       func(token string, input saveSetupInput) (*inspectionV2Response, error)
	getElevationsFn   func(token string) ([]inspectionElevResponse, error)
	saveElevationFn   func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
	getRoofFn         func(token string) (*getRoofResponse, error)
	saveRoofFn        func(token string, input saveRoofInput) (*roofResponse, error)
	addDamageSpotFn   func(token string, input addDamageSpotInput) (*roofDamageSpotResp, error)
	deleteDamageSpotFn func(token string, spotID string) error
	getRoomsFn        func(token string) ([]roomResponse, error)
	createRoomFn      func(token string, input createRoomInput) (*roomResponse, error)
	updateRoomFn      func(token string, roomID string, input updateRoomInput) (*roomResponse, error)
	deleteRoomFn      func(token string, roomID string) error
	addRoomPhotoFn    func(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error)
	deleteRoomPhotoFn func(token string, photoID string) error
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

func (m *mockInspectionService) GetRoof(token string) (*getRoofResponse, error) {
	return m.getRoofFn(token)
}
func (m *mockInspectionService) SaveRoof(token string, input saveRoofInput) (*roofResponse, error) {
	return m.saveRoofFn(token, input)
}
func (m *mockInspectionService) AddDamageSpot(token string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
	return m.addDamageSpotFn(token, input)
}
func (m *mockInspectionService) DeleteDamageSpot(token string, spotID string) error {
	return m.deleteDamageSpotFn(token, spotID)
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

func TestInspectionHandler_GetRoof_ReturnsNullRoofWhenNone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getRoofFn: func(token string) (*getRoofResponse, error) {
			return &getRoofResponse{Roof: nil, DamageSpots: []roofDamageSpotResp{}}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/roof", handler.GetRoof)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/roof", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].(map[string]interface{})
	assert.Nil(t, data["roof"])
	assert.NotNil(t, data["damage_spots"])
}

func TestInspectionHandler_SaveRoof_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		saveRoofFn: func(token string, input saveRoofInput) (*roofResponse, error) {
			return &roofResponse{ID: "roof-uuid-123", InspectionID: "insp-uuid-456"}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/roof", handler.SaveRoof)
	payload := map[string]interface{}{"has_ridge_damage": false, "has_valley_damage": false, "has_flashing_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/roof", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "roof-uuid-123", data["id"])
}

func TestInspectionHandler_AddDamageSpot_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	caption := "NW valley crack"
	mock := &mockInspectionService{
		addDamageSpotFn: func(token string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
			return &roofDamageSpotResp{ID: "spot-uuid-789", Caption: &caption}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/roof/damage-spots", handler.AddDamageSpot)
	payload := map[string]interface{}{"caption": caption}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/roof/damage-spots", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "spot-uuid-789", data["id"])
}

func TestInspectionHandler_DeleteDamageSpot_Returns204OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteDamageSpotFn: func(token string, spotID string) error { return nil },
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", handler.DeleteDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof/damage-spots/spot-uuid-789", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestInspectionHandler_DeleteDamageSpot_Returns404ForUnknownSpot(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteDamageSpotFn: func(token string, spotID string) error {
			return fmt.Errorf("damage spot not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", handler.DeleteDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof/damage-spots/nonexistent", nil)
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
