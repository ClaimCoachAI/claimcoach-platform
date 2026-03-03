package services

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/claimcoach/backend/internal/models"
	"github.com/google/uuid"
)

// InspectionService handles inspection v2 wizard operations.
type InspectionService struct {
	db            *sql.DB
	magicLinkSvc  *MagicLinkService
}

// NewInspectionService creates a new InspectionService.
func NewInspectionService(db *sql.DB, magicLinkSvc *MagicLinkService) *InspectionService {
	return &InspectionService{
		db:           db,
		magicLinkSvc: magicLinkSvc,
	}
}

// SaveSetupInput is the request body for the wizard setup step.
type SaveSetupInput struct {
	PropertyType  *string                        `json:"property_type"`
	Stories       *int                           `json:"stories"`
	AreaSelection models.InspectionAreaSelection `json:"area_selection"`
}

// GetSetupResponse is returned by GetByToken.
type GetSetupResponse struct {
	Inspection      *models.InspectionV2 `json:"inspection"`
	PropertyAddress string               `json:"property_address"`
	ContractorName  string               `json:"contractor_name"`
}

// GetByToken validates the magic-link token, loads any existing inspection_v2 row
// (including its area_selection), and returns a pre-filled GetSetupResponse.
// If no inspection row exists yet the Inspection field will be nil.
func (s *InspectionService) GetByToken(token string) (*GetSetupResponse, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	resp := &GetSetupResponse{
		ContractorName:  validation.ContractorName,
		PropertyAddress: validation.Claim.Property.LegalAddress,
	}

	// Try to load an existing inspection row for this magic link.
	inspQuery := `
		SELECT id, claim_id, magic_link_id, property_type, stories,
		       status, current_step, submitted_at, created_at, updated_at
		FROM inspection_v2
		WHERE magic_link_id = $1
		LIMIT 1
	`

	var insp models.InspectionV2
	var submittedAt sql.NullTime
	err = s.db.QueryRow(inspQuery, validation.MagicLinkID).Scan(
		&insp.ID,
		&insp.ClaimID,
		&insp.MagicLinkID,
		&insp.PropertyType,
		&insp.Stories,
		&insp.Status,
		&insp.CurrentStep,
		&submittedAt,
		&insp.CreatedAt,
		&insp.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		// No inspection yet — return nil Inspection.
		return resp, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query inspection_v2: %w", err)
	}

	if submittedAt.Valid {
		insp.SubmittedAt = &submittedAt.Time
	}

	// Try to load the area_selection row.
	areaQuery := `
		SELECT inspection_id, include_roof, include_exterior, include_interior, include_porch
		FROM inspection_area_selection
		WHERE inspection_id = $1
	`

	var area models.InspectionAreaSelection
	err = s.db.QueryRow(areaQuery, insp.ID).Scan(
		&area.InspectionID,
		&area.IncludeRoof,
		&area.IncludeExterior,
		&area.IncludeInterior,
		&area.IncludePorch,
	)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to query inspection_area_selection: %w", err)
	}
	if err == nil {
		insp.AreaSelection = &area
	}

	resp.Inspection = &insp
	return resp, nil
}

// SaveSetup validates the token, upserts the inspection_v2 row (INSERT on first call,
// UPDATE on subsequent calls), upserts the area_selection row, sets current_step = 2,
// and returns the saved inspection.
func (s *InspectionService) SaveSetup(token string, input SaveSetupInput) (*models.InspectionV2, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	claimID := validation.Claim.ID
	magicLinkID := validation.MagicLinkID
	now := time.Now()

	// Upsert inspection_v2 — insert if no row for this magic_link_id, otherwise update.
	upsertInspQuery := `
		INSERT INTO inspection_v2 (
			id, claim_id, magic_link_id, property_type, stories,
			status, current_step, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, 'in_progress', 2, $6, $6)
		ON CONFLICT (magic_link_id) DO UPDATE
		SET property_type  = EXCLUDED.property_type,
		    stories        = EXCLUDED.stories,
		    current_step   = 2,
		    updated_at     = EXCLUDED.updated_at
		RETURNING id, claim_id, magic_link_id, property_type, stories,
		          status, current_step, submitted_at, created_at, updated_at
	`

	newID := uuid.New().String()
	var insp models.InspectionV2
	var submittedAt sql.NullTime

	err = s.db.QueryRow(
		upsertInspQuery,
		newID,
		claimID,
		magicLinkID,
		input.PropertyType,
		input.Stories,
		now,
	).Scan(
		&insp.ID,
		&insp.ClaimID,
		&insp.MagicLinkID,
		&insp.PropertyType,
		&insp.Stories,
		&insp.Status,
		&insp.CurrentStep,
		&submittedAt,
		&insp.CreatedAt,
		&insp.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert inspection_v2: %w", err)
	}

	if submittedAt.Valid {
		insp.SubmittedAt = &submittedAt.Time
	}

	// Upsert area_selection.
	upsertAreaQuery := `
		INSERT INTO inspection_area_selection (
			inspection_id, include_roof, include_exterior, include_interior, include_porch
		)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (inspection_id) DO UPDATE
		SET include_roof     = EXCLUDED.include_roof,
		    include_exterior = EXCLUDED.include_exterior,
		    include_interior = EXCLUDED.include_interior,
		    include_porch    = EXCLUDED.include_porch
		RETURNING inspection_id, include_roof, include_exterior, include_interior, include_porch
	`

	var area models.InspectionAreaSelection
	err = s.db.QueryRow(
		upsertAreaQuery,
		insp.ID,
		input.AreaSelection.IncludeRoof,
		input.AreaSelection.IncludeExterior,
		input.AreaSelection.IncludeInterior,
		input.AreaSelection.IncludePorch,
	).Scan(
		&area.InspectionID,
		&area.IncludeRoof,
		&area.IncludeExterior,
		&area.IncludeInterior,
		&area.IncludePorch,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert inspection_area_selection: %w", err)
	}

	insp.AreaSelection = &area
	return &insp, nil
}
