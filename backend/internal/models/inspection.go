package models

import "time"

type InspectionV2 struct {
	ID            string                   `json:"id" db:"id"`
	ClaimID       string                   `json:"claim_id" db:"claim_id"`
	MagicLinkID   string                   `json:"magic_link_id" db:"magic_link_id"`
	PropertyType  *string                  `json:"property_type" db:"property_type"`
	Stories       *int                     `json:"stories" db:"stories"`
	Status        string                   `json:"status" db:"status"`
	CurrentStep   int                      `json:"current_step" db:"current_step"`
	SubmittedAt   *time.Time               `json:"submitted_at" db:"submitted_at"`
	CreatedAt     time.Time                `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time                `json:"updated_at" db:"updated_at"`
	AreaSelection *InspectionAreaSelection `json:"area_selection,omitempty"`
}

type InspectionAreaSelection struct {
	InspectionID    string `json:"inspection_id" db:"inspection_id"`
	IncludeRoof     bool   `json:"include_roof" db:"include_roof"`
	IncludeExterior bool   `json:"include_exterior" db:"include_exterior"`
	IncludeInterior bool   `json:"include_interior" db:"include_interior"`
	IncludePorch    bool   `json:"include_porch" db:"include_porch"`
}
