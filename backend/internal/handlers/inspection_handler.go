package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// type aliases so the mock in tests and the real service share identical types.
type getSetupResponse = services.GetSetupResponse
type saveSetupInput = services.SaveSetupInput
type inspectionV2Response = models.InspectionV2
type saveElevationInput     = services.SaveElevationInput
type inspectionElevResponse = models.InspectionElevation
type listRoofSectionsResp   = []models.InspectionRoof
type createRoofSectionInput = services.CreateRoofSectionInput
type updateRoofSectionInput = services.UpdateRoofSectionInput
type addDamageSpotInput     = services.AddDamageSpotInput
type roofSectionResponse    = models.InspectionRoof
type roofDamageSpotResp     = models.RoofDamageSpot

type getRoomsResponse  = []models.InspectionRoom
type createRoomInput   = services.CreateRoomInput
type updateRoomInput   = services.UpdateRoomInput
type addRoomPhotoInput = services.AddRoomPhotoInput
type roomResponse      = models.InspectionRoom
type roomPhotoResponse = models.InspectionRoomPhoto

type submitInspectionResponse = models.InspectionV2

// inspectionServiceInterface is the narrow interface used by InspectionHandler.
// It is satisfied by *services.InspectionService and by mockInspectionService in tests.
type inspectionServiceInterface interface {
	GetByToken(token string) (*getSetupResponse, error)
	SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error)
	GetElevations(token string) ([]inspectionElevResponse, error)
	SaveElevation(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
	ListRoofSections(token string) ([]roofSectionResponse, error)
	CreateRoofSection(token string, input createRoofSectionInput) (*roofSectionResponse, error)
	UpdateRoofSection(token string, roofID string, input updateRoofSectionInput) (*roofSectionResponse, error)
	DeleteRoofSection(token string, roofID string) error
	AddRoofSectionDamageSpot(token string, roofID string, input addDamageSpotInput) (*roofDamageSpotResp, error)
	DeleteRoofSectionDamageSpot(token string, roofID string, spotID string) error
	GetRooms(token string) ([]roomResponse, error)
	CreateRoom(token string, input createRoomInput) (*roomResponse, error)
	UpdateRoom(token string, roomID string, input updateRoomInput) (*roomResponse, error)
	DeleteRoom(token string, roomID string) error
	AddRoomPhoto(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error)
	DeleteRoomPhoto(token string, photoID string) error
	SubmitInspection(token string) (*submitInspectionResponse, error)
}

// InspectionHandler handles HTTP requests for the inspection v2 wizard.
type InspectionHandler struct {
	service inspectionServiceInterface
}

// NewInspectionHandler constructs an InspectionHandler backed by service.
func NewInspectionHandler(service inspectionServiceInterface) *InspectionHandler {
	return &InspectionHandler{service: service}
}

// isTokenError returns true when err is an invalid-or-expired-token error from the service.
func isTokenError(err error) bool {
	return err != nil && strings.HasPrefix(err.Error(), "invalid or expired token:")
}

// GetSetup handles GET /api/magic-links/:token/v2/inspection.
// It returns 200 with the property address and any existing inspection draft, or
// 401 when the magic-link token is invalid/expired.
func (h *InspectionHandler) GetSetup(c *gin.Context) {
	token := c.Param("token")

	resp, err := h.service.GetByToken(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to load inspection setup: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    resp,
	})
}

// SaveSetup handles POST /api/magic-links/:token/v2/inspection.
// It validates that at least one area is selected (400 if none), calls SaveSetup on the
// service, and returns 201 with the saved inspection on success.
func (h *InspectionHandler) SaveSetup(c *gin.Context) {
	token := c.Param("token")

	var input saveSetupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	// At least one area must be selected.
	area := input.AreaSelection
	if !area.IncludeRoof && !area.IncludeExterior && !area.IncludeInterior && !area.IncludePorch {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "At least one area must be selected",
		})
		return
	}

	insp, err := h.service.SaveSetup(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to save inspection setup: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    insp,
	})
}

// GetElevations handles GET /api/magic-links/:token/v2/inspection/elevations.
// Returns all saved elevation rows for this inspection (empty array when none yet).
func (h *InspectionHandler) GetElevations(c *gin.Context) {
	token := c.Param("token")

	elevations, err := h.service.GetElevations(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to load elevations: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    elevations,
	})
}

// SaveElevation handles PUT /api/magic-links/:token/v2/inspection/elevations/:side.
// :side must be one of front, right, back, left — returns 400 otherwise.
func (h *InspectionHandler) SaveElevation(c *gin.Context) {
	token := c.Param("token")
	side := c.Param("side")

	// Validate the URL parameter before reading the request body.
	if !models.IsValidElevationSide(side) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid elevation side: must be front, right, back, or left",
		})
		return
	}

	var input saveElevationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	elevation, err := h.service.SaveElevation(token, side, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to save elevation: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    elevation,
	})
}

// ListRoofSections handles GET /api/magic-links/:token/v2/inspection/roof-sections.
func (h *InspectionHandler) ListRoofSections(c *gin.Context) {
	token := c.Param("token")
	sections, err := h.service.ListRoofSections(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": sections})
}

// CreateRoofSection handles POST /api/magic-links/:token/v2/inspection/roof-sections.
func (h *InspectionHandler) CreateRoofSection(c *gin.Context) {
	token := c.Param("token")
	var input createRoofSectionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	section, err := h.service.CreateRoofSection(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": section})
}

// UpdateRoofSection handles PATCH /api/magic-links/:token/v2/inspection/roof-sections/:roofId.
func (h *InspectionHandler) UpdateRoofSection(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	var input updateRoofSectionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	section, err := h.service.UpdateRoofSection(token, roofID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Roof section not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": section})
}

// DeleteRoofSection handles DELETE /api/magic-links/:token/v2/inspection/roof-sections/:roofId.
func (h *InspectionHandler) DeleteRoofSection(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	if err := h.service.DeleteRoofSection(token, roofID); err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Roof section not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// AddRoofSectionDamageSpot handles POST /api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots.
func (h *InspectionHandler) AddRoofSectionDamageSpot(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	var input addDamageSpotInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	spot, err := h.service.AddRoofSectionDamageSpot(token, roofID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": spot})
}

// DeleteRoofSectionDamageSpot handles DELETE /api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId.
func (h *InspectionHandler) DeleteRoofSectionDamageSpot(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	spotID := c.Param("spotId")
	if err := h.service.DeleteRoofSectionDamageSpot(token, roofID, spotID); err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Damage spot not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// GetRooms handles GET /api/magic-links/:token/v2/inspection/rooms.
// Returns 200 with all rooms and their photos (empty array when none).
func (h *InspectionHandler) GetRooms(c *gin.Context) {
	token := c.Param("token")

	rooms, err := h.service.GetRooms(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load rooms: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": rooms})
}

// CreateRoom handles POST /api/magic-links/:token/v2/inspection/rooms.
// Returns 201 with the new room (photos is always an empty array).
func (h *InspectionHandler) CreateRoom(c *gin.Context) {
	token := c.Param("token")

	var input createRoomInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	room, err := h.service.CreateRoom(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create room: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": room})
}

// UpdateRoom handles PUT /api/magic-links/:token/v2/inspection/rooms/:roomId.
// Returns 200 with the updated room (including its photos).
func (h *InspectionHandler) UpdateRoom(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	var input updateRoomInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	room, err := h.service.UpdateRoom(token, roomID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update room: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": room})
}

// DeleteRoom handles DELETE /api/magic-links/:token/v2/inspection/rooms/:roomId.
// Returns 204 on success, 404 when the room does not exist or belongs to another inspection.
func (h *InspectionHandler) DeleteRoom(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	err := h.service.DeleteRoom(token, roomID)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete room: " + err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// AddRoomPhoto handles POST /api/magic-links/:token/v2/inspection/rooms/:roomId/photos.
// Returns 201 with the new photo row.
func (h *InspectionHandler) AddRoomPhoto(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	var input addRoomPhotoInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	photo, err := h.service.AddRoomPhoto(token, roomID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add room photo: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": photo})
}

// DeleteRoomPhoto handles DELETE /api/magic-links/:token/v2/inspection/rooms/:roomId/photos/:photoId.
// Returns 204 on success, 404 when the photo does not exist or belongs to another inspection.
func (h *InspectionHandler) DeleteRoomPhoto(c *gin.Context) {
	token := c.Param("token")
	photoID := c.Param("photoId")

	err := h.service.DeleteRoomPhoto(token, photoID)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room photo not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete room photo: " + err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// SubmitInspection handles POST /api/magic-links/:token/v2/inspection/submit.
// Returns 200 with the updated inspection (idempotent — safe to call multiple times).
func (h *InspectionHandler) SubmitInspection(c *gin.Context) {
	token := c.Param("token")

	insp, err := h.service.SubmitInspection(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Inspection not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to submit inspection: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": insp})
}
