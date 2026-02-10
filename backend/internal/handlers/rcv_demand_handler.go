package handlers

import (
	"context"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// RCVDemandServiceInterface defines the interface for RCV demand letter operations
type RCVDemandServiceInterface interface {
	GenerateRCVDemandLetter(ctx context.Context, claimID, userID, orgID string) (string, error)
	GetRCVDemandLetter(ctx context.Context, demandLetterID, orgID string) (*models.RCVDemandLetter, error)
	ListRCVDemandLettersByClaimID(ctx context.Context, claimID, orgID string) ([]models.RCVDemandLetter, error)
	MarkAsSent(ctx context.Context, demandLetterID, userID, orgID string, input services.MarkAsSentInput) error
}

type RCVDemandHandler struct {
	service RCVDemandServiceInterface
}

func NewRCVDemandHandler(service RCVDemandServiceInterface) *RCVDemandHandler {
	return &RCVDemandHandler{service: service}
}

// GenerateRCVDemandLetter generates a demand letter for outstanding RCV payments
// POST /api/claims/:id/rcv-demand/generate
func (h *RCVDemandHandler) GenerateRCVDemandLetter(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	demandLetterID, err := h.service.GenerateRCVDemandLetter(c.Request.Context(), claimID, user.ID, user.OrganizationID)
	if err != nil {
		if err.Error() == "claim not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Claim not found",
			})
			return
		}
		if err.Error() == "no outstanding RCV payment" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "No outstanding RCV payment to demand",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate RCV demand letter: " + err.Error(),
		})
		return
	}

	// Get the generated letter to return in response
	demandLetter, err := h.service.GetRCVDemandLetter(c.Request.Context(), demandLetterID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to retrieve demand letter: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"demand_letter_id": demandLetterID,
			"content":          demandLetter.Content,
			"rcv_outstanding":  demandLetter.RCVOutstanding,
			"created_at":       demandLetter.CreatedAt,
		},
	})
}

// ListRCVDemandLettersByClaimID retrieves all demand letters for a claim
// GET /api/claims/:id/rcv-demand
func (h *RCVDemandHandler) ListRCVDemandLettersByClaimID(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	letters, err := h.service.ListRCVDemandLettersByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to list demand letters: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    letters,
	})
}

// GetRCVDemandLetter retrieves a demand letter by ID
// GET /api/rcv-demand/:id
func (h *RCVDemandHandler) GetRCVDemandLetter(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	demandLetterID := c.Param("id")

	letter, err := h.service.GetRCVDemandLetter(c.Request.Context(), demandLetterID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get demand letter: " + err.Error(),
		})
		return
	}

	if letter == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Demand letter not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    letter,
	})
}

// MarkAsSent records when a demand letter was sent
// PATCH /api/rcv-demand/:id/mark-sent
func (h *RCVDemandHandler) MarkAsSent(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	demandLetterID := c.Param("id")

	var input services.MarkAsSentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.MarkAsSent(c.Request.Context(), demandLetterID, user.ID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "demand letter not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Demand letter not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to mark demand letter as sent: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Demand letter marked as sent",
	})
}
