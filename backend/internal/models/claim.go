package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// IntArray is a custom type for handling JSONB integer arrays
type IntArray []int

// Scan implements the sql.Scanner interface for IntArray
func (a *IntArray) Scan(value interface{}) error {
	if value == nil {
		*a = []int{}
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to scan IntArray: expected []byte, got %T", value)
	}

	return json.Unmarshal(bytes, a)
}

// Value implements the driver.Valuer interface for IntArray
func (a IntArray) Value() (driver.Value, error) {
	if a == nil {
		return []byte("[]"), nil
	}
	return json.Marshal(a)
}

type Claim struct {
	ID              string     `json:"id" db:"id"`
	PropertyID      string     `json:"property_id" db:"property_id"`
	PolicyID        string     `json:"policy_id" db:"policy_id"`
	ClaimNumber     *string    `json:"claim_number" db:"claim_number"`
	LossType        string     `json:"loss_type" db:"loss_type"`
	IncidentDate    time.Time  `json:"incident_date" db:"incident_date"`
	Status          string     `json:"status" db:"status"`
	FiledAt         *time.Time `json:"filed_at" db:"filed_at"`
	Description     *string    `json:"description" db:"description"`

	// Step tracking
	CurrentStep    int      `json:"current_step" db:"current_step"`
	StepsCompleted IntArray `json:"steps_completed" db:"steps_completed"`

	// Step-specific fields
	ContractorEmail            *string    `json:"contractor_email" db:"contractor_email"`
	ContractorName             *string    `json:"contractor_name" db:"contractor_name"`
	ContractorPhotosUploadedAt *time.Time `json:"contractor_photos_uploaded_at" db:"contractor_photos_uploaded_at"`
	ContractorEstimateTotal    *float64   `json:"contractor_estimate_total" db:"contractor_estimate_total"`
	DeductibleComparisonResult *string    `json:"deductible_comparison_result" db:"deductible_comparison_result"`
	InsuranceClaimNumber       *string    `json:"insurance_claim_number" db:"insurance_claim_number"`
	InspectionDatetime         *time.Time `json:"inspection_datetime" db:"inspection_datetime"`

	// Existing fields
	AssignedUserID  *string    `json:"assigned_user_id" db:"assigned_user_id"`
	AdjusterName    *string    `json:"adjuster_name" db:"adjuster_name"`
	AdjusterPhone   *string    `json:"adjuster_phone" db:"adjuster_phone"`
	MeetingDatetime *time.Time `json:"meeting_datetime" db:"meeting_datetime"`
	CreatedByUserID string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

type ClaimActivity struct {
	ID           string     `json:"id" db:"id"`
	ClaimID      string     `json:"claim_id" db:"claim_id"`
	UserID       *string    `json:"user_id" db:"user_id"`
	ActivityType string     `json:"activity_type" db:"activity_type"`
	Description  string     `json:"description" db:"description"`
	Metadata     *string    `json:"metadata" db:"metadata"` // JSON string
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
}
