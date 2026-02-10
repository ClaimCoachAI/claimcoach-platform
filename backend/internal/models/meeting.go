package models

import "time"

type Meeting struct {
	ID                        string     `json:"id" db:"id"`
	ClaimID                   string     `json:"claim_id" db:"claim_id"`
	MeetingType               string     `json:"meeting_type" db:"meeting_type"`
	ScheduledDate             string     `json:"scheduled_date" db:"scheduled_date"`         // DATE as string
	ScheduledTime             string     `json:"scheduled_time" db:"scheduled_time"`         // TIME as string
	Location                  string     `json:"location" db:"location"`
	DurationMinutes           *int       `json:"duration_minutes" db:"duration_minutes"`
	Status                    string     `json:"status" db:"status"`
	AdjusterName              *string    `json:"adjuster_name" db:"adjuster_name"`
	AdjusterEmail             *string    `json:"adjuster_email" db:"adjuster_email"`
	AdjusterPhone             *string    `json:"adjuster_phone" db:"adjuster_phone"`
	AssignedRepresentativeID  *string    `json:"assigned_representative_id" db:"assigned_representative_id"`
	Notes                     *string    `json:"notes" db:"notes"`
	OutcomeSummary            *string    `json:"outcome_summary" db:"outcome_summary"`
	CreatedByUserID           string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt                 time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at" db:"updated_at"`
	CompletedAt               *time.Time `json:"completed_at" db:"completed_at"`
	CancelledAt               *time.Time `json:"cancelled_at" db:"cancelled_at"`
	CancellationReason        *string    `json:"cancellation_reason" db:"cancellation_reason"`
}

// Meeting type constants
const (
	MeetingTypeAdjusterInspection    = "adjuster_inspection"
	MeetingTypeContractorWalkthrough = "contractor_walkthrough"
	MeetingTypeFinalInspection       = "final_inspection"
)

// Meeting status constants
const (
	MeetingStatusScheduled   = "scheduled"
	MeetingStatusConfirmed   = "confirmed"
	MeetingStatusCompleted   = "completed"
	MeetingStatusCancelled   = "cancelled"
	MeetingStatusRescheduled = "rescheduled"
)
