package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// AuditServiceInterface defines the interface for audit operations
type AuditServiceInterface interface {
	GenerateIndustryEstimate(ctx context.Context, claimID, userID, orgID string) (string, error)
	GetAuditReportByClaimID(ctx context.Context, claimID, orgID string) (*models.AuditReport, error)
	AnalyzeClaimViability(ctx context.Context, claimID, orgID string) (*services.ViabilityAnalysis, error)
	RunPMBrainAnalysis(ctx context.Context, auditReportID, userID, orgID string) (*services.PMBrainAnalysis, error)
	GenerateDisputeLetter(ctx context.Context, auditReportID, userID, orgID string) (string, error)
	GenerateOwnerPitch(ctx context.Context, auditReportID, userID, orgID string) (string, error)
}

type AuditHandler struct {
	service AuditServiceInterface
}

func NewAuditHandler(service AuditServiceInterface) *AuditHandler {
	return &AuditHandler{service: service}
}

// GenerateIndustryEstimate generates an industry-standard estimate from scope sheet
// POST /api/claims/:id/audit/generate
func (h *AuditHandler) GenerateIndustryEstimate(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	auditReportID, err := h.service.GenerateIndustryEstimate(c.Request.Context(), claimID, user.ID, user.OrganizationID)
	if err != nil {
		// Handle specific errors
		if err.Error() == "scope sheet not found for claim "+claimID {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Scope sheet not found. Please submit scope sheet first.",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate industry estimate: " + err.Error(),
		})
		return
	}

	// Get the audit report to return in response
	auditReport, err := h.service.GetAuditReportByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve audit report: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"audit_report_id": auditReportID,
			"audit_report":    auditReport,
		},
	})
}

// GetAuditReport retrieves the audit report for a claim
// GET /api/claims/:id/audit
func (h *AuditHandler) GetAuditReport(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	auditReport, err := h.service.GetAuditReportByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		if err.Error() == "audit report not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Audit report not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve audit report: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    auditReport,
	})
}

// RunPMBrain runs the Post-Adjudication Strategy Engine on an audit report.
// POST /api/claims/:id/audit/:auditId/pm-brain
func (h *AuditHandler) RunPMBrain(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	auditReportID := c.Param("auditId")

	analysis, err := h.service.RunPMBrainAnalysis(c.Request.Context(), auditReportID, user.ID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "audit report not found") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Audit report not found"})
			return
		}
		if strings.Contains(err.Error(), "not generated yet") || strings.Contains(err.Error(), "not parsed yet") || strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to run PM Brain analysis: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": analysis})
}

// GenerateDisputeLetter generates the formal dispute letter on demand.
// POST /api/claims/:id/audit/:auditId/dispute-letter
func (h *AuditHandler) GenerateDisputeLetter(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	auditReportID := c.Param("auditId")

	letter, err := h.service.GenerateDisputeLetter(c.Request.Context(), auditReportID, user.ID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "audit report not found") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Audit report not found"})
			return
		}
		if strings.Contains(err.Error(), "must be run first") || strings.Contains(err.Error(), "only available when") {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate dispute letter: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"letter": letter}})
}

// GenerateOwnerPitch generates a plain-English escalation pitch email for the building owner.
// POST /api/claims/:id/audit/:auditId/owner-pitch
func (h *AuditHandler) GenerateOwnerPitch(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	auditReportID := c.Param("auditId")

	pitch, err := h.service.GenerateOwnerPitch(c.Request.Context(), auditReportID, user.ID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "audit report not found") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Audit report not found"})
			return
		}
		if strings.Contains(err.Error(), "must be run first") || strings.Contains(err.Error(), "only available when") {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate owner pitch: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"pitch": pitch}})
}

// AnalyzeClaimViability runs the PM Decision Engine on a claim.
// POST /api/claims/:id/audit/viability
func (h *AuditHandler) AnalyzeClaimViability(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	analysis, err := h.service.AnalyzeClaimViability(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "claim not found") {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		if strings.Contains(err.Error(), "no generated estimate found") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "No estimate found. Generate the ClaimCoach estimate first.",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to analyze claim viability: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    analysis,
	})
}

