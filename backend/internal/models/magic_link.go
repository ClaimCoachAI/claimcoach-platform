package models

import "time"

type MagicLink struct {
	ID              string     `json:"id" db:"id"`
	ClaimID         string     `json:"claim_id" db:"claim_id"`
	Token           string     `json:"token" db:"token"`
	ContractorName  string     `json:"contractor_name" db:"contractor_name"`
	ContractorEmail string     `json:"contractor_email" db:"contractor_email"`
	ContractorPhone *string    `json:"contractor_phone" db:"contractor_phone"`
	ExpiresAt       time.Time  `json:"expires_at" db:"expires_at"`
	AccessedAt      *time.Time `json:"accessed_at" db:"accessed_at"`
	AccessCount     int        `json:"access_count" db:"access_count"`
	Status          string     `json:"status" db:"status"` // active, expired, completed
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
}
