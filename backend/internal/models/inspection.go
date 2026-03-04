package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

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

// ── Roof ──────────────────────────────────────────────────────────────────────

// InspectionRoof holds metrics and named photo slots for the roof inspection step.
type InspectionRoof struct {
	ID                string    `json:"id" db:"id"`
	InspectionID      string    `json:"inspection_id" db:"inspection_id"`
	OverviewPhotoID   *string   `json:"overview_photo_id" db:"overview_photo_id"`
	OverviewPhotoURL  *string   `json:"overview_photo_url,omitempty"` // populated via JOIN
	SlopePhotoID      *string   `json:"slope_photo_id" db:"slope_photo_id"`
	SlopePhotoURL     *string   `json:"slope_photo_url,omitempty"`    // populated via JOIN
	ShinglesPhotoID   *string   `json:"shingles_photo_id" db:"shingles_photo_id"`
	ShinglesPhotoURL  *string   `json:"shingles_photo_url,omitempty"` // populated via JOIN
	RidgePhotoID      *string   `json:"ridge_photo_id" db:"ridge_photo_id"`
	RidgePhotoURL     *string   `json:"ridge_photo_url,omitempty"`    // populated via JOIN
	Pitch             *string   `json:"pitch" db:"pitch"`
	ShingleType       *string   `json:"shingle_type" db:"shingle_type"`
	Layers            *int      `json:"layers" db:"layers"`
	Squares           *float64  `json:"squares" db:"squares"`
	HasRidgeDamage    bool      `json:"has_ridge_damage" db:"has_ridge_damage"`
	HasValleyDamage   bool      `json:"has_valley_damage" db:"has_valley_damage"`
	HasFlashingDamage bool      `json:"has_flashing_damage" db:"has_flashing_damage"`
	DeckingCondition  *string   `json:"decking_condition" db:"decking_condition"`
	Notes             *string   `json:"notes" db:"notes"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}

// RoofDamageSpot is one damage-evidence photo attached to a roof inspection.
type RoofDamageSpot struct {
	ID        string    `json:"id" db:"id"`
	RoofID    string    `json:"roof_id" db:"roof_id"`
	PhotoID   *string   `json:"photo_id" db:"photo_id"`
	PhotoURL  *string   `json:"photo_url" db:"photo_url"`
	Caption   *string   `json:"caption" db:"caption"`
	SortOrder int       `json:"sort_order" db:"sort_order"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

// JSONStringSlice is a []string that reads/writes as a JSONB array in Postgres.
// It implements driver.Valuer (for writes) and sql.Scanner (for reads).
type JSONStringSlice []string

func (j JSONStringSlice) Value() (driver.Value, error) {
	if j == nil {
		return "[]", nil
	}
	b, err := json.Marshal(j)
	if err != nil {
		return nil, fmt.Errorf("JSONStringSlice.Value: %w", err)
	}
	return string(b), nil
}

func (j *JSONStringSlice) Scan(src interface{}) error {
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, j)
	case string:
		return json.Unmarshal([]byte(v), j)
	case nil:
		*j = JSONStringSlice{}
		return nil
	default:
		return fmt.Errorf("JSONStringSlice.Scan: unsupported type %T", src)
	}
}

// InspectionRoom is one room recorded during the interior inspection step.
type InspectionRoom struct {
	ID               string               `json:"id" db:"id"`
	InspectionID     string               `json:"inspection_id" db:"inspection_id"`
	Name             string               `json:"name" db:"name"`
	LengthFt         *float64             `json:"length_ft" db:"length_ft"`
	WidthFt          *float64             `json:"width_ft" db:"width_ft"`
	HeightFt         *float64             `json:"height_ft" db:"height_ft"`
	DamagedMaterials JSONStringSlice      `json:"damaged_materials" db:"damaged_materials"`
	Notes            *string              `json:"notes" db:"notes"`
	SortOrder        int                  `json:"sort_order" db:"sort_order"`
	CreatedAt        time.Time            `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at" db:"updated_at"`
	Photos           []InspectionRoomPhoto `json:"photos"`
}

// InspectionRoomPhoto is one damage-evidence photo attached to a room.
type InspectionRoomPhoto struct {
	ID        string    `json:"id" db:"id"`
	RoomID    string    `json:"room_id" db:"room_id"`
	PhotoID   *string   `json:"photo_id" db:"photo_id"`
	PhotoURL  *string   `json:"photo_url" db:"photo_url"`
	Caption   *string   `json:"caption" db:"caption"`
	SortOrder int       `json:"sort_order" db:"sort_order"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
