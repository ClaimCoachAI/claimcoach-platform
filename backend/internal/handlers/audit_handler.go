package handlers

import (
	"context"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// AuditServiceInterface defines the interface for audit operations
type AuditServiceInterface interface {
	GenerateIndustryEstimate(ctx context.Context, claimID, userID, orgID string) (string, error)
	CompareEstimates(ctx context.Context, auditReportID string, userID string, orgID string) error
	GenerateRebuttal(ctx context.Context, auditReportID string, userID string, orgID string) (string, error)
	GetRebuttal(ctx context.Context, rebuttalID string, orgID string) (*models.Rebuttal, error)
}

type AuditHandler struct {
	service AuditServiceInterface
}

func NewAuditHandler(service AuditServiceInterface) *AuditHandler {
	return &AuditHandler{service: service}
}

// CompareEstimates compares industry estimate with carrier estimate
// POST /api/claims/:id/audit/:auditId/compare
func (h *AuditHandler) CompareEstimates(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	auditReportID := c.Param("auditId")

	err := h.service.CompareEstimates(c.Request.Context(), auditReportID, user.ID, user.OrganizationID)
	if err != nil {
		// Handle specific errors
		if err.Error() == "audit report not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Audit report not found",
			})
			return
		}
		if err.Error() == "industry estimate not generated yet" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Industry estimate not generated yet",
			})
			return
		}
		if err.Error() == "carrier estimate not found" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Carrier estimate not uploaded yet",
			})
			return
		}
		if err.Error() == "carrier estimate not parsed yet" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Carrier estimate not parsed yet",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to compare estimates: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Estimates compared successfully",
	})
}

// GenerateRebuttal generates a professional rebuttal letter
// POST /api/claims/:id/audit/:auditId/rebuttal
func (h *AuditHandler) GenerateRebuttal(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	auditReportID := c.Param("auditId")

	rebuttalID, err := h.service.GenerateRebuttal(c.Request.Context(), auditReportID, user.ID, user.OrganizationID)
	if err != nil {
		// Handle specific errors
		if err.Error() == "audit report not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Audit report not found",
			})
			return
		}
		if err.Error() == "comparison data not available" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Comparison must be run before generating rebuttal",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate rebuttal: " + err.Error(),
		})
		return
	}

	// Get the rebuttal content to return in response
	rebuttal, err := h.service.GetRebuttal(c.Request.Context(), rebuttalID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve rebuttal content: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"rebuttal_id": rebuttal.ID,
			"content":     rebuttal.Content,
			"created_at":  rebuttal.CreatedAt,
		},
	})
}

// GetRebuttal retrieves a rebuttal by ID
// GET /api/rebuttals/:id
func (h *AuditHandler) GetRebuttal(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	rebuttalID := c.Param("id")

	rebuttal, err := h.service.GetRebuttal(c.Request.Context(), rebuttalID, user.OrganizationID)
	if err != nil {
		if err.Error() == "rebuttal not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Rebuttal not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve rebuttal: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    rebuttal,
	})
}
