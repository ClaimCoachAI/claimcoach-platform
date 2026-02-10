package models

import "time"

type Payment struct {
	ID                    string     `json:"id" db:"id"`
	ClaimID               string     `json:"claim_id" db:"claim_id"`
	PaymentType           string     `json:"payment_type" db:"payment_type"`
	Amount                float64    `json:"amount" db:"amount"`
	CheckNumber           *string    `json:"check_number" db:"check_number"`
	ReceivedDate          *string    `json:"received_date" db:"received_date"` // DATE as string
	Notes                 *string    `json:"notes" db:"notes"`
	Status                string     `json:"status" db:"status"`
	ExpectedAmount        *float64   `json:"expected_amount" db:"expected_amount"`
	ReceivedByUserID      *string    `json:"received_by_user_id" db:"received_by_user_id"`
	ReconciledAt          *time.Time `json:"reconciled_at" db:"reconciled_at"`
	ReconciledByUserID    *string    `json:"reconciled_by_user_id" db:"reconciled_by_user_id"`
	DisputeReason         *string    `json:"dispute_reason" db:"dispute_reason"`
	CheckImageURL         *string    `json:"check_image_url" db:"check_image_url"`
	Metadata              *string    `json:"metadata" db:"metadata"` // JSONB as string
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`
}

// Payment type constants
const (
	PaymentTypeACV = "acv" // Actual Cash Value
	PaymentTypeRCV = "rcv" // Replacement Cost Value
)

// Payment status constants
const (
	PaymentStatusExpected   = "expected"
	PaymentStatusReceived   = "received"
	PaymentStatusReconciled = "reconciled"
	PaymentStatusDisputed   = "disputed"
)

// PaymentSummary represents aggregated payment information for a claim
type PaymentSummary struct {
	TotalACVReceived float64 `json:"total_acv_received"`
	TotalRCVReceived float64 `json:"total_rcv_received"`
	ExpectedACV      float64 `json:"expected_acv"`
	ExpectedRCV      float64 `json:"expected_rcv"`
	ACVDelta         float64 `json:"acv_delta"`
	RCVDelta         float64 `json:"rcv_delta"`
	FullyReconciled  bool    `json:"fully_reconciled"`
	HasDisputes      bool    `json:"has_disputes"`
}

// ClaimClosureStatus represents whether a claim can be closed
type ClaimClosureStatus struct {
	CanClose       bool    `json:"can_close"`
	BlockingReason string  `json:"blocking_reason"`
	ACVReceived    bool    `json:"acv_received"`
	RCVReceived    bool    `json:"rcv_received"`
	AllReconciled  bool    `json:"all_reconciled"`
	OutstandingACV float64 `json:"outstanding_acv"`
	OutstandingRCV float64 `json:"outstanding_rcv"`
}
