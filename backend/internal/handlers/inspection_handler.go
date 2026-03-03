package handlers

import (
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

// inspectionServiceInterface is the narrow interface used by InspectionHandler.
// It is satisfied by *services.InspectionService and by mockInspectionService in tests.
type inspectionServiceInterface interface {
	GetByToken(token string) (*getSetupResponse, error)
	SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error)
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
