package handlers

import (
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type CarrierEstimateHandler struct {
	service *services.CarrierEstimateService
}

func NewCarrierEstimateHandler(service *services.CarrierEstimateService) *CarrierEstimateHandler {
	return &CarrierEstimateHandler{service: service}
}

// RequestUploadURL generates a presigned upload URL for carrier estimate
// POST /api/claims/:id/carrier-estimate/upload-url
func (h *CarrierEstimateHandler) RequestUploadURL(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.RequestCarrierEstimateUploadURLInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	response, err := h.service.RequestUploadURL(claimID, user.OrganizationID, user.ID, input)
	if err != nil {
		// Handle specific errors
		if err.Error() == "file size exceeds maximum allowed (10MB)" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "File size exceeds maximum allowed (10MB)",
			})
			return
		}
		if err.Error() == "only PDF files are allowed for carrier estimates" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Only PDF files are allowed for carrier estimates",
			})
			return
		}
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate upload URL: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    response,
	})
}

// ConfirmUpload confirms that a carrier estimate has been uploaded
// POST /api/claims/:id/carrier-estimate/:estimateId/confirm
func (h *CarrierEstimateHandler) ConfirmUpload(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")
	estimateID := c.Param("estimateId")

	estimate, err := h.service.ConfirmUpload(claimID, estimateID, user.OrganizationID)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		if err.Error() == "carrier estimate not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Carrier estimate not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to confirm upload: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    estimate,
	})
}

// ListCarrierEstimates lists all carrier estimates for a claim
// GET /api/claims/:id/carrier-estimate
func (h *CarrierEstimateHandler) ListCarrierEstimates(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	estimates, err := h.service.GetCarrierEstimatesByClaimID(c.Request.Context(), claimID, user.OrganizationID)
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
			"error":   "Failed to list carrier estimates: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    estimates,
	})
}
