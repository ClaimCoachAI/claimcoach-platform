package models

import "time"

type Property struct {
	ID              string     `json:"id" db:"id"`
	OrganizationID  string     `json:"organization_id" db:"organization_id"`
	Nickname        string     `json:"nickname" db:"nickname"`
	LegalAddress    string     `json:"legal_address" db:"legal_address"`
	Lat             *float64   `json:"lat" db:"lat"`
	Lng             *float64   `json:"lng" db:"lng"`
	OwnerEntityName string     `json:"owner_entity_name" db:"owner_entity_name"`
	MortgageBankID  *string    `json:"mortgage_bank_id" db:"mortgage_bank_id"`
	Status          string     `json:"status" db:"status"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}
