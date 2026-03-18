package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ClaimMediaHandler struct {
	claimService      *services.ClaimService
	inspectionService *services.InspectionService
}

func NewClaimMediaHandler(
	claimService *services.ClaimService,
	inspectionService *services.InspectionService,
) *ClaimMediaHandler {
	return &ClaimMediaHandler{
		claimService:      claimService,
		inspectionService: inspectionService,
	}
}

// GetMedia handles GET /api/claims/:id/media
func (h *ClaimMediaHandler) GetMedia(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(models.User)

	if _, err := h.claimService.GetClaim(claimID, user.OrganizationID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "not found"})
		return
	}

	items, err := h.inspectionService.GetMediaByClaimID(claimID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "internal error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}
