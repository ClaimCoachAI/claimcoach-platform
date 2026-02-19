package models

import "time"

// ScopeArea represents a single damage area captured during the contractor walkthrough
type ScopeArea struct {
	ID          string             `json:"id"`
	Category    string             `json:"category"`
	CategoryKey string             `json:"category_key"`
	Order       int                `json:"order"`
	Tags        []string           `json:"tags"`
	Dimensions  map[string]float64 `json:"dimensions"`
	PhotoIDs    []string           `json:"photo_ids"`
	Notes       string             `json:"notes"`
}

// ScopeSheet represents a contractor's damage scope submission
type ScopeSheet struct {
	ID               string      `json:"id"`
	ClaimID          string      `json:"claim_id"`
	Areas            []ScopeArea `json:"areas"`
	TriageSelections []string    `json:"triage_selections"`
	GeneralNotes     *string     `json:"general_notes"`

	// Draft fields
	IsDraft      bool       `json:"is_draft"`
	DraftStep    *int       `json:"draft_step,omitempty"`
	DraftSavedAt *time.Time `json:"draft_saved_at,omitempty"`

	SubmittedAt *time.Time `json:"submitted_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
