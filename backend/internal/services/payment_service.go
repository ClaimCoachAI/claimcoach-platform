package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// PaymentService handles payment tracking and reconciliation
type PaymentService struct {
	db           *sql.DB
	claimService *ClaimService
}

// NewPaymentService creates a new PaymentService instance
func NewPaymentService(db *sql.DB, claimService *ClaimService) *PaymentService {
	return &PaymentService{
		db:           db,
		claimService: claimService,
	}
}

// CreateExpectedPaymentInput contains data for creating an expected payment
type CreateExpectedPaymentInput struct {
	PaymentType    string  `json:"payment_type"`
	ExpectedAmount float64 `json:"expected_amount"`
	Notes          *string `json:"notes"`
}

// CreateExpectedPayment creates an expected payment record
func (s *PaymentService) CreateExpectedPayment(ctx context.Context, claimID, userID, orgID string, input CreateExpectedPaymentInput) (string, error) {
	// Verify claim ownership
	claim, err := s.claimService.GetClaim(claimID, orgID)
	if err != nil {
		return "", fmt.Errorf("failed to get claim: %w", err)
	}
	if claim == nil {
		return "", fmt.Errorf("claim not found")
	}

	// Generate payment ID
	paymentID := uuid.New().String()

	// Insert payment with expected status
	query := `
		INSERT INTO payments (
			id, claim_id, payment_type, amount, expected_amount, status, notes
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		paymentID,
		claimID,
		input.PaymentType,
		0.0, // Amount starts at 0 until received
		input.ExpectedAmount,
		models.PaymentStatusExpected,
		input.Notes,
	)
	if err != nil {
		return "", fmt.Errorf("failed to create payment: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"payment_id":      paymentID,
		"payment_type":    input.PaymentType,
		"expected_amount": input.ExpectedAmount,
	}
	err = s.logActivity(ctx, claimID, userID, "payment_expected", fmt.Sprintf("Expected %s payment: $%.2f", input.PaymentType, input.ExpectedAmount), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return paymentID, nil
}

// RecordPaymentReceivedInput contains data for recording a received payment
type RecordPaymentReceivedInput struct {
	Amount         float64  `json:"amount"`
	CheckNumber    *string  `json:"check_number"`
	ReceivedDate   string   `json:"received_date"`
	CheckImageURL  *string  `json:"check_image_url"`
	Notes          *string  `json:"notes"`
}

// RecordPaymentReceived records that a payment has been received
func (s *PaymentService) RecordPaymentReceived(ctx context.Context, paymentID, userID, orgID string, input RecordPaymentReceivedInput) error {
	// Verify ownership
	payment, err := s.getPaymentWithOwnershipCheck(ctx, paymentID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get payment: %w", err)
	}
	if payment == nil {
		return fmt.Errorf("payment not found")
	}

	// Update payment
	query := `
		UPDATE payments
		SET amount = $1, check_number = $2, received_date = $3,
			check_image_url = $4, status = $5, received_by_user_id = $6,
			notes = COALESCE($7, notes), updated_at = NOW()
		WHERE id = $8
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		input.Amount,
		input.CheckNumber,
		input.ReceivedDate,
		input.CheckImageURL,
		models.PaymentStatusReceived,
		userID,
		input.Notes,
		paymentID,
	)
	if err != nil {
		return fmt.Errorf("failed to record payment: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"payment_id":   paymentID,
		"payment_type": payment.PaymentType,
		"amount":       input.Amount,
	}
	if input.CheckNumber != nil {
		metadata["check_number"] = *input.CheckNumber
	}
	err = s.logActivity(ctx, payment.ClaimID, userID, "payment_received", fmt.Sprintf("%s payment received: $%.2f", payment.PaymentType, input.Amount), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// ReconcilePayment compares expected vs received and marks as reconciled or disputed
func (s *PaymentService) ReconcilePayment(ctx context.Context, paymentID, userID, orgID string) error {
	// Verify ownership
	payment, err := s.getPaymentWithOwnershipCheck(ctx, paymentID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get payment: %w", err)
	}
	if payment == nil {
		return fmt.Errorf("payment not found")
	}

	if payment.Status != models.PaymentStatusReceived {
		return fmt.Errorf("payment must be received before reconciliation")
	}

	// Determine reconciliation status
	status := models.PaymentStatusReconciled
	var disputeReason *string

	// Check if amounts match (within $0.01 tolerance for floating point)
	if payment.ExpectedAmount != nil {
		delta := payment.Amount - *payment.ExpectedAmount
		if delta < -0.01 || delta > 0.01 {
			status = models.PaymentStatusDisputed
			reason := fmt.Sprintf("Amount mismatch: received $%.2f, expected $%.2f (delta: $%.2f)", payment.Amount, *payment.ExpectedAmount, delta)
			disputeReason = &reason
		}
	}

	// Update payment
	query := `
		UPDATE payments
		SET status = $1, dispute_reason = $2, reconciled_at = NOW(), reconciled_by_user_id = $3, updated_at = NOW()
		WHERE id = $4
	`

	_, err = s.db.ExecContext(ctx, query, status, disputeReason, userID, paymentID)
	if err != nil {
		return fmt.Errorf("failed to reconcile payment: %w", err)
	}

	// Log activity
	description := fmt.Sprintf("%s payment reconciled", payment.PaymentType)
	activityType := "payment_reconciled"
	if status == models.PaymentStatusDisputed {
		description = fmt.Sprintf("%s payment disputed: %s", payment.PaymentType, *disputeReason)
		activityType = "payment_disputed"
	}

	metadata := map[string]interface{}{
		"payment_id":   paymentID,
		"payment_type": payment.PaymentType,
		"status":       status,
	}
	if disputeReason != nil {
		metadata["dispute_reason"] = *disputeReason
	}
	err = s.logActivity(ctx, payment.ClaimID, userID, activityType, description, metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// DisputePaymentInput contains data for disputing a payment
type DisputePaymentInput struct {
	DisputeReason string `json:"dispute_reason"`
}

// DisputePayment manually disputes a payment with a reason
func (s *PaymentService) DisputePayment(ctx context.Context, paymentID, userID, orgID string, input DisputePaymentInput) error {
	// Verify ownership
	payment, err := s.getPaymentWithOwnershipCheck(ctx, paymentID, orgID)
	if err != nil {
		return fmt.Errorf("failed to get payment: %w", err)
	}
	if payment == nil {
		return fmt.Errorf("payment not found")
	}

	// Update payment
	query := `
		UPDATE payments
		SET status = $1, dispute_reason = $2, updated_at = NOW()
		WHERE id = $3
	`

	_, err = s.db.ExecContext(ctx, query, models.PaymentStatusDisputed, input.DisputeReason, paymentID)
	if err != nil {
		return fmt.Errorf("failed to dispute payment: %w", err)
	}

	// Log activity
	metadata := map[string]interface{}{
		"payment_id":      paymentID,
		"payment_type":    payment.PaymentType,
		"dispute_reason":  input.DisputeReason,
	}
	err = s.logActivity(ctx, payment.ClaimID, userID, "payment_disputed", fmt.Sprintf("%s payment disputed", payment.PaymentType), metadata)
	if err != nil {
		log.Printf("Warning: failed to log activity: %v", err)
	}

	return nil
}

// GetPaymentsByClaimID retrieves all payments for a claim
func (s *PaymentService) GetPaymentsByClaimID(ctx context.Context, claimID, orgID string) ([]models.Payment, error) {
	query := `
		SELECT p.*
		FROM payments p
		INNER JOIN claims c ON p.claim_id = c.id
		INNER JOIN properties prop ON c.property_id = prop.id
		WHERE p.claim_id = $1 AND prop.organization_id = $2
		ORDER BY p.created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to list payments: %w", err)
	}
	defer rows.Close()

	var payments []models.Payment
	for rows.Next() {
		var payment models.Payment
		err := rows.Scan(
			&payment.ID,
			&payment.ClaimID,
			&payment.PaymentType,
			&payment.Amount,
			&payment.CheckNumber,
			&payment.ReceivedDate,
			&payment.Notes,
			&payment.Status,
			&payment.ExpectedAmount,
			&payment.ReceivedByUserID,
			&payment.ReconciledAt,
			&payment.ReconciledByUserID,
			&payment.DisputeReason,
			&payment.CheckImageURL,
			&payment.Metadata,
			&payment.CreatedAt,
			&payment.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan payment: %w", err)
		}
		payments = append(payments, payment)
	}

	return payments, nil
}

// GetPaymentSummary calculates payment summary for a claim
func (s *PaymentService) GetPaymentSummary(ctx context.Context, claimID, orgID string) (*models.PaymentSummary, error) {
	payments, err := s.GetPaymentsByClaimID(ctx, claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to get payments: %w", err)
	}

	summary := &models.PaymentSummary{
		TotalACVReceived: 0,
		TotalRCVReceived: 0,
		ExpectedACV:      0,
		ExpectedRCV:      0,
		ACVDelta:         0,
		RCVDelta:         0,
		FullyReconciled:  true,
		HasDisputes:      false,
	}

	for _, payment := range payments {
		// Accumulate received amounts
		if payment.Status == models.PaymentStatusReceived || payment.Status == models.PaymentStatusReconciled {
			if payment.PaymentType == models.PaymentTypeACV {
				summary.TotalACVReceived += payment.Amount
			} else if payment.PaymentType == models.PaymentTypeRCV {
				summary.TotalRCVReceived += payment.Amount
			}
		}

		// Accumulate expected amounts
		if payment.ExpectedAmount != nil {
			if payment.PaymentType == models.PaymentTypeACV {
				summary.ExpectedACV += *payment.ExpectedAmount
			} else if payment.PaymentType == models.PaymentTypeRCV {
				summary.ExpectedRCV += *payment.ExpectedAmount
			}
		}

		// Check reconciliation status
		if payment.Status != models.PaymentStatusReconciled {
			summary.FullyReconciled = false
		}

		// Check for disputes
		if payment.Status == models.PaymentStatusDisputed {
			summary.HasDisputes = true
		}
	}

	// Calculate deltas
	summary.ACVDelta = summary.TotalACVReceived - summary.ExpectedACV
	summary.RCVDelta = summary.TotalRCVReceived - summary.ExpectedRCV

	return summary, nil
}

// CheckClaimReadyForClosure determines if a claim can be closed based on payment status
func (s *PaymentService) CheckClaimReadyForClosure(ctx context.Context, claimID, orgID string) (*models.ClaimClosureStatus, error) {
	summary, err := s.GetPaymentSummary(ctx, claimID, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to get payment summary: %w", err)
	}

	status := &models.ClaimClosureStatus{
		CanClose:       false,
		BlockingReason: "",
		ACVReceived:    false,
		RCVReceived:    false,
		AllReconciled:  summary.FullyReconciled,
		OutstandingACV: 0,
		OutstandingRCV: 0,
	}

	// Check ACV status
	if summary.ExpectedACV > 0 && summary.TotalACVReceived >= summary.ExpectedACV {
		status.ACVReceived = true
	} else {
		status.OutstandingACV = summary.ExpectedACV - summary.TotalACVReceived
	}

	// Check RCV status
	if summary.ExpectedRCV > 0 && summary.TotalRCVReceived >= summary.ExpectedRCV {
		status.RCVReceived = true
	} else {
		status.OutstandingRCV = summary.ExpectedRCV - summary.TotalRCVReceived
	}

	// Determine if claim can be closed
	// Business rule: ACV must be received, RCV can be waived
	if !status.ACVReceived {
		status.BlockingReason = "ACV payment not received"
	} else if summary.ExpectedRCV > 0 && !status.RCVReceived {
		status.BlockingReason = "RCV payment pending"
	} else if summary.HasDisputes {
		status.BlockingReason = "Payment disputes must be resolved"
	} else if !status.AllReconciled {
		status.BlockingReason = "All payments must be reconciled"
	} else {
		status.CanClose = true
	}

	return status, nil
}

// Helper: getPaymentWithOwnershipCheck retrieves a payment with organization verification
func (s *PaymentService) getPaymentWithOwnershipCheck(ctx context.Context, paymentID, orgID string) (*models.Payment, error) {
	query := `
		SELECT p.*
		FROM payments p
		INNER JOIN claims c ON p.claim_id = c.id
		INNER JOIN properties prop ON c.property_id = prop.id
		WHERE p.id = $1 AND prop.organization_id = $2
	`

	var payment models.Payment
	err := s.db.QueryRowContext(ctx, query, paymentID, orgID).Scan(
		&payment.ID,
		&payment.ClaimID,
		&payment.PaymentType,
		&payment.Amount,
		&payment.CheckNumber,
		&payment.ReceivedDate,
		&payment.Notes,
		&payment.Status,
		&payment.ExpectedAmount,
		&payment.ReceivedByUserID,
		&payment.ReconciledAt,
		&payment.ReconciledByUserID,
		&payment.DisputeReason,
		&payment.CheckImageURL,
		&payment.Metadata,
		&payment.CreatedAt,
		&payment.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get payment: %w", err)
	}

	return &payment, nil
}

// Helper: logActivity logs an activity for a claim
func (s *PaymentService) logActivity(ctx context.Context, claimID, userID, activityType, description string, metadata map[string]interface{}) error {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	query := `
		INSERT INTO claim_activities (id, claim_id, user_id, activity_type, description, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err = s.db.ExecContext(
		ctx,
		query,
		uuid.New().String(),
		claimID,
		userID,
		activityType,
		description,
		string(metadataJSON),
	)

	return err
}
