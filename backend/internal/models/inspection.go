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

// ElevationSide represents one of the four property sides.
type ElevationSide string

const (
	ElevationSideFront ElevationSide = "front"
	ElevationSideRight ElevationSide = "right"
	ElevationSideBack  ElevationSide = "back"
	ElevationSideLeft  ElevationSide = "left"
)

// ValidElevationSides lists all four valid side values.
var ValidElevationSides = []ElevationSide{
	ElevationSideFront,
	ElevationSideRight,
	ElevationSideBack,
	ElevationSideLeft,
}

// IsValidElevationSide returns true if s is one of the four valid side values.
func IsValidElevationSide(s string) bool {
	for _, v := range ValidElevationSides {
		if string(v) == s {
			return true
		}
	}
	return false
}

// InspectionElevation holds per-side photo and damage data for an inspection.
type InspectionElevation struct {
	ID              string        `json:"id" db:"id"`
	InspectionID    string        `json:"inspection_id" db:"inspection_id"`
	Side            ElevationSide `json:"side" db:"side"`
	PhotoDocumentID *string       `json:"photo_document_id" db:"photo_document_id"`
	PhotoURL        *string       `json:"photo_url,omitempty"` // populated via JOIN, not a db column
	HasDamage       bool          `json:"has_damage" db:"has_damage"`
	SidingType      *string       `json:"siding_type" db:"siding_type"`
	SidingReplaceSF *float64      `json:"siding_replace_sf" db:"siding_replace_sf"`
	SidingPaintSF   *float64      `json:"siding_paint_sf" db:"siding_paint_sf"`
	GutterLF        *float64      `json:"gutter_lf" db:"gutter_lf"`
	WindowsCount    *int          `json:"windows_count" db:"windows_count"`
	DoorsCount      *int          `json:"doors_count" db:"doors_count"`
	Notes           *string       `json:"notes" db:"notes"`
	CreatedAt       time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at" db:"updated_at"`
}
