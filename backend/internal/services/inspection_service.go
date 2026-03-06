package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
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

// ── Roof Sections ────────────────────────────────────────────────────────────

// CreateRoofSectionInput is the request body for POST /roof-sections.
type CreateRoofSectionInput struct {
	SectionType       *string `json:"section_type"`
	SectionCustomName *string `json:"section_custom_name"`
}

// UpdateRoofSectionInput is the request body for PATCH /roof-sections/:roofId.
type UpdateRoofSectionInput struct {
	OverviewPhotoID   *string  `json:"overview_photo_id"`
	SlopePhotoID      *string  `json:"slope_photo_id"`
	ShinglesPhotoID   *string  `json:"shingles_photo_id"`
	RidgePhotoID      *string  `json:"ridge_photo_id"`
	Pitch             *string  `json:"pitch"`
	ShingleType       *string  `json:"shingle_type"`
	Layers            *int     `json:"layers"`
	Squares           *float64 `json:"squares"`
	HasRidgeDamage    bool     `json:"has_ridge_damage"`
	HasValleyDamage   bool     `json:"has_valley_damage"`
	HasFlashingDamage bool     `json:"has_flashing_damage"`
	DeckingCondition  *string  `json:"decking_condition"`
	Notes             *string  `json:"notes"`
	Penetrations      *string  `json:"penetrations"`
	Complexity        *string  `json:"complexity"`
}

// AddDamageSpotInput is the request body for attaching one damage-spot photo.
type AddDamageSpotInput struct {
	PhotoDocumentID *string `json:"photo_document_id"`
	Caption         *string `json:"caption"`
	SortOrder       int     `json:"sort_order"`
}

const roofSelectCols = `
	r.id, r.inspection_id,
	r.overview_photo_id,  d1.file_url,
	r.slope_photo_id,     d2.file_url,
	r.shingles_photo_id,  d3.file_url,
	r.ridge_photo_id,     d4.file_url,
	r.pitch, r.shingle_type, r.layers, r.squares,
	r.has_ridge_damage, r.has_valley_damage, r.has_flashing_damage,
	r.decking_condition, r.notes,
	r.section_type, r.section_custom_name,
	r.penetrations, r.complexity, r.sort_order,
	r.created_at, r.updated_at`

const roofPhotoJoins = `
	LEFT JOIN documents d1 ON d1.id = r.overview_photo_id
	LEFT JOIN documents d2 ON d2.id = r.slope_photo_id
	LEFT JOIN documents d3 ON d3.id = r.shingles_photo_id
	LEFT JOIN documents d4 ON d4.id = r.ridge_photo_id`

func scanRoofRow(row interface {
	Scan(...interface{}) error
}, r *models.InspectionRoof) error {
	return row.Scan(
		&r.ID, &r.InspectionID,
		&r.OverviewPhotoID, &r.OverviewPhotoURL,
		&r.SlopePhotoID, &r.SlopePhotoURL,
		&r.ShinglesPhotoID, &r.ShinglesPhotoURL,
		&r.RidgePhotoID, &r.RidgePhotoURL,
		&r.Pitch, &r.ShingleType, &r.Layers, &r.Squares,
		&r.HasRidgeDamage, &r.HasValleyDamage, &r.HasFlashingDamage,
		&r.DeckingCondition, &r.Notes,
		&r.SectionType, &r.SectionCustomName,
		&r.Penetrations, &r.Complexity, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt,
	)
}

// ListRoofSections returns all roof sections for the inspection identified by token,
// ordered by sort_order then created_at. Returns an empty slice when none exist.
func (s *InspectionService) ListRoofSections(token string) ([]models.InspectionRoof, error) {
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
		return []models.InspectionRoof{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT %s
		FROM inspection_roof r
		%s
		WHERE r.inspection_id = $1
		ORDER BY r.sort_order, r.created_at
	`, roofSelectCols, roofPhotoJoins)

	rows, err := s.db.Query(query, inspectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query roof sections: %w", err)
	}
	defer rows.Close()

	sections := []models.InspectionRoof{}
	for rows.Next() {
		var r models.InspectionRoof
		if err = scanRoofRow(rows, &r); err != nil {
			return nil, fmt.Errorf("failed to scan roof section: %w", err)
		}
		sections = append(sections, r)
	}
	return sections, rows.Err()
}

// CreateRoofSection inserts a new roof section row and returns it.
// Advances current_step to 4 on first creation.
func (s *InspectionService) CreateRoofSection(token string, input CreateRoofSectionInput) (*models.InspectionRoof, error) {
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

	var r models.InspectionRoof
	err = tx.QueryRow(`
		INSERT INTO inspection_roof
		    (id, inspection_id, section_type, section_custom_name,
		     sort_order, created_at, updated_at)
		VALUES ($1, $2, $3, $4,
		        (SELECT COALESCE(MAX(sort_order)+1, 0) FROM inspection_roof WHERE inspection_id = $2),
		        $5, $5)
		RETURNING id, inspection_id,
		          overview_photo_id,  NULL::text,
		          slope_photo_id,     NULL::text,
		          shingles_photo_id,  NULL::text,
		          ridge_photo_id,     NULL::text,
		          pitch, shingle_type, layers, squares,
		          has_ridge_damage, has_valley_damage, has_flashing_damage,
		          decking_condition, notes,
		          section_type, section_custom_name,
		          penetrations, complexity, sort_order,
		          created_at, updated_at
	`, newID, inspectionID, input.SectionType, input.SectionCustomName, now).Scan(
		&r.ID, &r.InspectionID,
		&r.OverviewPhotoID, &r.OverviewPhotoURL,
		&r.SlopePhotoID, &r.SlopePhotoURL,
		&r.ShinglesPhotoID, &r.ShinglesPhotoURL,
		&r.RidgePhotoID, &r.RidgePhotoURL,
		&r.Pitch, &r.ShingleType, &r.Layers, &r.Squares,
		&r.HasRidgeDamage, &r.HasValleyDamage, &r.HasFlashingDamage,
		&r.DeckingCondition, &r.Notes,
		&r.SectionType, &r.SectionCustomName,
		&r.Penetrations, &r.Complexity, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert roof section: %w", err)
	}

	// Advance to step 4 on first roof section.
	if _, err = tx.Exec(
		`UPDATE inspection_v2 SET current_step = 4, updated_at = $1 WHERE id = $2 AND current_step < 4`,
		now, inspectionID,
	); err != nil {
		return nil, fmt.Errorf("failed to advance inspection step: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit roof section create: %w", err)
	}
	return &r, nil
}

// UpdateRoofSection patches fields on an existing roof section identified by roofID.
// Uses a CTE with four LEFT JOINs to return photo URLs in a single roundtrip.
func (s *InspectionService) UpdateRoofSection(token string, roofID string, input UpdateRoofSectionInput) (*models.InspectionRoof, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	now := time.Now()
	var r models.InspectionRoof
	err = s.db.QueryRow(`
		WITH updated AS (
			UPDATE inspection_roof
			SET overview_photo_id   = $2,
			    slope_photo_id      = $3,
			    shingles_photo_id   = $4,
			    ridge_photo_id      = $5,
			    pitch               = $6,
			    shingle_type        = $7,
			    layers              = $8,
			    squares             = $9,
			    has_ridge_damage    = $10,
			    has_valley_damage   = $11,
			    has_flashing_damage = $12,
			    decking_condition   = $13,
			    notes               = $14,
			    penetrations        = $15,
			    complexity          = $16,
			    updated_at          = $17
			WHERE id = $1
			  AND inspection_id = (
			      SELECT iv2.id FROM inspection_v2 iv2
			      JOIN magic_link ml ON ml.id = iv2.magic_link_id
			      WHERE ml.token = $18
			  )
			RETURNING *
		)
		SELECT u.id, u.inspection_id,
		       u.overview_photo_id,  d1.file_url,
		       u.slope_photo_id,     d2.file_url,
		       u.shingles_photo_id,  d3.file_url,
		       u.ridge_photo_id,     d4.file_url,
		       u.pitch, u.shingle_type, u.layers, u.squares,
		       u.has_ridge_damage, u.has_valley_damage, u.has_flashing_damage,
		       u.decking_condition, u.notes,
		       u.section_type, u.section_custom_name,
		       u.penetrations, u.complexity, u.sort_order,
		       u.created_at, u.updated_at
		FROM updated u
		LEFT JOIN documents d1 ON d1.id = u.overview_photo_id
		LEFT JOIN documents d2 ON d2.id = u.slope_photo_id
		LEFT JOIN documents d3 ON d3.id = u.shingles_photo_id
		LEFT JOIN documents d4 ON d4.id = u.ridge_photo_id
	`,
		roofID,
		input.OverviewPhotoID, input.SlopePhotoID, input.ShinglesPhotoID, input.RidgePhotoID,
		input.Pitch, input.ShingleType, input.Layers, input.Squares,
		input.HasRidgeDamage, input.HasValleyDamage, input.HasFlashingDamage,
		input.DeckingCondition, input.Notes,
		input.Penetrations, input.Complexity,
		now, token,
	).Scan(
		&r.ID, &r.InspectionID,
		&r.OverviewPhotoID, &r.OverviewPhotoURL,
		&r.SlopePhotoID, &r.SlopePhotoURL,
		&r.ShinglesPhotoID, &r.ShinglesPhotoURL,
		&r.RidgePhotoID, &r.RidgePhotoURL,
		&r.Pitch, &r.ShingleType, &r.Layers, &r.Squares,
		&r.HasRidgeDamage, &r.HasValleyDamage, &r.HasFlashingDamage,
		&r.DeckingCondition, &r.Notes,
		&r.SectionType, &r.SectionCustomName,
		&r.Penetrations, &r.Complexity, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("roof section not found: %w", err)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update roof section: %w", err)
	}
	return &r, nil
}

// DeleteRoofSection removes a roof section by ID, verifying it belongs to this inspection.
func (s *InspectionService) DeleteRoofSection(token string, roofID string) error {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	result, err := s.db.Exec(`
		DELETE FROM inspection_roof
		WHERE id = $1
		  AND inspection_id = (
		      SELECT iv2.id FROM inspection_v2 iv2
		      JOIN magic_link ml ON ml.id = iv2.magic_link_id
		      WHERE ml.token = $2
		  )
	`, roofID, token)
	if err != nil {
		return fmt.Errorf("failed to delete roof section: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("roof section not found: %w", sql.ErrNoRows)
	}
	return nil
}

// AddRoofSectionDamageSpot attaches a damage photo to a specific roof section.
func (s *InspectionService) AddRoofSectionDamageSpot(token string, roofID string, input AddDamageSpotInput) (*models.RoofDamageSpot, error) {
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

	// Verify the roof section belongs to this inspection.
	var exists int
	err = s.db.QueryRow(
		`SELECT COUNT(1) FROM inspection_roof WHERE id = $1 AND inspection_id = $2`,
		roofID, inspectionID,
	).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to verify roof ownership: %w", err)
	}
	if exists == 0 {
		return nil, fmt.Errorf("roof section not found: %w", sql.ErrNoRows)
	}

	// Resolve photo URL if a document ID was provided.
	var photoURL *string
	if input.PhotoDocumentID != nil {
		var url string
		if err = s.db.QueryRow(
			`SELECT file_url FROM documents WHERE id = $1`,
			*input.PhotoDocumentID,
		).Scan(&url); err != nil && err != sql.ErrNoRows {
			return nil, fmt.Errorf("failed to resolve photo URL: %w", err)
		}
		if err == nil {
			photoURL = &url
		}
	}

	newID := uuid.New().String()
	var spot models.RoofDamageSpot
	err = s.db.QueryRow(`
		INSERT INTO inspection_roof_damage_spot
		    (id, roof_id, photo_id, photo_url, caption, sort_order, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, roof_id, photo_id, photo_url, caption, sort_order, created_at
	`,
		newID, roofID, input.PhotoDocumentID, photoURL,
		input.Caption, input.SortOrder, time.Now(),
	).Scan(
		&spot.ID, &spot.RoofID, &spot.PhotoID, &spot.PhotoURL,
		&spot.Caption, &spot.SortOrder, &spot.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert damage spot: %w", err)
	}
	return &spot, nil
}

// DeleteRoofSectionDamageSpot removes a damage spot, verifying it belongs to the given roofID
// which in turn must belong to this inspection.
func (s *InspectionService) DeleteRoofSectionDamageSpot(token string, roofID string, spotID string) error {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var inspectionID string
	err = s.db.QueryRow(
		`SELECT id FROM inspection_v2 WHERE magic_link_id = $1`,
		validation.MagicLinkID,
	).Scan(&inspectionID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("inspection not found: %w", err)
	}
	if err != nil {
		return fmt.Errorf("failed to look up inspection: %w", err)
	}

	result, err := s.db.Exec(`
		DELETE FROM inspection_roof_damage_spot
		WHERE id = $1
		  AND roof_id = $2
		  AND roof_id IN (
		      SELECT id FROM inspection_roof WHERE inspection_id = $3
		  )
	`, spotID, roofID, inspectionID)
	if err != nil {
		return fmt.Errorf("failed to delete damage spot: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("damage spot not found: %w", sql.ErrNoRows)
	}
	return nil
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

// CreateRoomInput is the request body for POST /inspection/rooms.
type CreateRoomInput struct {
	Name             string                 `json:"name"`
	LengthFt         *float64               `json:"length_ft"`
	WidthFt          *float64               `json:"width_ft"`
	HeightFt         *float64               `json:"height_ft"`
	DamagedMaterials models.JSONStringSlice `json:"damaged_materials"`
	Notes            *string                `json:"notes"`
}

// UpdateRoomInput is the request body for PUT /inspection/rooms/:roomId.
type UpdateRoomInput struct {
	Name             string                 `json:"name"`
	LengthFt         *float64               `json:"length_ft"`
	WidthFt          *float64               `json:"width_ft"`
	HeightFt         *float64               `json:"height_ft"`
	DamagedMaterials models.JSONStringSlice `json:"damaged_materials"`
	Notes            *string                `json:"notes"`
}

// AddRoomPhotoInput is the request body for POST /inspection/rooms/:roomId/photos.
type AddRoomPhotoInput struct {
	PhotoDocumentID *string `json:"photo_document_id"`
	Caption         *string `json:"caption"`
	SortOrder       int     `json:"sort_order"`
}

// GetRooms loads all rooms (with photos) for the inspection identified by token.
// Returns an empty slice when no rooms exist yet.
func (s *InspectionService) GetRooms(token string) ([]models.InspectionRoom, error) {
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
		return []models.InspectionRoom{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	rows, err := s.db.Query(`
		SELECT id, inspection_id, name, length_ft, width_ft, height_ft,
		       damaged_materials, notes, sort_order, created_at, updated_at
		FROM inspection_room
		WHERE inspection_id = $1
		ORDER BY sort_order, created_at
	`, inspectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query rooms: %w", err)
	}
	defer rows.Close()

	rooms := []models.InspectionRoom{}
	roomIndex := map[string]int{}
	for rows.Next() {
		var r models.InspectionRoom
		r.Photos = []models.InspectionRoomPhoto{}
		if err = rows.Scan(
			&r.ID, &r.InspectionID, &r.Name,
			&r.LengthFt, &r.WidthFt, &r.HeightFt,
			&r.DamagedMaterials, &r.Notes, &r.SortOrder,
			&r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan room: %w", err)
		}
		roomIndex[r.ID] = len(rooms)
		rooms = append(rooms, r)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate room rows: %w", err)
	}

	if len(rooms) == 0 {
		return rooms, nil
	}

	// Load all photos for these rooms in a single query.
	photoRows, err := s.db.Query(`
		SELECT id, room_id, photo_id, photo_url, caption, sort_order, created_at
		FROM inspection_room_photo
		WHERE room_id IN (
		    SELECT id FROM inspection_room WHERE inspection_id = $1
		)
		ORDER BY sort_order, created_at
	`, inspectionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query room photos: %w", err)
	}
	defer photoRows.Close()

	for photoRows.Next() {
		var p models.InspectionRoomPhoto
		if err = photoRows.Scan(
			&p.ID, &p.RoomID, &p.PhotoID, &p.PhotoURL,
			&p.Caption, &p.SortOrder, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan room photo: %w", err)
		}
		if idx, ok := roomIndex[p.RoomID]; ok {
			rooms[idx].Photos = append(rooms[idx].Photos, p)
		}
	}
	return rooms, photoRows.Err()
}

// CreateRoom inserts a new room for this inspection and advances current_step to 5.
func (s *InspectionService) CreateRoom(token string, input CreateRoomInput) (*models.InspectionRoom, error) {
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

	// Default damaged_materials to empty slice if nil.
	if input.DamagedMaterials == nil {
		input.DamagedMaterials = models.JSONStringSlice{}
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	var r models.InspectionRoom
	err = tx.QueryRow(`
		INSERT INTO inspection_room
		    (id, inspection_id, name, length_ft, width_ft, height_ft,
		     damaged_materials, notes, sort_order, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8,
		        (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM inspection_room WHERE inspection_id = $2),
		        $9, $9)
		RETURNING id, inspection_id, name, length_ft, width_ft, height_ft,
		          damaged_materials, notes, sort_order, created_at, updated_at
	`,
		newID, inspectionID, input.Name,
		input.LengthFt, input.WidthFt, input.HeightFt,
		input.DamagedMaterials, input.Notes,
		now,
	).Scan(
		&r.ID, &r.InspectionID, &r.Name,
		&r.LengthFt, &r.WidthFt, &r.HeightFt,
		&r.DamagedMaterials, &r.Notes, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert room: %w", err)
	}
	r.Photos = []models.InspectionRoomPhoto{}

	// Advance step to 5 now that at least one room exists.
	if _, err = tx.Exec(
		`UPDATE inspection_v2 SET current_step = 5, updated_at = $1 WHERE id = $2 AND current_step < 5`,
		now, inspectionID,
	); err != nil {
		return nil, fmt.Errorf("failed to advance inspection step: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit room create: %w", err)
	}
	return &r, nil
}

// UpdateRoom modifies name/dimensions/materials/notes for an existing room.
// Returns an error wrapping sql.ErrNoRows when the room is not found or belongs to another inspection.
func (s *InspectionService) UpdateRoom(token string, roomID string, input UpdateRoomInput) (*models.InspectionRoom, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	if input.DamagedMaterials == nil {
		input.DamagedMaterials = models.JSONStringSlice{}
	}

	var r models.InspectionRoom
	err = s.db.QueryRow(`
		UPDATE inspection_room
		SET name              = $2,
		    length_ft         = $3,
		    width_ft          = $4,
		    height_ft         = $5,
		    damaged_materials = $6::jsonb,
		    notes             = $7,
		    updated_at        = $8
		WHERE id = $1
		  AND inspection_id = (
		      SELECT iv2.id FROM inspection_v2 iv2
		      JOIN magic_link ml ON ml.id = iv2.magic_link_id
		      WHERE ml.token = $9
		  )
		RETURNING id, inspection_id, name, length_ft, width_ft, height_ft,
		          damaged_materials, notes, sort_order, created_at, updated_at
	`,
		roomID, input.Name,
		input.LengthFt, input.WidthFt, input.HeightFt,
		input.DamagedMaterials, input.Notes,
		time.Now(), token,
	).Scan(
		&r.ID, &r.InspectionID, &r.Name,
		&r.LengthFt, &r.WidthFt, &r.HeightFt,
		&r.DamagedMaterials, &r.Notes, &r.SortOrder,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("room not found: %w", err)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update room: %w", err)
	}

	// Load photos for the updated room.
	photoRows, err := s.db.Query(`
		SELECT id, room_id, photo_id, photo_url, caption, sort_order, created_at
		FROM inspection_room_photo
		WHERE room_id = $1
		ORDER BY sort_order, created_at
	`, r.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to load room photos after update: %w", err)
	}
	defer photoRows.Close()
	r.Photos = []models.InspectionRoomPhoto{}
	for photoRows.Next() {
		var p models.InspectionRoomPhoto
		if err = photoRows.Scan(
			&p.ID, &p.RoomID, &p.PhotoID, &p.PhotoURL,
			&p.Caption, &p.SortOrder, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan photo after update: %w", err)
		}
		r.Photos = append(r.Photos, p)
	}
	if err = photoRows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate room photos after update: %w", err)
	}
	return &r, nil
}

// DeleteRoom removes a room by ID, verifying it belongs to this inspection.
// Returns an error wrapping sql.ErrNoRows when the room does not exist or belongs to another inspection.
func (s *InspectionService) DeleteRoom(token string, roomID string) error {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	result, err := s.db.Exec(`
		DELETE FROM inspection_room
		WHERE id = $1
		  AND inspection_id = (
		      SELECT iv2.id FROM inspection_v2 iv2
		      JOIN magic_link ml ON ml.id = iv2.magic_link_id
		      WHERE ml.token = $2
		  )
	`, roomID, token)
	if err != nil {
		return fmt.Errorf("failed to delete room: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("room not found: %w", sql.ErrNoRows)
	}
	return nil
}

// AddRoomPhoto attaches a damage-evidence photo to a room.
// The room must belong to this inspection; returns an error otherwise.
func (s *InspectionService) AddRoomPhoto(token string, roomID string, input AddRoomPhotoInput) (*models.InspectionRoomPhoto, error) {
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

	// Verify room belongs to this inspection.
	var exists int
	err = s.db.QueryRow(
		`SELECT COUNT(1) FROM inspection_room WHERE id = $1 AND inspection_id = $2`,
		roomID, inspectionID,
	).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to verify room ownership: %w", err)
	}
	if exists == 0 {
		return nil, fmt.Errorf("room not found: %w", sql.ErrNoRows)
	}

	// Resolve photo URL if a document ID was provided.
	var photoURL *string
	if input.PhotoDocumentID != nil {
		var url string
		if err = s.db.QueryRow(
			`SELECT file_url FROM documents WHERE id = $1`,
			*input.PhotoDocumentID,
		).Scan(&url); err != nil && err != sql.ErrNoRows {
			return nil, fmt.Errorf("failed to resolve photo URL: %w", err)
		}
		if err == nil {
			photoURL = &url
		}
	}

	newID := uuid.New().String()
	var p models.InspectionRoomPhoto
	err = s.db.QueryRow(`
		INSERT INTO inspection_room_photo
		    (id, room_id, photo_id, photo_url, caption, sort_order, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, room_id, photo_id, photo_url, caption, sort_order, created_at
	`,
		newID, roomID, input.PhotoDocumentID, photoURL,
		input.Caption, input.SortOrder, time.Now(),
	).Scan(
		&p.ID, &p.RoomID, &p.PhotoID, &p.PhotoURL,
		&p.Caption, &p.SortOrder, &p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert room photo: %w", err)
	}
	return &p, nil
}

// DeleteRoomPhoto removes a photo by ID, verifying it belongs to a room in this inspection.
// Returns an error wrapping sql.ErrNoRows when the photo does not exist.
func (s *InspectionService) DeleteRoomPhoto(token string, photoID string) error {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var inspectionID string
	err = s.db.QueryRow(
		`SELECT id FROM inspection_v2 WHERE magic_link_id = $1`,
		validation.MagicLinkID,
	).Scan(&inspectionID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("inspection not found: %w", err)
	}
	if err != nil {
		return fmt.Errorf("failed to look up inspection: %w", err)
	}

	result, err := s.db.Exec(`
		DELETE FROM inspection_room_photo
		WHERE id = $1
		  AND room_id IN (
		      SELECT id FROM inspection_room WHERE inspection_id = $2
		  )
	`, photoID, inspectionID)
	if err != nil {
		return fmt.Errorf("failed to delete room photo: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if n == 0 {
		return fmt.Errorf("room photo not found: %w", sql.ErrNoRows)
	}
	return nil
}

// SubmitInspection marks the inspection as submitted.
// It is idempotent: if already submitted, the original submitted_at is preserved
// and the current inspection is returned without error.
func (s *InspectionService) SubmitInspection(token string) (*models.InspectionV2, error) {
	validation, err := s.magicLinkSvc.ValidateToken(token)
	if err != nil {
		return nil, fmt.Errorf("failed to validate token: %w", err)
	}
	if !validation.Valid {
		return nil, fmt.Errorf("invalid or expired token: %s", validation.Reason)
	}

	var insp models.InspectionV2
	err = s.db.QueryRow(`
		UPDATE inspection_v2
		SET    status       = 'submitted',
		       submitted_at = CASE WHEN submitted_at IS NULL THEN NOW() ELSE submitted_at END,
		       updated_at   = NOW()
		WHERE  magic_link_id = $1
		RETURNING id, claim_id, magic_link_id, property_type, stories,
		          status, current_step, submitted_at, created_at, updated_at
	`, validation.MagicLinkID).Scan(
		&insp.ID, &insp.ClaimID, &insp.MagicLinkID,
		&insp.PropertyType, &insp.Stories,
		&insp.Status, &insp.CurrentStep,
		&insp.SubmittedAt, &insp.CreatedAt, &insp.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("inspection not found: %w", err)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to submit inspection: %w", err)
	}

	// Synthesize a scope_sheet record from V2 data so the audit pipeline can function.
	if synErr := s.synthesizeScopeSheetFromV2(context.Background(), insp.ID, insp.ClaimID); synErr != nil {
		// Non-fatal: log but don't fail the submit
		fmt.Printf("Warning: failed to synthesize scope sheet from V2 inspection: %v\n", synErr)
	}

	return &insp, nil
}

// synthesizeScopeSheetFromV2 creates a scope_sheets record from V2 inspection data.
// This is called on submission so the audit pipeline (which requires a scope sheet) can function.
// Idempotent: skips if a non-draft scope sheet already exists for this claim.
func (s *InspectionService) synthesizeScopeSheetFromV2(ctx context.Context, inspectionID, claimID string) error {
	// Skip if a scope sheet already exists (old wizard used, or already synthesized)
	var exists bool
	if err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM scope_sheets WHERE claim_id = $1 AND is_draft = false)`,
		claimID,
	).Scan(&exists); err != nil {
		return fmt.Errorf("failed to check scope sheet existence: %w", err)
	}
	if exists {
		return nil
	}

	areas := []models.ScopeArea{}
	order := 0

	// ── Roof sections ────────────────────────────────────────────────────────
	roofRows, err := s.db.QueryContext(ctx, `
		SELECT id, section_type, section_custom_name,
		       pitch, squares, shingle_type,
		       has_ridge_damage, has_valley_damage, has_flashing_damage,
		       complexity, penetrations, notes,
		       overview_photo_id, slope_photo_id, shingles_photo_id, ridge_photo_id
		FROM inspection_roof
		WHERE inspection_id = $1
		ORDER BY sort_order, created_at
	`, inspectionID)
	if err != nil {
		return fmt.Errorf("failed to query roof sections: %w", err)
	}
	defer roofRows.Close()

	for roofRows.Next() {
		var (
			id, sectionType, sectionCustomName sql.NullString
			pitch, shingleType                 sql.NullString
			complexity, penetrations, notes    sql.NullString
			ovPhotoID, slPhotoID, shPhotoID, ridPhotoID sql.NullString
			squares                            sql.NullFloat64
			hasRidge, hasValley, hasFlashing   bool
		)
		if err := roofRows.Scan(
			&id, &sectionType, &sectionCustomName,
			&pitch, &squares, &shingleType,
			&hasRidge, &hasValley, &hasFlashing,
			&complexity, &penetrations, &notes,
			&ovPhotoID, &slPhotoID, &shPhotoID, &ridPhotoID,
		); err != nil {
			return fmt.Errorf("failed to scan roof row: %w", err)
		}

		category := "Roof Section"
		if sectionCustomName.Valid && sectionCustomName.String != "" {
			category = sectionCustomName.String
		} else if sectionType.Valid && sectionType.String != "" {
			category = strings.Title(strings.ReplaceAll(sectionType.String, "_", " "))
		}

		tags := []string{}
		if hasRidge {
			tags = append(tags, "Ridge_Damage")
		}
		if hasValley {
			tags = append(tags, "Valley_Damage")
		}
		if hasFlashing {
			tags = append(tags, "Flashing_Damage")
		}
		if shingleType.Valid && shingleType.String != "" {
			tags = append(tags, "Shingles_Damaged")
		}
		if complexity.Valid && complexity.String != "" {
			tags = append(tags, "Pitch_"+strings.Title(complexity.String))
		}

		dims := map[string]float64{}
		if squares.Valid && squares.Float64 > 0 {
			dims["squares"] = squares.Float64
		}

		photoIDs := []string{}
		for _, p := range []sql.NullString{ovPhotoID, slPhotoID, shPhotoID, ridPhotoID} {
			if p.Valid && p.String != "" {
				photoIDs = append(photoIDs, p.String)
			}
		}

		areaID := uuid.New().String()
		if id.Valid {
			areaID = id.String
		}

		areas = append(areas, models.ScopeArea{
			ID: areaID, Category: category, CategoryKey: "roof",
			Order: order, Tags: tags, Dimensions: dims,
			PhotoIDs: photoIDs, Notes: notes.String,
		})
		order++
	}
	if err := roofRows.Err(); err != nil {
		return fmt.Errorf("roof rows error: %w", err)
	}

	// ── Elevations ──────────────────────────────────────────────────────────
	elevRows, err := s.db.QueryContext(ctx, `
		SELECT id, side, has_damage,
		       COALESCE(siding_replace_sf, 0), COALESCE(siding_paint_sf, 0), COALESCE(gutter_lf, 0),
		       COALESCE(windows_count, 0), COALESCE(doors_count, 0),
		       COALESCE(notes, ''), photo_document_id
		FROM inspection_elevation
		WHERE inspection_id = $1
		ORDER BY CASE side WHEN 'front' THEN 1 WHEN 'right' THEN 2 WHEN 'back' THEN 3 WHEN 'left' THEN 4 END
	`, inspectionID)
	if err != nil {
		return fmt.Errorf("failed to query elevations: %w", err)
	}
	defer elevRows.Close()

	for elevRows.Next() {
		var (
			id, side, notes sql.NullString
			photoID         sql.NullString
			hasDamage       bool
			sidingReplaceSF, sidingPaintSF, gutterLF float64
			windowsCount, doorsCount                 int
		)
		if err := elevRows.Scan(
			&id, &side, &hasDamage,
			&sidingReplaceSF, &sidingPaintSF, &gutterLF,
			&windowsCount, &doorsCount,
			&notes, &photoID,
		); err != nil {
			return fmt.Errorf("failed to scan elevation row: %w", err)
		}
		if !hasDamage {
			continue // Only include damaged elevations in the estimate
		}

		sideName := "Elevation"
		if side.Valid {
			sideName = strings.Title(side.String) + " Elevation"
		}

		tags := []string{"Exterior_Damage"}
		dims := map[string]float64{}
		if sidingReplaceSF > 0 {
			dims["siding_replace_sf"] = sidingReplaceSF
			tags = append(tags, "Siding_Damaged")
		}
		if sidingPaintSF > 0 {
			dims["siding_paint_sf"] = sidingPaintSF
		}
		if gutterLF > 0 {
			dims["gutter_lf"] = gutterLF
			tags = append(tags, "Gutter_Damage")
		}
		if windowsCount > 0 {
			dims["windows_count"] = float64(windowsCount)
		}
		if doorsCount > 0 {
			dims["doors_count"] = float64(doorsCount)
		}

		photoIDs := []string{}
		if photoID.Valid && photoID.String != "" {
			photoIDs = append(photoIDs, photoID.String)
		}

		areaID := uuid.New().String()
		if id.Valid {
			areaID = id.String
		}

		areas = append(areas, models.ScopeArea{
			ID: areaID, Category: sideName, CategoryKey: "exterior",
			Order: order, Tags: tags, Dimensions: dims,
			PhotoIDs: photoIDs, Notes: notes.String,
		})
		order++
	}
	if err := elevRows.Err(); err != nil {
		return fmt.Errorf("elevation rows error: %w", err)
	}

	// ── Rooms ────────────────────────────────────────────────────────────────
	roomRows, err := s.db.QueryContext(ctx, `
		SELECT r.id, r.name,
		       COALESCE(r.length_ft, 0), COALESCE(r.width_ft, 0), COALESCE(r.height_ft, 0),
		       r.damaged_materials, COALESCE(r.notes, ''),
		       COALESCE(json_agg(p.photo_id) FILTER (WHERE p.photo_id IS NOT NULL), '[]'::json)
		FROM inspection_room r
		LEFT JOIN inspection_room_photo p ON p.room_id = r.id
		WHERE r.inspection_id = $1
		GROUP BY r.id, r.name, r.length_ft, r.width_ft, r.height_ft, r.damaged_materials, r.notes, r.sort_order
		ORDER BY r.sort_order, r.created_at
	`, inspectionID)
	if err != nil {
		return fmt.Errorf("failed to query rooms: %w", err)
	}
	defer roomRows.Close()

	for roomRows.Next() {
		var (
			id, name, notes     string
			lengthFt, widthFt, heightFt float64
			damagedMaterials    models.JSONStringSlice
			photoIDsJSON        []byte
		)
		if err := roomRows.Scan(
			&id, &name, &lengthFt, &widthFt, &heightFt,
			&damagedMaterials, &notes, &photoIDsJSON,
		); err != nil {
			return fmt.Errorf("failed to scan room row: %w", err)
		}

		dims := map[string]float64{}
		if lengthFt > 0 {
			dims["length"] = lengthFt
		}
		if widthFt > 0 {
			dims["width"] = widthFt
		}
		if lengthFt > 0 && widthFt > 0 {
			dims["square_footage"] = lengthFt * widthFt
		}
		if heightFt > 0 {
			dims["ceiling_height"] = heightFt
		}

		tags := []string(damagedMaterials)

		var photoIDsList []string
		if err := json.Unmarshal(photoIDsJSON, &photoIDsList); err != nil {
			photoIDsList = []string{}
		}

		areas = append(areas, models.ScopeArea{
			ID: id, Category: name, CategoryKey: "interior",
			Order: order, Tags: tags, Dimensions: dims,
			PhotoIDs: photoIDsList, Notes: notes,
		})
		order++
	}
	if err := roomRows.Err(); err != nil {
		return fmt.Errorf("room rows error: %w", err)
	}

	// ── Insert synthetic scope sheet ─────────────────────────────────────────
	areasJSON, err := json.Marshal(areas)
	if err != nil {
		return fmt.Errorf("failed to marshal areas: %w", err)
	}
	now := time.Now()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO scope_sheets (id, claim_id, areas, triage_selections, general_notes,
		                          is_draft, submitted_at, created_at, updated_at)
		VALUES ($1, $2, $3, '[]'::jsonb, NULL, false, $4, $4, $4)
		ON CONFLICT DO NOTHING
	`, uuid.New().String(), claimID, areasJSON, now)
	if err != nil {
		return fmt.Errorf("failed to insert synthetic scope sheet: %w", err)
	}
	return nil
}

// GetSubmittedByClaimID returns the submitted inspection_v2 for a given claim, or nil if none exists.
// Also ensures a synthetic scope sheet exists so the audit pipeline can run.
func (s *InspectionService) GetSubmittedByClaimID(claimID string) (*models.InspectionV2, error) {
	var insp models.InspectionV2
	err := s.db.QueryRow(`
		SELECT iv2.id, iv2.claim_id, iv2.magic_link_id, iv2.property_type, iv2.stories,
		       iv2.status, iv2.current_step, iv2.submitted_at, iv2.created_at, iv2.updated_at
		FROM inspection_v2 iv2
		JOIN magic_links ml ON ml.id = iv2.magic_link_id
		WHERE ml.claim_id = $1 AND iv2.submitted_at IS NOT NULL
		ORDER BY iv2.submitted_at DESC
		LIMIT 1
	`, claimID).Scan(
		&insp.ID, &insp.ClaimID, &insp.MagicLinkID,
		&insp.PropertyType, &insp.Stories,
		&insp.Status, &insp.CurrentStep,
		&insp.SubmittedAt, &insp.CreatedAt, &insp.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get inspection: %w", err)
	}

	// Backfill scope sheet for already-submitted inspections that pre-date auto-synthesis.
	if synErr := s.synthesizeScopeSheetFromV2(context.Background(), insp.ID, insp.ClaimID); synErr != nil {
		fmt.Printf("Warning: failed to synthesize scope sheet on read: %v\n", synErr)
	}

	return &insp, nil
}
