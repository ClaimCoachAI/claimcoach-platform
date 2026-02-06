package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type MagicLinkHandler struct {
	service *services.MagicLinkService
}

func NewMagicLinkHandler(service *services.MagicLinkService) *MagicLinkHandler {
	return &MagicLinkHandler{service: service}
}

func (h *MagicLinkHandler) GenerateMagicLink(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.GenerateMagicLinkInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.GenerateMagicLink(claimID, user.OrganizationID, user.ID, input)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate magic link: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    response,
	})
}

// ValidateToken validates a magic link token (public endpoint, no auth required)
func (h *MagicLinkHandler) ValidateToken(c *gin.Context) {
	token := c.Param("token")

	result, err := h.service.ValidateToken(token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to validate token: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
