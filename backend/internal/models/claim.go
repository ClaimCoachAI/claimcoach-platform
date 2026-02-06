package models

import "time"

type Claim struct {
	ID              string     `json:"id" db:"id"`
	PropertyID      string     `json:"property_id" db:"property_id"`
	PolicyID        string     `json:"policy_id" db:"policy_id"`
	ClaimNumber     *string    `json:"claim_number" db:"claim_number"`
	LossType        string     `json:"loss_type" db:"loss_type"`
	IncidentDate    time.Time  `json:"incident_date" db:"incident_date"`
	Status          string     `json:"status" db:"status"`
	FiledAt         *time.Time `json:"filed_at" db:"filed_at"`
	AssignedUserID  *string    `json:"assigned_user_id" db:"assigned_user_id"`
	AdjusterName    *string    `json:"adjuster_name" db:"adjuster_name"`
	AdjusterPhone   *string    `json:"adjuster_phone" db:"adjuster_phone"`
	MeetingDatetime *time.Time `json:"meeting_datetime" db:"meeting_datetime"`
	CreatedByUserID         string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt               time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at" db:"updated_at"`
	ContractorEstimateTotal *float64   `json:"contractor_estimate_total" db:"contractor_estimate_total"`
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
