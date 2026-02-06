package models

import "time"

type CarrierEstimate struct {
	ID               string     `json:"id" db:"id"`
	ClaimID          string     `json:"claim_id" db:"claim_id"`
	UploadedByUserID string     `json:"uploaded_by_user_id" db:"uploaded_by_user_id"`
	FilePath         string     `json:"file_path" db:"file_path"`
	FileName         string     `json:"file_name" db:"file_name"`
	FileSizeBytes    *int64     `json:"file_size_bytes" db:"file_size_bytes"`
	ParsedData       *string    `json:"parsed_data" db:"parsed_data"` // JSONB stored as string
	ParseStatus      string     `json:"parse_status" db:"parse_status"`
	ParseError       *string    `json:"parse_error" db:"parse_error"`
	UploadedAt       time.Time  `json:"uploaded_at" db:"uploaded_at"`
	ParsedAt         *time.Time `json:"parsed_at" db:"parsed_at"`
}

// Parse status constants
const (
	ParseStatusPending    = "pending"
	ParseStatusProcessing = "processing"
	ParseStatusCompleted  = "completed"
	ParseStatusFailed     = "failed"
)
