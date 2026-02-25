package models

import "time"

type AuditReport struct {
	ID                      string     `json:"id" db:"id"`
	ClaimID                 string     `json:"claim_id" db:"claim_id"`
	ScopeSheetID            string     `json:"scope_sheet_id" db:"scope_sheet_id"`
	CarrierEstimateID       *string    `json:"carrier_estimate_id" db:"carrier_estimate_id"`
	GeneratedEstimate       *string    `json:"generated_estimate" db:"generated_estimate"`    // JSON string
	ComparisonData          *string    `json:"comparison_data" db:"comparison_data"`          // JSON string
	ViabilityAnalysis       *string    `json:"viability_analysis" db:"viability_analysis"`      // JSON string
	PMBrainAnalysis         *string    `json:"pm_brain_analysis" db:"pm_brain_analysis"`        // JSON string
	DisputeLetter           *string    `json:"dispute_letter" db:"dispute_letter"`              // plain text
	OwnerPitch              *string    `json:"owner_pitch" db:"owner_pitch"`
	TotalContractorEstimate *float64   `json:"total_contractor_estimate" db:"total_contractor_estimate"`
	TotalCarrierEstimate    *float64   `json:"total_carrier_estimate" db:"total_carrier_estimate"`
	TotalDelta              *float64   `json:"total_delta" db:"total_delta"`
	Status                  string     `json:"status" db:"status"`
	ErrorMessage            *string    `json:"error_message" db:"error_message"`
	CreatedByUserID         string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt               time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at" db:"updated_at"`
}

// Audit report status constants
const (
	AuditStatusPending    = "pending"
	AuditStatusProcessing = "processing"
	AuditStatusCompleted  = "completed"
	AuditStatusFailed     = "failed"
)
