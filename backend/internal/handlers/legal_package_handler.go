package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type LegalPackageHandler struct {
	service *services.LegalPackageService
}

func NewLegalPackageHandler(service *services.LegalPackageService) *LegalPackageHandler {
	return &LegalPackageHandler{service: service}
}

// Download generates and streams the legal package ZIP.
// GET /api/claims/:id/legal-package/download
func (h *LegalPackageHandler) Download(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	zipBytes, filename, err := h.service.GenerateLegalPackage(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "audit report required") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		log.Printf("Failed to generate legal package for claim %s: %v", claimID, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate legal package",
		})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Header("Content-Length", fmt.Sprintf("%d", len(zipBytes)))
	c.Data(http.StatusOK, "application/zip", zipBytes)
}
