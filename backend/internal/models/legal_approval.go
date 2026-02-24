package models

import "time"

// LegalApprovalRequest represents a homeowner approval request for legal escalation.
// One row is created per escalation attempt. The token is a one-time-use UUID v4.
type LegalApprovalRequest struct {
	ID          string     `json:"id" db:"id"`
	ClaimID     string     `json:"claim_id" db:"claim_id"`
	Token       string     `json:"token" db:"token"`
	OwnerName   string     `json:"owner_name" db:"owner_name"`
	OwnerEmail  string     `json:"owner_email" db:"owner_email"`
	Status      string     `json:"status" db:"status"` // pending | approved | declined | expired
	ExpiresAt   time.Time  `json:"expires_at" db:"expires_at"`
	RespondedAt *time.Time `json:"responded_at,omitempty" db:"responded_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

// LegalApprovalStatus constants
const (
	LegalApprovalStatusPending  = "pending"
	LegalApprovalStatusApproved = "approved"
	LegalApprovalStatusDeclined = "declined"
	LegalApprovalStatusExpired  = "expired"
)
