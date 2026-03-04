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
// and returns the saved inspection. Both writes are wrapped in a transaction so that
// a failure on the second write does not leave the database in a partial state.
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

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

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

	err = tx.QueryRow(
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
	err = tx.QueryRow(
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

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	insp.AreaSelection = &area
	return &insp, nil
}

// SaveElevationInput is the request body for saving one elevation side.
type SaveElevationInput struct {
	PhotoDocumentID *string  `json:"photo_document_id"`
	HasDamage       bool     `json:"has_damage"`
	SidingType      *string  `json:"siding_type"`
	SidingReplaceSF *float64 `json:"siding_replace_sf"`
	SidingPaintSF   *float64 `json:"siding_paint_sf"`
	GutterLF        *float64 `json:"gutter_lf"`
	WindowsCount    *int     `json:"windows_count"`
	DoorsCount      *int     `json:"doors_count"`
	Notes           *string  `json:"notes"`
}

// GetElevations loads all saved elevation rows for the inspection identified by token.
// Returns an empty slice (not nil) when no rows exist yet.
func (s *InspectionService) GetElevations(token string) ([]models.InspectionElevation, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var inspectionID string
	err = s.db.QueryRow(
		`SELECT id FROM inspection_v2 WHERE magic_link_id = $1`,
		validation.MagicLinkID,
	).Scan(&inspectionID)
	if err == sql.ErrNoRows {
		// Inspection not started yet — return empty slice.
		return []models.InspectionElevation{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	rows, err := s.db.Query(`
		SELECT e.id, e.inspection_id, e.side,
		       e.photo_document_id, d.file_url,
		       e.has_damage, e.siding_type,
		       e.siding_replace_sf, e.siding_paint_sf, e.gutter_lf,
		       e.windows_count, e.doors_count, e.notes,
		       e.created_at, e.updated_at
		FROM inspection_elevation e
		LEFT JOIN documents d ON d.id = e.photo_document_id
		WHERE e.inspection_id = $1
		ORDER BY CASE e.side
			WHEN 'front' THEN 1
			WHEN 'right' THEN 2
			WHEN 'back'  THEN 3
			WHEN 'left'  THEN 4
		END
	`, inspectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query elevations: %w", err)
	}
	defer rows.Close()

	elevations := []models.InspectionElevation{}
	for rows.Next() {
		var e models.InspectionElevation
		if err = rows.Scan(
			&e.ID, &e.InspectionID, &e.Side,
			&e.PhotoDocumentID, &e.PhotoURL,
			&e.HasDamage, &e.SidingType,
			&e.SidingReplaceSF, &e.SidingPaintSF, &e.GutterLF,
			&e.WindowsCount, &e.DoorsCount, &e.Notes,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan elevation row: %w", err)
		}
		elevations = append(elevations, e)
	}
	return elevations, rows.Err()
}

// SaveElevation upserts a single elevation side for the inspection identified by token.
// It advances current_step to 3 when all 4 sides have a confirmed photo.
func (s *InspectionService) SaveElevation(token string, side string, input SaveElevationInput) (*models.InspectionElevation, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var inspectionID string
	err = s.db.QueryRow(
		`SELECT id FROM inspection_v2 WHERE magic_link_id = $1`,
		validation.MagicLinkID,
	).Scan(&inspectionID)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("inspection not found for this magic link: %w", err)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	now := time.Now()
	newID := uuid.New().String()

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	var e models.InspectionElevation
	err = tx.QueryRow(`
		WITH upserted AS (
			INSERT INTO inspection_elevation (
				id, inspection_id, side,
				photo_document_id, has_damage, siding_type,
				siding_replace_sf, siding_paint_sf, gutter_lf,
				windows_count, doors_count, notes,
				created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
			ON CONFLICT (inspection_id, side) DO UPDATE
			SET photo_document_id = EXCLUDED.photo_document_id,
			    has_damage        = EXCLUDED.has_damage,
			    siding_type       = EXCLUDED.siding_type,
			    siding_replace_sf = EXCLUDED.siding_replace_sf,
			    siding_paint_sf   = EXCLUDED.siding_paint_sf,
			    gutter_lf         = EXCLUDED.gutter_lf,
			    windows_count     = EXCLUDED.windows_count,
			    doors_count       = EXCLUDED.doors_count,
			    notes             = EXCLUDED.notes,
			    updated_at        = EXCLUDED.updated_at
			RETURNING *
		)
		SELECT u.id, u.inspection_id, u.side,
		       u.photo_document_id, d.file_url,
		       u.has_damage, u.siding_type,
		       u.siding_replace_sf, u.siding_paint_sf, u.gutter_lf,
		       u.windows_count, u.doors_count, u.notes,
		       u.created_at, u.updated_at
		FROM upserted u
		LEFT JOIN documents d ON d.id = u.photo_document_id
	`,
		newID, inspectionID, side,
		input.PhotoDocumentID, input.HasDamage, input.SidingType,
		input.SidingReplaceSF, input.SidingPaintSF, input.GutterLF,
		input.WindowsCount, input.DoorsCount, input.Notes,
		now,
	).Scan(
		&e.ID, &e.InspectionID, &e.Side,
		&e.PhotoDocumentID, &e.PhotoURL,
		&e.HasDamage, &e.SidingType,
		&e.SidingReplaceSF, &e.SidingPaintSF, &e.GutterLF,
		&e.WindowsCount, &e.DoorsCount, &e.Notes,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert elevation: %w", err)
	}

	// Advance to step 3 once all 4 sides have a confirmed photo.
	// The count and UPDATE run inside the same transaction as the upsert.
	var sidesWithPhoto int
	if countErr := tx.QueryRow(`
		SELECT COUNT(*) FROM inspection_elevation
		WHERE inspection_id = $1 AND photo_document_id IS NOT NULL
	`, inspectionID).Scan(&sidesWithPhoto); countErr == nil && sidesWithPhoto == 4 {
		if _, err = tx.Exec(
			`UPDATE inspection_v2 SET current_step = 3, updated_at = $1
			 WHERE id = $2 AND current_step < 3`,
			now, inspectionID,
		); err != nil {
			return nil, fmt.Errorf("failed to advance inspection step: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit elevation save: %w", err)
	}

	return &e, nil
}
