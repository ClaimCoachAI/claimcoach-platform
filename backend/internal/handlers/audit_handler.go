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
	SubmitEstimateJob(ctx context.Context, claimID, userID, orgID string) (string, error)
	GetJobStatus(ctx context.Context, auditReportID, orgID string) (*models.AuditReport, error)
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

// GenerateIndustryEstimate submits an async estimate job and returns the job ID immediately.
// The client should poll GET /claims/:id/audit/status/:jobId until status is completed or failed.
// POST /api/claims/:id/audit/generate
func (h *AuditHandler) GenerateIndustryEstimate(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	jobID, err := h.service.SubmitEstimateJob(c.Request.Context(), claimID, user.ID, user.OrganizationID)
	if err != nil {
		if strings.Contains(err.Error(), "scope sheet not found") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Scope sheet not found. Please submit scope sheet first.",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to start estimate generation: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"success": true,
		"data": gin.H{
			"job_id": jobID,
			"status": "processing",
		},
	})
}

// GetJobStatus returns the current status of an async estimate job.
// GET /api/claims/:id/audit/status/:jobId
func (h *AuditHandler) GetJobStatus(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	jobID := c.Param("jobId")

	report, err := h.service.GetJobStatus(c.Request.Context(), jobID, user.OrganizationID)
	if err != nil {
		if err.Error() == "audit report not found" {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Job not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	resp := gin.H{
		"status":          report.Status,
		"audit_report_id": report.ID,
	}
	if report.Status == "completed" {
		resp["audit_report"] = report
	}
	if report.Status == "failed" && report.ErrorMessage != nil {
		resp["error"] = *report.ErrorMessage
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
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

