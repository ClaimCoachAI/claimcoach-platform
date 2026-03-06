# Roof Sections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-roof wizard step with a multi-section UI where each property structure (Main House, Garage, Patio, etc.) has its own roof record with photos, penetrations, and complexity.

**Architecture:** DB migration drops `UNIQUE (inspection_id)` on `inspection_roof` and adds `section_type`, `section_custom_name`, `penetrations`, `complexity`, and `sort_order` columns. The backend gains four new CRUD endpoints for roof sections (replacing old single-roof routes) plus updated damage-spot endpoints that take an explicit `roofId` in the URL. The frontend replaces `roof: RoofData | null` state with `roofSections: RoofData[]` and rewrites `RoofStep.tsx` with a summary list screen + detail form screen.

**Tech Stack:** Go 1.21, Gin, database/sql, lib/pq, github.com/google/uuid; React 18, TypeScript, Vite, Axios — inline styles matching existing RoofStep/RoomsStep design tokens (`#0D9488` teal, `#F97316` orange, `#0F172A` navy).

---

## CONTEXT — read before touching any file

### Key file paths
```
backend/
  internal/
    database/migrations/   ← SQL, named 000NNN_*.{up,down}.sql
    models/inspection.go   ← InspectionRoof struct lives here
    services/inspection_service.go  ← all service methods
    handlers/inspection_handler.go  ← handler + interface
    api/router.go          ← route registration

frontend/src/components/contractor-wizard-v2/
  types.ts                 ← RoofData type
  useWizardV2State.ts      ← all state + API calls
  steps/RoofStep.tsx       ← the step component
```

### Pattern to follow
Rooms (`inspection_room`) is the closest analogue. When in doubt, mirror how `CreateRoom` / `UpdateRoom` / `DeleteRoom` work in `inspection_service.go`. The main differences for roof sections:
- Roof sections have named photo slots (overview/slope/shingles/ridge) resolved via LEFT JOINs — follow the CTE-with-JOIN pattern in `SaveRoof`.
- The damage-spot sub-resource takes `roofId` in the URL instead of looking it up by inspection.

### Test command
```bash
cd backend && go test ./internal/handlers/... -v -run TestInspection
```

### Run backend
```bash
cd backend && go run cmd/server/main.go
```

### Apply migrations
```bash
cd backend && go run cmd/migrate/main.go up
```

---

## Task 1: DB Migration — alter inspection_roof

**Files:**
- Create: `backend/internal/database/migrations/000023_roof_sections.up.sql`
- Create: `backend/internal/database/migrations/000023_roof_sections.down.sql`

**Step 1: Write the up migration**

```sql
-- 000023_roof_sections.up.sql
-- Drop the one-per-inspection unique constraint so we can have multiple sections.
ALTER TABLE inspection_roof DROP CONSTRAINT IF EXISTS inspection_roof_inspection_id_key;

-- Section identity fields
ALTER TABLE inspection_roof
  ADD COLUMN IF NOT EXISTS section_type        TEXT CHECK (section_type IN ('main_house','garage','patio','carport','flat_roof','other')),
  ADD COLUMN IF NOT EXISTS section_custom_name TEXT,
  ADD COLUMN IF NOT EXISTS penetrations        TEXT CHECK (penetrations IN ('0_3','4_7','8_plus')),
  ADD COLUMN IF NOT EXISTS complexity          TEXT CHECK (complexity IN ('simple','moderate','complex')),
  ADD COLUMN IF NOT EXISTS sort_order          INT  NOT NULL DEFAULT 0;
```

**Step 2: Write the down migration**

```sql
-- 000023_roof_sections.down.sql
ALTER TABLE inspection_roof
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS complexity,
  DROP COLUMN IF EXISTS penetrations,
  DROP COLUMN IF EXISTS section_custom_name,
  DROP COLUMN IF EXISTS section_type;

ALTER TABLE inspection_roof ADD CONSTRAINT inspection_roof_inspection_id_key UNIQUE (inspection_id);
```

**Step 3: Apply the migration**

```bash
cd backend && go run cmd/migrate/main.go up
```

Expected output: `migrating to version 23`

**Step 4: Commit**

```bash
git add backend/internal/database/migrations/000023_roof_sections.up.sql \
        backend/internal/database/migrations/000023_roof_sections.down.sql
git commit -m "feat: migration 000023 — multi-section inspection_roof"
```

---

## Task 2: Update Go model — InspectionRoof

**Files:**
- Modify: `backend/internal/models/inspection.go` (the `InspectionRoof` struct, lines ~82–104)

**Step 1: Add five fields to the struct**

In `inspection.go`, find `InspectionRoof` and add after the existing `Notes` field and before `CreatedAt`:

```go
// Section identity (added in migration 000023)
SectionType       *string   `json:"section_type" db:"section_type"`
SectionCustomName *string   `json:"section_custom_name" db:"section_custom_name"`
Penetrations      *string   `json:"penetrations" db:"penetrations"`
Complexity        *string   `json:"complexity" db:"complexity"`
SortOrder         int       `json:"sort_order" db:"sort_order"`
```

The full struct after the edit should look like:
```go
type InspectionRoof struct {
    ID                string    `json:"id" db:"id"`
    InspectionID      string    `json:"inspection_id" db:"inspection_id"`
    OverviewPhotoID   *string   `json:"overview_photo_id" db:"overview_photo_id"`
    OverviewPhotoURL  *string   `json:"overview_photo_url,omitempty"`
    SlopePhotoID      *string   `json:"slope_photo_id" db:"slope_photo_id"`
    SlopePhotoURL     *string   `json:"slope_photo_url,omitempty"`
    ShinglesPhotoID   *string   `json:"shingles_photo_id" db:"shingles_photo_id"`
    ShinglesPhotoURL  *string   `json:"shingles_photo_url,omitempty"`
    RidgePhotoID      *string   `json:"ridge_photo_id" db:"ridge_photo_id"`
    RidgePhotoURL     *string   `json:"ridge_photo_url,omitempty"`
    Pitch             *string   `json:"pitch" db:"pitch"`
    ShingleType       *string   `json:"shingle_type" db:"shingle_type"`
    Layers            *int      `json:"layers" db:"layers"`
    Squares           *float64  `json:"squares" db:"squares"`
    HasRidgeDamage    bool      `json:"has_ridge_damage" db:"has_ridge_damage"`
    HasValleyDamage   bool      `json:"has_valley_damage" db:"has_valley_damage"`
    HasFlashingDamage bool      `json:"has_flashing_damage" db:"has_flashing_damage"`
    DeckingCondition  *string   `json:"decking_condition" db:"decking_condition"`
    Notes             *string   `json:"notes" db:"notes"`
    SectionType       *string   `json:"section_type" db:"section_type"`
    SectionCustomName *string   `json:"section_custom_name" db:"section_custom_name"`
    Penetrations      *string   `json:"penetrations" db:"penetrations"`
    Complexity        *string   `json:"complexity" db:"complexity"`
    SortOrder         int       `json:"sort_order" db:"sort_order"`
    CreatedAt         time.Time `json:"created_at" db:"created_at"`
    UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
}
```

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add backend/internal/models/inspection.go
git commit -m "feat: add section fields to InspectionRoof model"
```

---

## Task 3: Update inspection_service.go — new roof section CRUD

**Files:**
- Modify: `backend/internal/services/inspection_service.go`

This task replaces the existing `GetRoof` / `SaveRoof` / `AddDamageSpot` / `DeleteDamageSpot` methods (lines ~413–759) with the new multi-section versions. **Do not delete any Rooms code.** The new methods to add:

1. `ListRoofSections` — GET all sections with photo URLs
2. `CreateRoofSection` — INSERT new section
3. `UpdateRoofSection` — PATCH one section by roofId, CTE-with-JOIN to return URLs
4. `DeleteRoofSection` — DELETE one section
5. `AddRoofSectionDamageSpot` — replace `AddDamageSpot`, takes explicit roofID
6. `DeleteRoofSectionDamageSpot` — replace `DeleteDamageSpot`, takes explicit roofID

**Step 1: Replace old input types and methods**

Find the block starting at `// ── Roof ──────────────────────────────────────────────────────────────────────` and replace everything up to (but not including) `// ── Rooms ──`) with:

```go
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

// scanRoof scans all columns (including photo URL joins) into an InspectionRoof.
// Column order must match every SELECT that uses this helper.
func scanRoof(row interface {
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
		if err = scanRoof(rows, &r); err != nil {
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
```

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: replace single-roof service with multi-section CRUD"
```

---

## Task 4: Update inspection_handler.go — new handlers + interface

**Files:**
- Modify: `backend/internal/handlers/inspection_handler.go`

**Step 1: Update type aliases block at top of file**

Replace the roof-related type aliases (lines ~20–24) with:

```go
type listRoofSectionsResponse = []models.InspectionRoof
type createRoofSectionInput   = services.CreateRoofSectionInput
type updateRoofSectionInput   = services.UpdateRoofSectionInput
type addDamageSpotInput        = services.AddDamageSpotInput
type roofSectionResponse       = models.InspectionRoof
type roofDamageSpotResp        = models.RoofDamageSpot
```

**Step 2: Update the interface**

Replace the interface methods for GetRoof / SaveRoof / AddDamageSpot / DeleteDamageSpot with:

```go
ListRoofSections(token string) ([]roofSectionResponse, error)
CreateRoofSection(token string, input createRoofSectionInput) (*roofSectionResponse, error)
UpdateRoofSection(token string, roofID string, input updateRoofSectionInput) (*roofSectionResponse, error)
DeleteRoofSection(token string, roofID string) error
AddRoofSectionDamageSpot(token string, roofID string, input addDamageSpotInput) (*roofDamageSpotResp, error)
DeleteRoofSectionDamageSpot(token string, roofID string, spotID string) error
```

**Step 3: Replace the old roof handler methods with new ones**

Find and remove `GetRoof`, `SaveRoof`, `AddDamageSpot`, `DeleteDamageSpot`. Add:

```go
// ListRoofSections handles GET /api/magic-links/:token/v2/inspection/roof-sections.
func (h *InspectionHandler) ListRoofSections(c *gin.Context) {
	token := c.Param("token")
	sections, err := h.service.ListRoofSections(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": sections})
}

// CreateRoofSection handles POST /api/magic-links/:token/v2/inspection/roof-sections.
func (h *InspectionHandler) CreateRoofSection(c *gin.Context) {
	token := c.Param("token")
	var input createRoofSectionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	section, err := h.service.CreateRoofSection(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": section})
}

// UpdateRoofSection handles PATCH /api/magic-links/:token/v2/inspection/roof-sections/:roofId.
func (h *InspectionHandler) UpdateRoofSection(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	var input updateRoofSectionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	section, err := h.service.UpdateRoofSection(token, roofID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Roof section not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": section})
}

// DeleteRoofSection handles DELETE /api/magic-links/:token/v2/inspection/roof-sections/:roofId.
func (h *InspectionHandler) DeleteRoofSection(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	if err := h.service.DeleteRoofSection(token, roofID); err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Roof section not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// AddRoofSectionDamageSpot handles POST /api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots.
func (h *InspectionHandler) AddRoofSectionDamageSpot(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	var input addDamageSpotInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request body: " + err.Error()})
		return
	}
	spot, err := h.service.AddRoofSectionDamageSpot(token, roofID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": spot})
}

// DeleteRoofSectionDamageSpot handles DELETE /api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId.
func (h *InspectionHandler) DeleteRoofSectionDamageSpot(c *gin.Context) {
	token := c.Param("token")
	roofID := c.Param("roofId")
	spotID := c.Param("spotId")
	if err := h.service.DeleteRoofSectionDamageSpot(token, roofID, spotID); err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Damage spot not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
```

**Step 4: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: no errors. If the test file references old method names like `GetRoof` or `SaveRoof` on the mock, update those too.

**Step 5: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go
git commit -m "feat: replace single-roof handlers with multi-section handlers"
```

---

## Task 5: Update router.go — register new routes

**Files:**
- Modify: `backend/internal/api/router.go`

**Step 1: Replace the old roof route block**

Find these lines (~131–135):
```go
// Roof routes
r.GET("/api/magic-links/:token/v2/inspection/roof", inspectionHandler.GetRoof)
r.PUT("/api/magic-links/:token/v2/inspection/roof", inspectionHandler.SaveRoof)
r.POST("/api/magic-links/:token/v2/inspection/roof/damage-spots", inspectionHandler.AddDamageSpot)
r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", inspectionHandler.DeleteDamageSpot)
```

Replace with:
```go
// Roof section routes (multi-section, replaces single-roof routes)
r.GET("/api/magic-links/:token/v2/inspection/roof-sections", inspectionHandler.ListRoofSections)
r.POST("/api/magic-links/:token/v2/inspection/roof-sections", inspectionHandler.CreateRoofSection)
r.PATCH("/api/magic-links/:token/v2/inspection/roof-sections/:roofId", inspectionHandler.UpdateRoofSection)
r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId", inspectionHandler.DeleteRoofSection)
r.POST("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots", inspectionHandler.AddRoofSectionDamageSpot)
r.DELETE("/api/magic-links/:token/v2/inspection/roof-sections/:roofId/damage-spots/:spotId", inspectionHandler.DeleteRoofSectionDamageSpot)
```

**Step 2: Build and run**

```bash
cd backend && go build ./... && go run cmd/server/main.go
```

Expected: server starts, logs show new routes registered.

**Step 3: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: register multi-section roof routes in router"
```

---

## Task 6: Update frontend types.ts

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/types.ts`

**Step 1: Add new type aliases and update RoofData**

After the existing `export type DeckingCondition = ...` line, add:

```typescript
export type RoofSectionType = 'main_house' | 'garage' | 'patio' | 'carport' | 'flat_roof' | 'other'
export type PenetrationRange = '0_3' | '4_7' | '8_plus'
export type RoofComplexity = 'simple' | 'moderate' | 'complex'
```

In `RoofData`, add five fields before the closing brace:
```typescript
section_type: RoofSectionType | null
section_custom_name: string | null
penetrations: PenetrationRange | null
complexity: RoofComplexity | null
sort_order: number
```

Also add a new input type for creating sections:
```typescript
export interface CreateRoofSectionInput {
  section_type: RoofSectionType | null
  section_custom_name: string | null
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to roof).

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/types.ts
git commit -m "feat: add multi-section roof types to wizard v2"
```

---

## Task 7: Update useWizardV2State.ts — multi-section roof state

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Step 1: Update imports**

Add `CreateRoofSectionInput` and `RoofSectionType` to the import from `./types`.
Remove `RoofData` from the import if it's already in the types (it stays — `RoofData` is still used, just in an array).

**Step 2: Update the `WizardV2State` interface**

Replace:
```typescript
roof: RoofData | null
roofDamageSpots: RoofDamageSpot[]
roofLoading: boolean
saveRoof: (data: Partial<RoofData>) => Promise<void>
addDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
deleteDamageSpot: (spotId: string) => Promise<void>
```

With:
```typescript
roofSections: RoofData[]
roofLoading: boolean
createRoofSection: (input: CreateRoofSectionInput) => Promise<RoofData | null>
updateRoofSection: (roofId: string, data: Partial<RoofData>) => void
deleteRoofSection: (roofId: string) => Promise<void>
addRoofSectionDamageSpot: (roofId: string, photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
deleteRoofSectionDamageSpot: (roofId: string, spotId: string) => Promise<void>
```

**Step 3: Update state variables**

Replace:
```typescript
const [roof, setRoof] = useState<RoofData | null>(null)
const [roofDamageSpots, setRoofDamageSpots] = useState<RoofDamageSpot[]>([])
const [roofLoading, setRoofLoading] = useState(false)
const roofDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
```

With:
```typescript
const [roofSections, setRoofSections] = useState<RoofData[]>([])
const [roofLoading, setRoofLoading] = useState(false)
const roofDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
const pendingRoofUpdates = useRef<Map<string, Partial<RoofData>>>(new Map())
```

**Step 4: Replace loadRoof / saveRoof / addDamageSpot / deleteDamageSpot**

Replace the `loadRoof` callback and all related hooks with:

```typescript
const loadRoofSections = useCallback(async () => {
  setRoofLoading(true)
  try {
    const { data } = await axios.get<{ success: boolean; data: RoofData[] }>(
      `${API}/api/magic-links/${token}/v2/inspection/roof-sections`
    )
    setRoofSections(data.data ?? [])
  } catch {
    // non-fatal
  } finally {
    setRoofLoading(false)
  }
}, [token])

const createRoofSection = useCallback(async (input: CreateRoofSectionInput): Promise<RoofData | null> => {
  try {
    const { data } = await axios.post<{ success: boolean; data: RoofData }>(
      `${API}/api/magic-links/${token}/v2/inspection/roof-sections`,
      input
    )
    const section = data.data
    setRoofSections(prev => [...prev, section])
    return section
  } catch {
    return null
  }
}, [token])

const updateRoofSection = useCallback((roofId: string, updates: Partial<RoofData>) => {
  // Merge pending updates
  const current = pendingRoofUpdates.current.get(roofId) ?? {}
  pendingRoofUpdates.current.set(roofId, { ...current, ...updates })

  // Optimistic update
  setRoofSections(prev => prev.map(r => r.id === roofId ? { ...r, ...updates } : r))

  // Debounce per section
  const existing = roofDebounceTimers.current.get(roofId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    roofDebounceTimers.current.delete(roofId)
    const payload = pendingRoofUpdates.current.get(roofId)
    pendingRoofUpdates.current.delete(roofId)
    try {
      const { data } = await axios.patch<{ success: boolean; data: RoofData }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}`,
        payload
      )
      setRoofSections(prev => prev.map(r => r.id === roofId ? data.data : r))
    } catch {
      // non-fatal
    }
  }, 800)
  roofDebounceTimers.current.set(roofId, timer)
}, [token])

const deleteRoofSection = useCallback(async (roofId: string) => {
  const existing = roofDebounceTimers.current.get(roofId)
  if (existing) {
    clearTimeout(existing)
    roofDebounceTimers.current.delete(roofId)
  }
  pendingRoofUpdates.current.delete(roofId)
  setRoofSections(prev => prev.filter(r => r.id !== roofId))
  try {
    await axios.delete(`${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}`)
  } catch {
    // non-fatal
  }
}, [token])

const addRoofSectionDamageSpot = useCallback(async (
  roofId: string,
  photoDocumentId: string | null,
  caption: string | null,
): Promise<RoofDamageSpot | null> => {
  try {
    const { data } = await axios.post<{ success: boolean; data: RoofDamageSpot }>(
      `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}/damage-spots`,
      { photo_document_id: photoDocumentId, caption, sort_order: 0 }
    )
    return data.data
  } catch {
    return null
  }
}, [token])

const deleteRoofSectionDamageSpot = useCallback(async (roofId: string, spotId: string) => {
  try {
    await axios.delete(
      `${API}/api/magic-links/${token}/v2/inspection/roof-sections/${roofId}/damage-spots/${spotId}`
    )
  } catch {
    // non-fatal
  }
}, [token])
```

**Step 5: Update the useEffect that loads roof data**

Find `loadRoof()` call inside the step-specific load effect and replace it with `loadRoofSections()`.

**Step 6: Update the return value**

Replace:
```typescript
roof, roofDamageSpots, roofLoading,
saveRoof, addDamageSpot, deleteDamageSpot,
```
With:
```typescript
roofSections, roofLoading,
createRoofSection, updateRoofSection, deleteRoofSection,
addRoofSectionDamageSpot, deleteRoofSectionDamageSpot,
```

**Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

**Step 8: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
git commit -m "feat: replace single-roof state with multi-section roof state"
```

---

## Task 8: Rewrite RoofStep.tsx

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/steps/RoofStep.tsx`

This is the largest task. Rewrite the file in full.

**Step 1: Update props interface**

The new `RoofStepProps`:
```typescript
interface RoofStepProps {
  token: string
  roofSections: RoofData[]
  roofLoading: boolean
  onCreateRoofSection: (input: CreateRoofSectionInput) => Promise<RoofData | null>
  onUpdateRoofSection: (roofId: string, data: Partial<RoofData>) => void
  onDeleteRoofSection: (roofId: string) => Promise<void>
  onAddDamageSpot: (roofId: string, photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDeleteDamageSpot: (roofId: string, spotId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
}
```

**Step 2: Add section type config**

```typescript
const SECTION_TYPE_OPTIONS: Array<{ value: RoofSectionType; label: string }> = [
  { value: 'main_house', label: 'Main House' },
  { value: 'garage',     label: 'Garage' },
  { value: 'patio',      label: 'Patio' },
  { value: 'carport',    label: 'Carport' },
  { value: 'flat_roof',  label: 'Flat Roof' },
  { value: 'other',      label: 'Other' },
]

const PENETRATION_OPTIONS: Array<{ value: PenetrationRange; label: string }> = [
  { value: '0_3',    label: '0–3' },
  { value: '4_7',    label: '4–7' },
  { value: '8_plus', label: '8+' },
]

const COMPLEXITY_OPTIONS: Array<{ value: RoofComplexity; label: string }> = [
  { value: 'simple',   label: 'Simple' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'complex',  label: 'Complex' },
]

function sectionLabel(r: RoofData): string {
  if (r.section_type === 'other' && r.section_custom_name) return r.section_custom_name
  return SECTION_TYPE_OPTIONS.find(o => o.value === r.section_type)?.label ?? 'Roof Section'
}

function isSectionDone(r: RoofData): boolean {
  return Boolean(r.overview_photo_id && r.slope_photo_id && r.shingles_photo_id && r.ridge_photo_id)
}
```

**Step 3: Component internal state**

```typescript
// 'list' = summary screen, 'detail' = section form
const [screen, setScreen] = useState<'list' | 'detail'>('list')
const [activeRoofId, setActiveRoofId] = useState<string | null>(null)

// Type picker state
const [showTypePicker, setShowTypePicker] = useState(false)
const [pickerType, setPickerType] = useState<RoofSectionType | null>(null)
const [pickerCustomName, setPickerCustomName] = useState('')
const [pickerCreating, setPickerCreating] = useState(false)

// Damage spot state per active section (keyed by roofId)
const [damageSpotsMap, setDamageSpotsMap] = useState<Record<string, RoofDamageSpot[]>>({})
```

**Step 4: Screen A — Section List**

```tsx
// Summary screen
if (screen === 'list') {
  const atLeastOneDone = roofSections.some(isSectionDone)
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: '...' }}>
      {/* Header — same dark gradient as current RoofStep */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, padding: '20px 20px 28px', position: 'relative', overflow: 'hidden' }}>
        {/* decorative circles */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(13,148,136,0.2)', border: '1px solid rgba(13,148,136,0.4)', borderRadius: 20, padding: '3px 10px', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 3 of 5</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.white, margin: 0, letterSpacing: '-0.02em' }}>Roof</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 5 }}>Document each roof section separately</p>
      </div>

      {/* Section cards */}
      <div style={{ padding: '20px 16px 0' }}>
        {roofSections.length === 0 && (
          <p style={{ fontSize: 14, color: C.slate, textAlign: 'center', padding: '32px 0' }}>
            No roof sections yet. Add one below.
          </p>
        )}
        {roofSections.map(section => {
          const done = isSectionDone(section)
          const photoCount = [section.overview_photo_id, section.slope_photo_id, section.shingles_photo_id, section.ridge_photo_id].filter(Boolean).length
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => { setActiveRoofId(section.id); setScreen('detail') }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', marginBottom: 10, borderRadius: 12,
                border: `1.5px solid ${done ? C.teal : C.border}`,
                backgroundColor: done ? C.tealLight : C.white,
                cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.navy, margin: 0 }}>{sectionLabel(section)}</p>
                <p style={{ fontSize: 12, color: done ? C.teal : C.slate, margin: '2px 0 0', fontWeight: 500 }}>
                  {done ? '✓ Done' : `${photoCount} of 4 photos`}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.slate} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )
        })}

        {/* Add section button */}
        <button
          type="button"
          onClick={() => setShowTypePicker(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '14px 16px', borderRadius: 12,
            border: `2px dashed ${C.borderStrong}`,
            backgroundColor: C.white, cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
            WebkitTapHighlightColor: 'transparent', marginTop: 4,
          }}
        >
          <span style={{ fontSize: 20, color: C.teal, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>Add Roof Section</span>
        </button>
      </div>

      {/* Type picker bottom sheet */}
      {showTypePicker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', backgroundColor: C.white, borderRadius: '20px 20px 0 0', padding: '20px 16px 32px' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '0 0 16px' }}>Select Roof Section</p>
            {SECTION_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPickerType(opt.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                  border: `1.5px solid ${pickerType === opt.value ? C.teal : C.border}`,
                  backgroundColor: pickerType === opt.value ? C.tealLight : C.white,
                  color: C.navy, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', outline: 'none', textAlign: 'left', fontFamily: 'inherit',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {opt.label}
              </button>
            ))}
            {pickerType === 'other' && (
              <input
                type="text"
                placeholder="e.g. Shed, Pool House..."
                value={pickerCustomName}
                onChange={e => setPickerCustomName(e.target.value)}
                style={{ width: '100%', height: 44, borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '0 12px', fontSize: 14, color: C.navy, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
              />
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setShowTypePicker(false); setPickerType(null); setPickerCustomName('') }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: `1.5px solid ${C.border}`, backgroundColor: C.white, color: C.navyMid, fontSize: 14, fontWeight: 700, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!pickerType || pickerCreating || (pickerType === 'other' && !pickerCustomName.trim())}
                onClick={async () => {
                  if (!pickerType) return
                  setPickerCreating(true)
                  const section = await onCreateRoofSection({
                    section_type: pickerType,
                    section_custom_name: pickerType === 'other' ? pickerCustomName.trim() : null,
                  })
                  setPickerCreating(false)
                  setShowTypePicker(false)
                  setPickerType(null)
                  setPickerCustomName('')
                  if (section) { setActiveRoofId(section.id); setScreen('detail') }
                }}
                style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', backgroundColor: (!pickerType || pickerCreating) ? '#FED7AA' : C.orange, color: C.white, fontSize: 14, fontWeight: 800, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
              >
                {pickerCreating ? 'Creating...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', backgroundColor: C.white, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <button type="button" onClick={onBack}
            style={{ background: 'none', border: 'none', padding: '0 0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back
          </button>
          <button type="button" onClick={onContinue} disabled={!atLeastOneDone}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', backgroundColor: !atLeastOneDone ? '#FED7AA' : C.orange, color: !atLeastOneDone ? '#FDBA74' : C.white, fontSize: 16, fontWeight: 800, cursor: !atLeastOneDone ? 'not-allowed' : 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            Continue →
          </button>
          {!atLeastOneDone && (
            <p style={{ textAlign: 'center', fontSize: 12, color: C.slate, marginTop: 8 }}>
              Complete at least one roof section to continue
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Screen B — Section Detail**

```tsx
// Detail screen — render the existing form for activeRoofId
const activeSection = roofSections.find(r => r.id === activeRoofId) ?? null
const damageSpots = damageSpotsMap[activeRoofId ?? ''] ?? []

// Return the detail form (same layout as current RoofStep) but:
// 1. Replace the header "Document all four roof sections" with the section label
// 2. Add Penetrations pill row after Squares
// 3. Add Complexity pill row after Penetrations
// 4. Add "Delete this section" button at the bottom
// 5. Back button goes to 'list' screen instead of calling onBack
// 6. onSaveRoof calls onUpdateRoofSection(activeRoofId, data)
// 7. onAddDamageSpot calls onAddRoofSectionDamageSpot(activeRoofId, ...)
// 8. onDeleteDamageSpot calls onDeleteRoofSectionDamageSpot(activeRoofId, ...)
```

For the detail form, keep all existing JSX from the current `RoofStep.tsx` but:

- Change back button: `onClick={() => setScreen('list')}`
- Change header subtitle from `"Document all four roof sections"` to `` `${sectionLabel(activeSection)} — Roof Section` ``
- `onSaveRoof` wraps `onUpdateRoofSection(activeSection.id, data)`
- After the Squares input, add:

```tsx
{/* Penetrations */}
<label style={labelStyle}>Penetrations</label>
<div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
  {PENETRATION_OPTIONS.map(opt => (
    <button key={opt.value} type="button"
      style={pillBtn(activeSection?.penetrations === opt.value)}
      onClick={() => void onUpdateRoofSection(activeSection.id, { penetrations: opt.value })}>
      {opt.label}
    </button>
  ))}
</div>

{/* Complexity */}
<label style={labelStyle}>Complexity</label>
<div style={{ display: 'flex', gap: 8, paddingBottom: 12 }}>
  {COMPLEXITY_OPTIONS.map(opt => (
    <button key={opt.value} type="button"
      style={pillBtn(activeSection?.complexity === opt.value)}
      onClick={() => void onUpdateRoofSection(activeSection.id, { complexity: opt.value })}>
      {opt.label}
    </button>
  ))}
</div>
```

After the Notes section, add the delete button:

```tsx
{/* Delete section */}
<div style={{ padding: '16px 0', borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
  <button type="button"
    onClick={async () => {
      if (window.confirm('Delete this roof section? This cannot be undone.')) {
        await onDeleteRoofSection(activeSection.id)
        setScreen('list')
        setActiveRoofId(null)
      }
    }}
    style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', outline: 'none', padding: 0 }}>
    Delete this section
  </button>
</div>
```

**Step 6: Update ContractorWizardV2.tsx to pass new props**

Find the `<RoofStep>` usage in `ContractorWizardV2.tsx` and update the props:

Replace:
```tsx
<RoofStep
  token={token}
  roof={state.roof}
  damageSpots={state.roofDamageSpots}
  onSaveRoof={state.saveRoof}
  onAddDamageSpot={state.addDamageSpot}
  onDeleteDamageSpot={state.deleteDamageSpot}
  onContinue={...}
  onBack={...}
  loading={state.roofLoading}
  error={null}
/>
```

With:
```tsx
<RoofStep
  token={token}
  roofSections={state.roofSections}
  roofLoading={state.roofLoading}
  onCreateRoofSection={state.createRoofSection}
  onUpdateRoofSection={state.updateRoofSection}
  onDeleteRoofSection={state.deleteRoofSection}
  onAddDamageSpot={state.addRoofSectionDamageSpot}
  onDeleteDamageSpot={state.deleteRoofSectionDamageSpot}
  onContinue={...}
  onBack={...}
/>
```

**Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Fix any type errors. Common issues:
- `RoofData` now expects `sort_order: number` — default to `0` where creating
- `damageSpotsMap` needs to be populated when entering detail screen (fetch from API or track locally)

**Step 8: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/steps/RoofStep.tsx \
        frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx
git commit -m "feat: rewrite RoofStep with multi-section summary UI"
```

---

## Task 9: End-to-end smoke test + final commit

**Step 1: Start backend**

```bash
cd backend && go run cmd/server/main.go
```

**Step 2: Start frontend**

```bash
cd frontend && npm run dev
```

**Step 3: Open a contractor link in browser and verify**

1. Navigate to step 3 (Roof)
2. See empty summary screen with "+ Add Roof Section"
3. Tap + → type picker appears
4. Select "Main House" → creates section, opens detail form
5. Upload 4 photos → section shows "✓ Done" on return to list
6. Add a second section ("Patio") with different shingle type
7. Set penetrations and complexity on each section
8. Continue button activates after first section is done
9. Delete a section — confirms and removes from list

**Step 4: Final push**

```bash
git push origin main
```
