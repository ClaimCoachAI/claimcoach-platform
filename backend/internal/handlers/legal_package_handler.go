package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
)

// LegalPackageHandler exposes the 3 legal package endpoints.
type LegalPackageHandler struct {
	svc *services.LegalPackageService
}

// NewLegalPackageHandler constructs the handler.
func NewLegalPackageHandler(svc *services.LegalPackageService) *LegalPackageHandler {
	return &LegalPackageHandler{svc: svc}
}

// InitiateEscalation handles POST /api/claims/:id/legal-escalation
// Requires auth. Creates the approval request and sends the homeowner email.
func (h *LegalPackageHandler) InitiateEscalation(c *gin.Context) {
	claimID := c.Param("id")
	user := c.MustGet("user").(models.User)

	var input services.InitiateEscalationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req, err := h.svc.InitiateEscalation(c.Request.Context(), claimID, user.OrganizationID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"owner_name":  req.OwnerName,
			"owner_email": req.OwnerEmail,
			"expires_at":  req.ExpiresAt,
		},
	})
}

// GetApprovalPage handles GET /api/legal-approval/:token
// Public (no auth). Returns the data needed to render the homeowner approval page.
func (h *LegalPackageHandler) GetApprovalPage(c *gin.Context) {
	token := c.Param("token")

	data, err := h.svc.GetApprovalPageData(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load approval data"})
		return
	}
	if data == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "approval link not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

// RespondToApproval handles POST /api/legal-approval/:token/respond
// Public (no auth). Records the homeowner approve/decline decision.
func (h *LegalPackageHandler) RespondToApproval(c *gin.Context) {
	token := c.Param("token")

	var input services.ProcessApprovalInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.svc.ProcessApproval(c.Request.Context(), token, input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
