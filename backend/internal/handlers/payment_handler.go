package handlers

import (
	"context"
	"net/http"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)

// PaymentServiceInterface defines the interface for payment operations
type PaymentServiceInterface interface {
	CreateExpectedPayment(ctx context.Context, claimID, userID, orgID string, input services.CreateExpectedPaymentInput) (string, error)
	RecordPaymentReceived(ctx context.Context, paymentID, userID, orgID string, input services.RecordPaymentReceivedInput) error
	ReconcilePayment(ctx context.Context, paymentID, userID, orgID string) error
	DisputePayment(ctx context.Context, paymentID, userID, orgID string, input services.DisputePaymentInput) error
	GetPaymentsByClaimID(ctx context.Context, claimID, orgID string) ([]models.Payment, error)
	GetPaymentSummary(ctx context.Context, claimID, orgID string) (*models.PaymentSummary, error)
	CheckClaimReadyForClosure(ctx context.Context, claimID, orgID string) (*models.ClaimClosureStatus, error)
}

type PaymentHandler struct {
	service PaymentServiceInterface
}

func NewPaymentHandler(service PaymentServiceInterface) *PaymentHandler {
	return &PaymentHandler{service: service}
}

// CreateExpectedPayment creates an expected payment record
// POST /api/claims/:id/payments
func (h *PaymentHandler) CreateExpectedPayment(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	var input services.CreateExpectedPaymentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	paymentID, err := h.service.CreateExpectedPayment(c.Request.Context(), claimID, user.ID, user.OrganizationID, input)
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
			"error":   "Failed to create payment: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"payment_id": paymentID,
		},
	})
}

// ListPaymentsByClaimID retrieves all payments for a claim
// GET /api/claims/:id/payments
func (h *PaymentHandler) ListPaymentsByClaimID(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	payments, err := h.service.GetPaymentsByClaimID(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to list payments: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    payments,
	})
}

// RecordPaymentReceived records that a payment has been received
// PATCH /api/payments/:id/received
func (h *PaymentHandler) RecordPaymentReceived(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	paymentID := c.Param("id")

	var input services.RecordPaymentReceivedInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.RecordPaymentReceived(c.Request.Context(), paymentID, user.ID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "payment not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Payment not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to record payment: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payment recorded successfully",
	})
}

// ReconcilePayment compares expected vs received and marks as reconciled or disputed
// PATCH /api/payments/:id/reconcile
func (h *PaymentHandler) ReconcilePayment(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	paymentID := c.Param("id")

	err := h.service.ReconcilePayment(c.Request.Context(), paymentID, user.ID, user.OrganizationID)
	if err != nil {
		if err.Error() == "payment not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Payment not found",
			})
			return
		}
		if err.Error() == "payment must be received before reconciliation" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Payment must be received before reconciliation",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to reconcile payment: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payment reconciled successfully",
	})
}

// DisputePayment manually disputes a payment with a reason
// PATCH /api/payments/:id/dispute
func (h *PaymentHandler) DisputePayment(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	paymentID := c.Param("id")

	var input services.DisputePaymentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request body: " + err.Error(),
		})
		return
	}

	err := h.service.DisputePayment(c.Request.Context(), paymentID, user.ID, user.OrganizationID, input)
	if err != nil {
		if err.Error() == "payment not found" {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Payment not found",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to dispute payment: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Payment disputed successfully",
	})
}

// GetPaymentSummary calculates payment summary for a claim
// GET /api/claims/:id/payment-summary
func (h *PaymentHandler) GetPaymentSummary(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	summary, err := h.service.GetPaymentSummary(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get payment summary: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    summary,
	})
}

// CheckClaimReadyForClosure determines if a claim can be closed based on payment status
// GET /api/claims/:id/closure-status
func (h *PaymentHandler) CheckClaimReadyForClosure(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	claimID := c.Param("id")

	status, err := h.service.CheckClaimReadyForClosure(c.Request.Context(), claimID, user.OrganizationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to check closure status: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}
