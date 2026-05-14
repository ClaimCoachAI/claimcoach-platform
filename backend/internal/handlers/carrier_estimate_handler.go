package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type CarrierEstimateHandler struct {
	service       *services.CarrierEstimateService
	parserService *services.PDFParserService
}

func NewCarrierEstimateHandler(service *services.CarrierEstimateService, parserService *services.PDFParserService) *CarrierEstimateHandler {
	return &CarrierEstimateHandler{
		service:       service,
		parserService: parserService,
	}
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

// ParseCarrierEstimate parses a carrier estimate PDF synchronously
// POST /api/claims/:id/carrier-estimate/:estimateId/parse
func (h *CarrierEstimateHandler) ParseCarrierEstimate(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")
	estimateID := c.Param("estimateId")

	// Use a background context so the parse is not cancelled if the client disconnects,
	// but bound to a 90-second deadline to stay within Lambda's execution window.
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	err := h.parserService.ParseCarrierEstimate(ctx, estimateID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"error":   "Failed to parse PDF: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Parsing complete",
		"data": gin.H{
			"claim_id":    claimID,
			"estimate_id": estimateID,
			"status":      "completed",
		},
	})
}
