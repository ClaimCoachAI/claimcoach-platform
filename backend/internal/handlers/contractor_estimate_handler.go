// backend/internal/handlers/contractor_estimate_handler.go
package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

type ContractorEstimateHandler struct {
	service       *services.ContractorEstimateService
	parserService *services.ContractorPDFParserService
}

func NewContractorEstimateHandler(
	service *services.ContractorEstimateService,
	parserService *services.ContractorPDFParserService,
) *ContractorEstimateHandler {
	return &ContractorEstimateHandler{
		service:       service,
		parserService: parserService,
	}
}

// RequestUploadURL generates a presigned upload URL.
// POST /api/claims/:id/contractor-estimate/upload-url
func (h *ContractorEstimateHandler) RequestUploadURL(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.RequestContractorEstimateUploadURLInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	response, err := h.service.RequestUploadURL(claimID, user.OrganizationID, user.ID, input)
	if err != nil {
		switch err.Error() {
		case "file size exceeds maximum allowed (10MB)":
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		case "only PDF files are allowed for contractor estimates":
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		case "claim not found":
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate upload URL: " + err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": response})
}

// ConfirmUpload returns the contractor_estimate record after the client PUT the file.
// POST /api/claims/:id/contractor-estimate/:estimateId/confirm
func (h *ContractorEstimateHandler) ConfirmUpload(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")
	estimateID := c.Param("estimateId")

	estimate, err := h.service.ConfirmUpload(claimID, estimateID, user.OrganizationID)
	if err != nil {
		switch err.Error() {
		case "claim not found":
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
		case "contractor estimate not found":
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Contractor estimate not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to confirm upload: " + err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": estimate})
}

// GetLatest returns the most recent contractor estimate for a claim.
// GET /api/claims/:id/contractor-estimate
func (h *ContractorEstimateHandler) GetLatest(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	estimate, err := h.service.GetLatestByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Claim not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to get contractor estimate: " + err.Error()})
		return
	}

	// Return null data (not 404) if no estimate exists yet — frontend checks for null
	c.JSON(http.StatusOK, gin.H{"success": true, "data": estimate})
}

// ParseContractorEstimate runs Claude PDF parsing synchronously (90s timeout).
// Returns parsed_data directly so the frontend can render the damage summary without a follow-up request.
// POST /api/claims/:id/contractor-estimate/:estimateId/parse
func (h *ContractorEstimateHandler) ParseContractorEstimate(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	estimateID := c.Param("estimateId")

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	parsedData, err := h.parserService.ParseContractorEstimate(ctx, estimateID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"error":   "Failed to parse PDF: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    parsedData,
	})
}
