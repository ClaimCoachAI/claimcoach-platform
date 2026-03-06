# Wizard V2 Slice 3 (Roof) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Roof inspection step (Step 3) to the Contractor Wizard V2, including DB schema, backend API, and React UI with a 2×2 named photo grid, metrics fields, damage flags, and an expandable damage-spot gallery.

**Architecture:** Two new DB tables (`inspection_roof` + `inspection_roof_damage_spot`) follow the same FK pattern as `inspection_elevation`. The backend adds four endpoints to the existing magic-link public route group, using the CTE-upsert-with-JOIN pattern for the save operation to return photo URLs in a single roundtrip. The frontend adds a `computeNextStep`/`computePrevStep` helper to `useWizardV2State` so the wizard correctly skips steps not selected in Quick Setup.

**Tech Stack:** Go 1.21, Gin, database/sql, lib/pq, github.com/google/uuid; React 18, TypeScript, Vite, Axios — all inline styles matching existing `QuickSetupStep`/`ElevationsStep` design tokens.

---

## CONTEXT — read this before touching any file

### Codebase layout
```
backend/
  internal/
    database/migrations/   ← SQL files, named 000NNN_*.{up,down}.sql
    models/inspection.go   ← all wizard V2 model types live here
    services/inspection_service.go  ← all wizard V2 service methods
    handlers/inspection_handler.go  ← handler + interface
    handlers/inspection_handler_test.go
    api/router.go

frontend/src/components/contractor-wizard-v2/
  types.ts
  useWizardV2State.ts
  usePhotoUpload.ts          ← 3-step upload: upload-url → PUT → confirm
  ContractorWizardV2.tsx     ← main component, renders step-specific screens
  steps/
    QuickSetupStep.tsx
    ElevationsStep.tsx
    RoofStep.tsx             ← TO CREATE
```

### Key patterns already established (follow them exactly)

**Migration style** — match 000018 column padding:
```sql
-- 000019_add_inspection_roof.up.sql

CREATE TABLE inspection_roof (
    id             UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id  UUID   NOT NULL REFERENCES ...
```

**CTE upsert with JOIN** (from `SaveElevation`): insert+conflict→returning wrapped in a CTE, then SELECT joining `documents` to return `file_url` in same roundtrip. For roof: 4 LEFT JOINs (one per named photo slot).

**Step advance in same tx**: after the CTE upsert, if the condition is met (here: all 4 photo IDs non-null), run `UPDATE inspection_v2 SET current_step = 4 WHERE id = $1 AND current_step < 4` in the same `sql.Tx`.

**Handler pattern**:
- Type aliases at top of `inspection_handler.go` so mock and real service share types
- `inspectionServiceInterface` interface listing all service methods
- `isTokenError(err)` helper returns 401; anything else returns 500
- 201 for creates/upserts, 200 for reads, 204 for deletes

**Test mock pattern** (`inspection_handler_test.go`):
```go
type mockInspectionService struct {
    getByTokenFn    func(...)
    saveSetupFn     func(...)
    getElevationsFn func(...)
    saveElevationFn func(...)
    // add new fn fields here for each new method
}
```
Each test creates a new `mockInspectionService{...}` with only the needed fn fields populated.

**Frontend state pattern**:
- `useWizardV2State.ts` holds all wizard state + API calls
- `usePhotoUpload(token)` returns `{ uploadPhoto, uploading, uploadError, clearUploadError }` — reuse this for every photo slot
- `saveElevation` uses 800ms per-side debounce via `useRef<Record<string, ReturnType<typeof setTimeout>>>({})`
- All styles are inline `React.CSSProperties`, never CSS modules

### Design tokens (copy from ElevationsStep — do not change)
```typescript
const C = {
  teal: '#0D9488', tealLight: '#CCFBF1', tealDim: 'rgba(13,148,136,0.12)',
  orange: '#F97316', navy: '#0F172A', navyMid: '#334155', slate: '#64748B',
  border: '#E2E8F0', borderStrong: '#CBD5E1', bg: '#F8FAFC', white: '#FFFFFF',
  errorBg: '#FFF1F2', errorBorder: '#FECDD3', errorText: '#BE123C',
}
```

---

## Backend Tasks

---

### Task 1: Migration 000019

**Files:**
- Create: `backend/internal/database/migrations/000019_add_inspection_roof.up.sql`
- Create: `backend/internal/database/migrations/000019_add_inspection_roof.down.sql`

**Step 1: Create the up migration**

```sql
-- 000019_add_inspection_roof.up.sql

CREATE TABLE inspection_roof (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id        UUID         NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,

    -- Named photo slots (URLs resolved at read-time via JOIN)
    overview_photo_id    UUID         REFERENCES documents(id),
    slope_photo_id       UUID         REFERENCES documents(id),
    shingles_photo_id    UUID         REFERENCES documents(id),
    ridge_photo_id       UUID         REFERENCES documents(id),

    -- Roof metrics
    pitch                TEXT         CHECK (pitch IN ('flat','2_12','4_12','6_12','8_12','10_12','12_12_plus')),
    shingle_type         TEXT         CHECK (shingle_type IN ('3tab','architectural','metal','tile','tpo','other')),
    layers               INT          CHECK (layers BETWEEN 1 AND 5),
    squares              NUMERIC(6,1),

    -- Damage flags
    has_ridge_damage     BOOLEAN      NOT NULL DEFAULT false,
    has_valley_damage    BOOLEAN      NOT NULL DEFAULT false,
    has_flashing_damage  BOOLEAN      NOT NULL DEFAULT false,
    decking_condition    TEXT         CHECK (decking_condition IN ('good','soft_spots','needs_replace')),  -- nullable; app enforces when any damage flag = true

    notes                TEXT,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW(),

    UNIQUE (inspection_id)
);

CREATE INDEX idx_inspection_roof_inspection ON inspection_roof(inspection_id);

CREATE TABLE inspection_roof_damage_spot (
    id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    roof_id     UUID      NOT NULL REFERENCES inspection_roof(id) ON DELETE CASCADE,
    photo_id    UUID      REFERENCES documents(id),
    photo_url   TEXT,
    caption     TEXT,
    sort_order  INT       NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_roof_damage_roof ON inspection_roof_damage_spot(roof_id);
```

**Step 2: Create the down migration**

```sql
-- 000019_add_inspection_roof.down.sql
DROP TABLE IF EXISTS inspection_roof_damage_spot;
DROP TABLE IF EXISTS inspection_roof;
```

**Step 3: Verify migration files exist**

```bash
ls backend/internal/database/migrations/000019*
```
Expected: two files (`up.sql` and `down.sql`).

**Step 4: Commit**

```bash
git add backend/internal/database/migrations/000019_add_inspection_roof.up.sql \
        backend/internal/database/migrations/000019_add_inspection_roof.down.sql
git commit -m "feat: add inspection_roof and inspection_roof_damage_spot migrations"
```

---

### Task 2: Go Models

**Files:**
- Modify: `backend/internal/models/inspection.go` (append after `InspectionElevation`)

**Step 1: Append the new types**

Add the following after the closing brace of `InspectionElevation` (the last type in the file):

```go
// ── Roof ──────────────────────────────────────────────────────────────────────

// InspectionRoof holds metrics and named photo slots for the roof inspection step.
type InspectionRoof struct {
	ID                string  `json:"id" db:"id"`
	InspectionID      string  `json:"inspection_id" db:"inspection_id"`
	OverviewPhotoID   *string `json:"overview_photo_id" db:"overview_photo_id"`
	OverviewPhotoURL  *string `json:"overview_photo_url,omitempty"` // populated via JOIN
	SlopePhotoID      *string `json:"slope_photo_id" db:"slope_photo_id"`
	SlopePhotoURL     *string `json:"slope_photo_url,omitempty"`
	ShinglesPhotoID   *string `json:"shingles_photo_id" db:"shingles_photo_id"`
	ShinglesPhotoURL  *string `json:"shingles_photo_url,omitempty"`
	RidgePhotoID      *string `json:"ridge_photo_id" db:"ridge_photo_id"`
	RidgePhotoURL     *string `json:"ridge_photo_url,omitempty"`
	Pitch             *string `json:"pitch" db:"pitch"`
	ShingleType       *string `json:"shingle_type" db:"shingle_type"`
	Layers            *int    `json:"layers" db:"layers"`
	Squares           *float64 `json:"squares" db:"squares"`
	HasRidgeDamage    bool    `json:"has_ridge_damage" db:"has_ridge_damage"`
	HasValleyDamage   bool    `json:"has_valley_damage" db:"has_valley_damage"`
	HasFlashingDamage bool    `json:"has_flashing_damage" db:"has_flashing_damage"`
	DeckingCondition  *string `json:"decking_condition" db:"decking_condition"`
	Notes             *string `json:"notes" db:"notes"`
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
```

**Step 2: Verify the file compiles**

```bash
cd backend && go build ./internal/models/...
```
Expected: no output (success).

**Step 3: Commit**

```bash
git add backend/internal/models/inspection.go
git commit -m "feat: add InspectionRoof and RoofDamageSpot models"
```

---

### Task 3: Go Service

**Files:**
- Modify: `backend/internal/services/inspection_service.go` (append after `SaveElevation`)

**Step 1: Append input types and all four service methods**

Add the following at the end of `inspection_service.go`:

```go
// ── Roof ──────────────────────────────────────────────────────────────────────

// SaveRoofInput is the request body for upserting the roof inspection row.
type SaveRoofInput struct {
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
}

// AddDamageSpotInput is the request body for attaching one damage-spot photo.
type AddDamageSpotInput struct {
	PhotoDocumentID *string `json:"photo_document_id"`
	Caption         *string `json:"caption"`
	SortOrder       int     `json:"sort_order"`
}

// GetRoofResponse wraps the roof row and its damage spots.
type GetRoofResponse struct {
	Roof        *models.InspectionRoof   `json:"roof"`
	DamageSpots []models.RoofDamageSpot  `json:"damage_spots"`
}

// GetRoof loads the roof row (if any) and all damage spots for the inspection
// identified by token. Returns a nil Roof and empty DamageSpots when not yet started.
func (s *InspectionService) GetRoof(token string) (*GetRoofResponse, error) {
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
		return &GetRoofResponse{Roof: nil, DamageSpots: []models.RoofDamageSpot{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	resp := &GetRoofResponse{DamageSpots: []models.RoofDamageSpot{}}

	var r models.InspectionRoof
	err = s.db.QueryRow(`
		SELECT r.id, r.inspection_id,
		       r.overview_photo_id,  d1.file_url,
		       r.slope_photo_id,     d2.file_url,
		       r.shingles_photo_id,  d3.file_url,
		       r.ridge_photo_id,     d4.file_url,
		       r.pitch, r.shingle_type, r.layers, r.squares,
		       r.has_ridge_damage, r.has_valley_damage, r.has_flashing_damage,
		       r.decking_condition, r.notes,
		       r.created_at, r.updated_at
		FROM inspection_roof r
		LEFT JOIN documents d1 ON d1.id = r.overview_photo_id
		LEFT JOIN documents d2 ON d2.id = r.slope_photo_id
		LEFT JOIN documents d3 ON d3.id = r.shingles_photo_id
		LEFT JOIN documents d4 ON d4.id = r.ridge_photo_id
		WHERE r.inspection_id = $1
	`, inspectionID).Scan(
		&r.ID, &r.InspectionID,
		&r.OverviewPhotoID, &r.OverviewPhotoURL,
		&r.SlopePhotoID, &r.SlopePhotoURL,
		&r.ShinglesPhotoID, &r.ShinglesPhotoURL,
		&r.RidgePhotoID, &r.RidgePhotoURL,
		&r.Pitch, &r.ShingleType, &r.Layers, &r.Squares,
		&r.HasRidgeDamage, &r.HasValleyDamage, &r.HasFlashingDamage,
		&r.DeckingCondition, &r.Notes,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return resp, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query roof: %w", err)
	}
	resp.Roof = &r

	rows, err := s.db.Query(`
		SELECT id, roof_id, photo_id, photo_url, caption, sort_order, created_at
		FROM inspection_roof_damage_spot
		WHERE roof_id = $1
		ORDER BY sort_order, created_at
	`, r.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to query damage spots: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var spot models.RoofDamageSpot
		if err = rows.Scan(
			&spot.ID, &spot.RoofID, &spot.PhotoID, &spot.PhotoURL,
			&spot.Caption, &spot.SortOrder, &spot.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan damage spot: %w", err)
		}
		resp.DamageSpots = append(resp.DamageSpots, spot)
	}
	return resp, rows.Err()
}

// SaveRoof upserts the roof row for the inspection identified by token.
// Uses a CTE with four LEFT JOINs to return photo URLs in a single roundtrip.
// Advances current_step to 4 once all four named photo IDs are non-null.
func (s *InspectionService) SaveRoof(token string, input SaveRoofInput) (*models.InspectionRoof, error) {
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
		return nil, fmt.Errorf("inspection not found for this magic link: %w", sql.ErrNoRows)
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
		WITH upserted AS (
			INSERT INTO inspection_roof (
				id, inspection_id,
				overview_photo_id, slope_photo_id, shingles_photo_id, ridge_photo_id,
				pitch, shingle_type, layers, squares,
				has_ridge_damage, has_valley_damage, has_flashing_damage,
				decking_condition, notes,
				created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
			ON CONFLICT (inspection_id) DO UPDATE
			SET overview_photo_id   = EXCLUDED.overview_photo_id,
			    slope_photo_id      = EXCLUDED.slope_photo_id,
			    shingles_photo_id   = EXCLUDED.shingles_photo_id,
			    ridge_photo_id      = EXCLUDED.ridge_photo_id,
			    pitch               = EXCLUDED.pitch,
			    shingle_type        = EXCLUDED.shingle_type,
			    layers              = EXCLUDED.layers,
			    squares             = EXCLUDED.squares,
			    has_ridge_damage    = EXCLUDED.has_ridge_damage,
			    has_valley_damage   = EXCLUDED.has_valley_damage,
			    has_flashing_damage = EXCLUDED.has_flashing_damage,
			    decking_condition   = EXCLUDED.decking_condition,
			    notes               = EXCLUDED.notes,
			    updated_at          = EXCLUDED.updated_at
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
		       u.created_at, u.updated_at
		FROM upserted u
		LEFT JOIN documents d1 ON d1.id = u.overview_photo_id
		LEFT JOIN documents d2 ON d2.id = u.slope_photo_id
		LEFT JOIN documents d3 ON d3.id = u.shingles_photo_id
		LEFT JOIN documents d4 ON d4.id = u.ridge_photo_id
	`,
		newID, inspectionID,
		input.OverviewPhotoID, input.SlopePhotoID, input.ShinglesPhotoID, input.RidgePhotoID,
		input.Pitch, input.ShingleType, input.Layers, input.Squares,
		input.HasRidgeDamage, input.HasValleyDamage, input.HasFlashingDamage,
		input.DeckingCondition, input.Notes,
		now,
	).Scan(
		&r.ID, &r.InspectionID,
		&r.OverviewPhotoID, &r.OverviewPhotoURL,
		&r.SlopePhotoID, &r.SlopePhotoURL,
		&r.ShinglesPhotoID, &r.ShinglesPhotoURL,
		&r.RidgePhotoID, &r.RidgePhotoURL,
		&r.Pitch, &r.ShingleType, &r.Layers, &r.Squares,
		&r.HasRidgeDamage, &r.HasValleyDamage, &r.HasFlashingDamage,
		&r.DeckingCondition, &r.Notes,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert roof: %w", err)
	}

	// Advance to step 4 once all four named photos are confirmed.
	if r.OverviewPhotoID != nil && r.SlopePhotoID != nil &&
		r.ShinglesPhotoID != nil && r.RidgePhotoID != nil {
		if _, err = tx.Exec(
			`UPDATE inspection_v2 SET current_step = 4, updated_at = $1
			 WHERE id = $2 AND current_step < 4`,
			now, inspectionID,
		); err != nil {
			return nil, fmt.Errorf("failed to advance inspection step: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit roof save: %w", err)
	}

	return &r, nil
}

// AddDamageSpot attaches a damage-evidence photo to the roof for this inspection.
// Returns an error if the roof row does not yet exist (caller must SaveRoof first).
func (s *InspectionService) AddDamageSpot(token string, input AddDamageSpotInput) (*models.RoofDamageSpot, error) {
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
		return nil, fmt.Errorf("inspection not found for this magic link: %w", sql.ErrNoRows)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	var roofID string
	err = s.db.QueryRow(
		`SELECT id FROM inspection_roof WHERE inspection_id = $1`,
		inspectionID,
	).Scan(&roofID)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("roof record not found: save the roof first")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up roof: %w", err)
	}

	// Resolve photo_url if a document ID was provided.
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

// DeleteDamageSpot removes a damage spot by ID, verifying it belongs to this inspection.
// Returns an error wrapping sql.ErrNoRows if the spot does not exist or belongs to another inspection.
func (s *InspectionService) DeleteDamageSpot(token string, spotID string) error {
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
		return fmt.Errorf("inspection not found: %w", sql.ErrNoRows)
	}
	if err != nil {
		return fmt.Errorf("failed to look up inspection: %w", err)
	}

	result, err := s.db.Exec(`
		DELETE FROM inspection_roof_damage_spot
		WHERE id = $1
		  AND roof_id IN (
		      SELECT id FROM inspection_roof WHERE inspection_id = $2
		  )
	`, spotID, inspectionID)
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

**Step 2: Verify the file compiles**

```bash
cd backend && go build ./internal/services/...
```
Expected: no output (success).

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: add GetRoof, SaveRoof, AddDamageSpot, DeleteDamageSpot service methods"
```

---

### Task 4: Go Handler + Tests

**Files:**
- Modify: `backend/internal/handlers/inspection_handler.go`
- Modify: `backend/internal/handlers/inspection_handler_test.go`

**Step 1: Extend the handler — add type aliases, interface methods, and four handlers**

In `inspection_handler.go`:

1. Add four type aliases alongside the existing ones at the top of the file:
```go
type getRoofResponse    = services.GetRoofResponse
type saveRoofInput      = services.SaveRoofInput
type addDamageSpotInput = services.AddDamageSpotInput
type roofResponse       = models.InspectionRoof
type roofDamageSpotResp = models.RoofDamageSpot
```

2. Add four methods to `inspectionServiceInterface`:
```go
GetRoof(token string) (*getRoofResponse, error)
SaveRoof(token string, input saveRoofInput) (*roofResponse, error)
AddDamageSpot(token string, input addDamageSpotInput) (*roofDamageSpotResp, error)
DeleteDamageSpot(token string, spotID string) error
```

3. Append the four handler methods at the end of the file:

```go
// GetRoof handles GET /api/magic-links/:token/v2/inspection/roof.
// Returns 200 with roof and damage_spots (roof is null when not started).
func (h *InspectionHandler) GetRoof(c *gin.Context) {
	token := c.Param("token")

	resp, err := h.service.GetRoof(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load roof: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}

// SaveRoof handles PUT /api/magic-links/:token/v2/inspection/roof.
// Returns 201 with the saved roof row.
func (h *InspectionHandler) SaveRoof(c *gin.Context) {
	token := c.Param("token")

	var input saveRoofInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	roof, err := h.service.SaveRoof(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save roof: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": roof})
}

// AddDamageSpot handles POST /api/magic-links/:token/v2/inspection/roof/damage-spots.
// Returns 201 with the new damage spot.
func (h *InspectionHandler) AddDamageSpot(c *gin.Context) {
	token := c.Param("token")

	var input addDamageSpotInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	spot, err := h.service.AddDamageSpot(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add damage spot: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": spot})
}

// DeleteDamageSpot handles DELETE /api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId.
// Returns 204 on success, 404 when the spot does not exist or belongs to another inspection.
func (h *InspectionHandler) DeleteDamageSpot(c *gin.Context) {
	token := c.Param("token")
	spotID := c.Param("spotId")

	err := h.service.DeleteDamageSpot(token, spotID)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Damage spot not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete damage spot: " + err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
```

**Step 2: Extend the test mock and write five new tests**

In `inspection_handler_test.go`:

1. Add four fn fields to `mockInspectionService`:
```go
getRoofFn         func(token string) (*getRoofResponse, error)
saveRoofFn        func(token string, input saveRoofInput) (*roofResponse, error)
addDamageSpotFn   func(token string, input addDamageSpotInput) (*roofDamageSpotResp, error)
deleteDamageSpotFn func(token string, spotID string) error
```

2. Add four method implementations to `mockInspectionService`:
```go
func (m *mockInspectionService) GetRoof(token string) (*getRoofResponse, error) {
	return m.getRoofFn(token)
}
func (m *mockInspectionService) SaveRoof(token string, input saveRoofInput) (*roofResponse, error) {
	return m.saveRoofFn(token, input)
}
func (m *mockInspectionService) AddDamageSpot(token string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
	return m.addDamageSpotFn(token, input)
}
func (m *mockInspectionService) DeleteDamageSpot(token string, spotID string) error {
	return m.deleteDamageSpotFn(token, spotID)
}
```

3. Add five tests:

```go
func TestInspectionHandler_GetRoof_ReturnsNullRoofWhenNone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getRoofFn: func(token string) (*getRoofResponse, error) {
			return &getRoofResponse{Roof: nil, DamageSpots: []roofDamageSpotResp{}}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/roof", handler.GetRoof)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/roof", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].(map[string]interface{})
	assert.Nil(t, data["roof"])
	assert.NotNil(t, data["damage_spots"])
}

func TestInspectionHandler_SaveRoof_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		saveRoofFn: func(token string, input saveRoofInput) (*roofResponse, error) {
			return &roofResponse{ID: "roof-uuid-123", InspectionID: "insp-uuid-456"}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/roof", handler.SaveRoof)
	payload := map[string]interface{}{"has_ridge_damage": false, "has_valley_damage": false, "has_flashing_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/roof", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "roof-uuid-123", data["id"])
}

func TestInspectionHandler_AddDamageSpot_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	caption := "NW valley crack"
	mock := &mockInspectionService{
		addDamageSpotFn: func(token string, input addDamageSpotInput) (*roofDamageSpotResp, error) {
			return &roofDamageSpotResp{ID: "spot-uuid-789", Caption: &caption}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/roof/damage-spots", handler.AddDamageSpot)
	payload := map[string]interface{}{"caption": caption}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/roof/damage-spots", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "spot-uuid-789", data["id"])
}

func TestInspectionHandler_DeleteDamageSpot_Returns204OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteDamageSpotFn: func(token string, spotID string) error { return nil },
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", handler.DeleteDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof/damage-spots/spot-uuid-789", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestInspectionHandler_DeleteDamageSpot_Returns404ForUnknownSpot(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteDamageSpotFn: func(token string, spotID string) error {
			return fmt.Errorf("damage spot not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", handler.DeleteDamageSpot)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/roof/damage-spots/nonexistent", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, false, resp["success"])
	assert.Contains(t, resp["error"], "not found")
}
```

Note: The test file needs `"database/sql"` added to its import block since `sql.ErrNoRows` is used in the last test.

**Step 3: Run all inspection handler tests**

```bash
cd backend && go test ./internal/handlers/... -run TestInspectionHandler -v
```
Expected: 12/12 tests PASS (7 existing + 5 new).

**Step 4: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go \
        backend/internal/handlers/inspection_handler_test.go
git commit -m "feat: add GetRoof, SaveRoof, AddDamageSpot, DeleteDamageSpot handlers (12 tests passing)"
```

---

### Task 5: Router

**Files:**
- Modify: `backend/internal/api/router.go`

**Step 1: Add four routes**

In `router.go`, in the public magic-link route block (after the existing `r.PUT(".../elevations/:side", ...)` line), add:

```go
// Roof routes (public - no auth required)
r.GET("/api/magic-links/:token/v2/inspection/roof", inspectionHandler.GetRoof)
r.PUT("/api/magic-links/:token/v2/inspection/roof", inspectionHandler.SaveRoof)
r.POST("/api/magic-links/:token/v2/inspection/roof/damage-spots", inspectionHandler.AddDamageSpot)
r.DELETE("/api/magic-links/:token/v2/inspection/roof/damage-spots/:spotId", inspectionHandler.DeleteDamageSpot)
```

**Step 2: Verify the full backend compiles**

```bash
cd backend && go build ./...
```
Expected: no output (success).

**Step 3: Run all tests**

```bash
cd backend && go test ./...
```
Expected: all pass.

**Step 4: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: register roof inspection routes"
```

---

## Frontend Tasks

---

### Task 6: TypeScript Types

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/types.ts`

**Step 1: Append roof types**

Add at the end of `types.ts`:

```typescript
// ── Roof ──────────────────────────────────────────────────────────────────────

export type Pitch = 'flat' | '2_12' | '4_12' | '6_12' | '8_12' | '10_12' | '12_12_plus'

export type RoofShingleType = '3tab' | 'architectural' | 'metal' | 'tile' | 'tpo' | 'other'

export type DeckingCondition = 'good' | 'soft_spots' | 'needs_replace'

/** The four required named photo slots on the roof. */
export type RoofPhotoSlot = 'overview' | 'slope' | 'shingles' | 'ridge'

export interface RoofDamageSpot {
  id: string
  roof_id: string
  photo_id: string | null
  photo_url: string | null
  caption: string | null
  sort_order: number
}

export interface RoofData {
  id?: string
  inspection_id?: string
  overview_photo_id: string | null
  overview_photo_url: string | null
  slope_photo_id: string | null
  slope_photo_url: string | null
  shingles_photo_id: string | null
  shingles_photo_url: string | null
  ridge_photo_id: string | null
  ridge_photo_url: string | null
  pitch: Pitch | null
  shingle_type: RoofShingleType | null
  layers: number | null
  squares: number | null
  has_ridge_damage: boolean
  has_valley_damage: boolean
  has_flashing_damage: boolean
  decking_condition: DeckingCondition | null
  notes: string | null
}
```

**Step 2: Verify tsc**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/types.ts
git commit -m "feat: add Roof TypeScript types (RoofData, RoofDamageSpot, Pitch, etc.)"
```

---

### Task 7: State Hook — roof state + API calls + computeNextStep/Prev

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Step 1: Add imports and new state fields**

1. Add to the type import at the top:
```typescript
import type {
  WizardStep,
  QuickSetupData,
  GetSetupResponse,
  InspectionV2,
  ElevationData,
  ElevationSide,
  RoofData,
  RoofDamageSpot,
} from './types'
```

2. Extend `WizardV2State` interface with:
```typescript
roof: RoofData | null
roofDamageSpots: RoofDamageSpot[]
roofLoading: boolean
saveRoof: (data: Partial<RoofData>) => Promise<void>
addDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
deleteDamageSpot: (spotId: string) => Promise<void>
computeNextStep: (from: WizardStep) => WizardStep
computePrevStep: (from: WizardStep) => WizardStep
```

3. Add state variables inside the hook (after the elevation state):
```typescript
const [roof, setRoof] = useState<RoofData | null>(null)
const [roofDamageSpots, setRoofDamageSpots] = useState<RoofDamageSpot[]>([])
const [roofLoading, setRoofLoading] = useState(false)
const roofDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
```

**Step 2: Add computeNextStep and computePrevStep**

Add these after the `loadElevations` callback:

```typescript
const computeNextStep = useCallback((from: WizardStep): WizardStep => {
  const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
  const steps: WizardStep[] = [1]
  if (include_exterior) steps.push(2)
  if (include_roof)     steps.push(3)
  if (include_interior) steps.push(4)
  steps.push(5)
  const idx = steps.indexOf(from)
  if (idx === -1 || idx >= steps.length - 1) return 5
  return steps[idx + 1]
}, [quickSetup.area_selection])

const computePrevStep = useCallback((from: WizardStep): WizardStep => {
  const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
  const steps: WizardStep[] = [1]
  if (include_exterior) steps.push(2)
  if (include_roof)     steps.push(3)
  if (include_interior) steps.push(4)
  steps.push(5)
  const idx = steps.indexOf(from)
  if (idx <= 0) return 1
  return steps[idx - 1]
}, [quickSetup.area_selection])
```

**Step 3: Add loadRoof, saveRoof, addDamageSpot, deleteDamageSpot**

```typescript
const loadRoof = useCallback(async () => {
  try {
    const { data } = await axios.get<{ success: boolean; data: { roof: RoofData | null; damage_spots: RoofDamageSpot[] } }>(
      `${API}/api/magic-links/${token}/v2/inspection/roof`
    )
    setRoof(data.data.roof)
    setRoofDamageSpots(data.data.damage_spots)
  } catch {
    // non-fatal: roof stays at current state
  }
}, [token])

const saveRoof = useCallback(async (data: Partial<RoofData>) => {
  // 800ms debounce — cancel any pending save
  if (roofDebounceTimer.current) clearTimeout(roofDebounceTimer.current)
  roofDebounceTimer.current = setTimeout(async () => {
    setRoofLoading(true)
    try {
      const merged: RoofData = {
        overview_photo_id: null, overview_photo_url: null,
        slope_photo_id: null, slope_photo_url: null,
        shingles_photo_id: null, shingles_photo_url: null,
        ridge_photo_id: null, ridge_photo_url: null,
        pitch: null, shingle_type: null, layers: null, squares: null,
        has_ridge_damage: false, has_valley_damage: false, has_flashing_damage: false,
        decking_condition: null, notes: null,
        ...roof,
        ...data,
      }
      const { data: res } = await axios.put<{ success: boolean; data: RoofData }>(
        `${API}/api/magic-links/${token}/v2/inspection/roof`,
        merged
      )
      setRoof(res.data)
    } catch {
      // non-fatal
    } finally {
      setRoofLoading(false)
    }
  }, 800)
}, [token, roof])

const addDamageSpot = useCallback(async (
  photoDocumentId: string | null,
  caption: string | null,
): Promise<RoofDamageSpot | null> => {
  try {
    const { data } = await axios.post<{ success: boolean; data: RoofDamageSpot }>(
      `${API}/api/magic-links/${token}/v2/inspection/roof/damage-spots`,
      { photo_document_id: photoDocumentId, caption, sort_order: roofDamageSpots.length }
    )
    setRoofDamageSpots(prev => [...prev, data.data])
    return data.data
  } catch {
    return null
  }
}, [token, roofDamageSpots.length])

const deleteDamageSpot = useCallback(async (spotId: string) => {
  try {
    await axios.delete(`${API}/api/magic-links/${token}/v2/inspection/roof/damage-spots/${spotId}`)
    setRoofDamageSpots(prev => prev.filter(s => s.id !== spotId))
  } catch {
    // non-fatal
  }
}, [token])
```

**Step 4: Wire loadRoof to currentStep**

Add to the existing `useEffect([currentStep, loadElevations])` block — change it to also handle step 3:

```typescript
useEffect(() => {
  if (currentStep === 2) loadElevations()
  if (currentStep === 3) loadRoof()
}, [currentStep, loadElevations, loadRoof])
```

**Step 5: Fix submitQuickSetup to use computeNextStep**

The existing `submitQuickSetup` hardcodes `setCurrentStep(2)`. This now needs to use `computeNextStep(1)`. However, `computeNextStep` depends on `quickSetup.area_selection` which is already in state at call time, so it works correctly.

Change:
```typescript
setCurrentStep(2)
```
To:
```typescript
// compute based on which areas were selected in Quick Setup
const { include_exterior, include_roof, include_interior } = quickSetup.area_selection
const steps: WizardStep[] = [1]
if (include_exterior) steps.push(2 as WizardStep)
if (include_roof)     steps.push(3 as WizardStep)
if (include_interior) steps.push(4 as WizardStep)
steps.push(5 as WizardStep)
setCurrentStep(steps[1] ?? 5)
```
(Note: `computeNextStep` can't be called inside `submitQuickSetup` directly because it's defined later in the hook and may not be in scope at definition time — inline the logic here for clarity.)

**Step 6: Return new values**

Add to the return object:
```typescript
roof,
roofDamageSpots,
roofLoading,
saveRoof,
addDamageSpot,
deleteDamageSpot,
computeNextStep,
computePrevStep,
```

**Step 7: Verify tsc**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output.

**Step 8: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
git commit -m "feat: add roof state, API calls, and computeNextStep/Prev to useWizardV2State"
```

---

### Task 8: RoofStep UI Component

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/steps/RoofStep.tsx`

**Step 1: Create the component**

This is a single scrollable page (no tabs). Structure:
1. Navy gradient header ("Step 3 of 5 — Roof")
2. 2×2 named photo grid (`NamedPhotoSlot` sub-component × 4)
3. Roof details (pitch pills, shingle type pills, layers + squares inputs)
4. Damage flags (3 YES/NO toggle rows + decking condition pills)
5. Damage photos section — only when `anyDamage === true` (horizontal scroll + Add button)
6. Notes textarea
7. Back + Continue buttons (Continue disabled until all 4 slots have a photo_document_id)

```typescript
import React, { useState, useCallback, useEffect, useRef } from 'react'
import type {
  RoofData, RoofDamageSpot, RoofPhotoSlot,
  Pitch, RoofShingleType, DeckingCondition,
} from '../types'
import { usePhotoUpload } from '../usePhotoUpload'

// ─── Props ────────────────────────────────────────────────────────────────────
interface RoofStepProps {
  token: string
  roof: RoofData | null
  damageSpots: RoofDamageSpot[]
  onSaveRoof: (data: Partial<RoofData>) => Promise<void>
  onAddDamageSpot: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDeleteDamageSpot: (spotId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  teal: '#0D9488', tealLight: '#CCFBF1', tealDim: 'rgba(13,148,136,0.12)',
  orange: '#F97316', navy: '#0F172A', navyMid: '#334155', slate: '#64748B',
  border: '#E2E8F0', borderStrong: '#CBD5E1', bg: '#F8FAFC', white: '#FFFFFF',
  errorBg: '#FFF1F2', errorBorder: '#FECDD3', errorText: '#BE123C',
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PHOTO_SLOTS: Array<{ key: RoofPhotoSlot; label: string; photoIdField: keyof RoofData; photoUrlField: keyof RoofData }> = [
  { key: 'overview',  label: 'Overview',  photoIdField: 'overview_photo_id',  photoUrlField: 'overview_photo_url' },
  { key: 'slope',     label: 'Slope',     photoIdField: 'slope_photo_id',     photoUrlField: 'slope_photo_url' },
  { key: 'shingles',  label: 'Shingles',  photoIdField: 'shingles_photo_id',  photoUrlField: 'shingles_photo_url' },
  { key: 'ridge',     label: 'Ridge',     photoIdField: 'ridge_photo_id',     photoUrlField: 'ridge_photo_url' },
]

const PITCH_OPTIONS: Array<{ value: Pitch; label: string }> = [
  { value: 'flat',       label: 'Flat' },
  { value: '2_12',       label: '2/12' },
  { value: '4_12',       label: '4/12' },
  { value: '6_12',       label: '6/12' },
  { value: '8_12',       label: '8/12' },
  { value: '10_12',      label: '10/12' },
  { value: '12_12_plus', label: '12/12+' },
]

const SHINGLE_OPTIONS: Array<{ value: RoofShingleType; label: string }> = [
  { value: '3tab',           label: '3-Tab' },
  { value: 'architectural',  label: 'Architectural' },
  { value: 'metal',          label: 'Metal' },
  { value: 'tile',           label: 'Tile' },
  { value: 'tpo',            label: 'TPO' },
  { value: 'other',          label: 'Other' },
]

const DECKING_OPTIONS: Array<{ value: DeckingCondition; label: string }> = [
  { value: 'good',          label: 'Good' },
  { value: 'soft_spots',    label: 'Soft Spots' },
  { value: 'needs_replace', label: 'Needs Replacement' },
]

// ─── NamedPhotoSlot ───────────────────────────────────────────────────────────
function NamedPhotoSlot({
  slotKey, label, token, photoId, photoUrl, onSaveRoof, photoIdField,
}: {
  slotKey: RoofPhotoSlot
  label: string
  token: string
  photoId: string | null
  photoUrl: string | null
  onSaveRoof: (data: Partial<RoofData>) => Promise<void>
  photoIdField: keyof RoofData
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadPhoto, uploading, uploadError, clearUploadError } = usePhotoUpload(token)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      clearUploadError()
      const result = await uploadPhoto(file)
      if (result) {
        await onSaveRoof({ [photoIdField]: result.documentId } as Partial<RoofData>)
      }
    },
    [uploadPhoto, onSaveRoof, clearUploadError, photoIdField],
  )

  const hasPhoto = Boolean(photoId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <div
        style={{
          position: 'relative',
          borderRadius: 12,
          overflow: 'hidden',
          border: hasPhoto ? `2px solid ${C.teal}` : `2px dashed ${C.borderStrong}`,
          backgroundColor: hasPhoto ? 'transparent' : C.white,
          aspectRatio: '1 / 1',
          cursor: uploading ? 'default' : 'pointer',
          boxSizing: 'border-box',
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${label} photo`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      >
        {!hasPhoto && !uploading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 8 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.tealDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </div>
        )}

        {uploading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: C.tealDim }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {hasPhoto && !uploading && (
          <>
            {photoUrl ? (
              <img src={photoUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: C.tealDim }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 18, fontWeight: 800 }}>✓</span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
              style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 6, padding: '3px 7px', color: C.white, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
              aria-label={`Replace ${label} photo`}
            >
              Replace
            </button>
          </>
        )}
      </div>

      <span style={{ fontSize: 11, fontWeight: 700, color: hasPhoto ? C.teal : C.slate, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center' }}>
        {label}
        {hasPhoto && ' ✓'}
      </span>

      {uploadError && (
        <p style={{ fontSize: 11, color: C.errorText, margin: 0, textAlign: 'center' }}>{uploadError}</p>
      )}
    </div>
  )
}

// ─── DamagePhotoGallery ────────────────────────────────────────────────────────
function DamagePhotoGallery({
  token, spots, onAdd, onDelete,
}: {
  token: string
  spots: RoofDamageSpot[]
  onAdd: (photoDocumentId: string | null, caption: string | null) => Promise<RoofDamageSpot | null>
  onDelete: (spotId: string) => Promise<void>
}) {
  const { uploadPhoto, uploading } = usePhotoUpload(token)

  const handleAdd = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const result = await uploadPhoto(file)
    if (result) {
      await onAdd(result.documentId, null)
    }
  }, [uploadPhoto, onAdd])

  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/heic" style={{ display: 'none' }} onChange={handleAdd} aria-hidden="true" />
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {spots.map((spot) => (
          <div key={spot.id} style={{ position: 'relative', flexShrink: 0, width: 80, height: 80, borderRadius: 10, overflow: 'hidden', border: `2px solid ${C.teal}` }}>
            {spot.photo_url ? (
              <img src={spot.photo_url} alt="damage" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: C.tealDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.teal, fontSize: 20 }}>✓</div>
            )}
            <button
              type="button"
              onClick={() => void onDelete(spot.id)}
              style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: C.white, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: 'inherit', outline: 'none', padding: 0 }}
              aria-label="Delete damage photo"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ flexShrink: 0, width: 80, height: 80, borderRadius: 10, border: `2px dashed ${C.borderStrong}`, backgroundColor: C.white, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, outline: 'none', fontFamily: 'inherit' }}
          aria-label="Add damage photo"
        >
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <>
              <span style={{ fontSize: 20, lineHeight: 1, color: C.slate }}>+</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function RoofStep({
  token, roof, damageSpots, onSaveRoof, onAddDamageSpot, onDeleteDamageSpot,
  onContinue, onBack, loading, error,
}: RoofStepProps) {
  const [localLayers, setLocalLayers] = useState<string>(roof?.layers != null ? String(roof.layers) : '')
  const [localSquares, setLocalSquares] = useState<string>(roof?.squares != null ? String(roof.squares) : '')
  const [localNotes, setLocalNotes] = useState<string>(roof?.notes ?? '')

  // Sync local inputs when roof prop updates (server refresh after debounced save)
  useEffect(() => {
    setLocalLayers(roof?.layers != null ? String(roof.layers) : '')
    setLocalSquares(roof?.squares != null ? String(roof.squares) : '')
    setLocalNotes(roof?.notes ?? '')
  }, [roof])

  const allPhotosUploaded = PHOTO_SLOTS.every(
    (s) => (roof?.[s.photoIdField] as string | null) !== null,
  )
  const isDisabled = loading || !allPhotosUploaded
  const anyDamage = Boolean(roof?.has_ridge_damage || roof?.has_valley_damage || roof?.has_flashing_damage)

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: C.slate, letterSpacing: '0.09em',
    textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  }
  const sectionDot: React.CSSProperties = {
    width: 6, height: 6, borderRadius: '50%', backgroundColor: C.teal, flexShrink: 0,
  }
  const pillBtn = (isActive: boolean): React.CSSProperties => ({
    flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 20,
    border: isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
    backgroundColor: isActive ? C.teal : C.white,
    color: isActive ? C.white : C.navyMid,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none',
    WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
    transition: 'all 0.15s ease', whiteSpace: 'nowrap' as const,
  })
  const damageToggle = (isActive: boolean | null): React.CSSProperties => ({
    flex: 1, height: 40, borderRadius: 8,
    border: isActive === null ? `1.5px solid ${C.border}` : isActive ? `2px solid ${C.teal}` : `2px solid ${C.border}`,
    backgroundColor: isActive === null ? C.white : isActive ? C.teal : C.white,
    color: isActive ? C.white : C.navyMid,
    fontSize: 13, fontWeight: 800, cursor: 'pointer', outline: 'none',
    WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  })
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 10,
    border: `1.5px solid ${C.border}`, backgroundColor: C.white,
    padding: '0 12px', fontSize: 15, fontWeight: 500, color: C.navy, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', WebkitAppearance: 'none', MozAppearance: 'textfield',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: '0.06em',
    textTransform: 'uppercase', display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: '"DM Sans","Inter",system-ui,-apple-system,sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px 0' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`, padding: '20px 20px 28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(13,148,136,0.15)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, left: '30%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(249,115,22,0.10)', pointerEvents: 'none' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(13,148,136,0.2)', border: '1px solid rgba(13,148,136,0.4)', borderRadius: 20, padding: '3px 10px', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 3 of 5</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.white, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Roof</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 5, fontWeight: 400 }}>Document all four roof sections</p>
        </div>

        {/* 2×2 Photo Grid */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Required Photos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {PHOTO_SLOTS.map((slot) => (
              <NamedPhotoSlot
                key={slot.key}
                slotKey={slot.key}
                label={slot.label}
                token={token}
                photoId={(roof?.[slot.photoIdField] as string | null) ?? null}
                photoUrl={(roof?.[slot.photoUrlField] as string | null) ?? null}
                onSaveRoof={onSaveRoof}
                photoIdField={slot.photoIdField}
              />
            ))}
          </div>
        </div>

        {/* Roof Details */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Roof Details</div>

          {/* Pitch */}
          <label style={labelStyle}>Pitch</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {PITCH_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.pitch === opt.value)} onClick={() => void onSaveRoof({ pitch: opt.value })} aria-pressed={roof?.pitch === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Shingle type */}
          <label style={labelStyle}>Shingle Type</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {SHINGLE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.shingle_type === opt.value)} onClick={() => void onSaveRoof({ shingle_type: opt.value })} aria-pressed={roof?.shingle_type === opt.value}>{opt.label}</button>
            ))}
          </div>

          {/* Layers + Squares */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="roof-layers">Layers</label>
              <input id="roof-layers" type="number" inputMode="numeric" min={1} max={5} value={localLayers}
                onChange={(e) => setLocalLayers(e.target.value)}
                onBlur={() => { const v = parseInt(localLayers, 10); void onSaveRoof({ layers: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="1" />
            </div>
            <div>
              <label style={labelStyle} htmlFor="roof-squares">Squares (approx.)</label>
              <input id="roof-squares" type="number" inputMode="numeric" min={0} value={localSquares}
                onChange={(e) => setLocalSquares(e.target.value)}
                onBlur={() => { const v = parseFloat(localSquares); void onSaveRoof({ squares: isNaN(v) ? null : v }) }}
                style={inputStyle} placeholder="24" />
            </div>
          </div>
        </div>

        {/* Damage */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Damage</div>

          {/* Three damage flag rows */}
          {(
            [
              { label: 'Ridge damage', field: 'has_ridge_damage' as const, value: roof?.has_ridge_damage },
              { label: 'Valley damage', field: 'has_valley_damage' as const, value: roof?.has_valley_damage },
              { label: 'Flashing damage', field: 'has_flashing_damage' as const, value: roof?.has_flashing_damage },
            ] as Array<{ label: string; field: 'has_ridge_damage' | 'has_valley_damage' | 'has_flashing_damage'; value: boolean | undefined }>
          ).map(({ label, field, value }) => {
            const current: boolean | null = value === undefined ? null : value
            return (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.navyMid }}>{label}</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button type="button" style={damageToggle(current === true)} onClick={() => void onSaveRoof({ [field]: true })} aria-pressed={current === true}>YES</button>
                  <button type="button" style={damageToggle(current === false && roof !== null ? false : null)} onClick={() => void onSaveRoof({ [field]: false })} aria-pressed={current === false && roof !== null}>NO</button>
                </div>
              </div>
            )
          })}

          {/* Decking condition */}
          <label style={{ ...labelStyle, marginTop: 8 }}>Decking Condition</label>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {DECKING_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" style={pillBtn(roof?.decking_condition === opt.value)} onClick={() => void onSaveRoof({ decking_condition: opt.value })} aria-pressed={roof?.decking_condition === opt.value}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Damage Photos — conditional */}
        {anyDamage && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={sectionLabel}><span style={sectionDot} />Damage Photos</div>
            <DamagePhotoGallery token={token} spots={damageSpots} onAdd={onAddDamageSpot} onDelete={onDeleteDamageSpot} />
          </div>
        )}

        {/* Notes */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={sectionLabel}><span style={sectionDot} />Notes</div>
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => void onSaveRoof({ notes: localNotes.trim() || null })}
            rows={3}
            placeholder="Additional observations..."
            style={{ width: '100%', borderRadius: 10, border: `1.5px solid ${C.border}`, backgroundColor: C.white, padding: '10px 12px', fontSize: 14, fontWeight: 400, color: C.navy, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: '16px 16px 0', backgroundColor: C.errorBg, border: `1px solid ${C.errorBorder}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.errorText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 13, color: C.errorText, fontWeight: 500, lineHeight: 1.4, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ padding: '20px 16px 0' }}>
          <button type="button" onClick={onBack}
            style={{ background: 'none', border: 'none', padding: '0 0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: C.slate, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
            aria-label="Go back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
            Back
          </button>

          <button type="button" onClick={onContinue} disabled={isDisabled} aria-disabled={isDisabled}
            style={{ width: '100%', height: 54, borderRadius: 14, border: 'none', backgroundColor: isDisabled ? '#FED7AA' : C.orange, color: isDisabled ? '#FDBA74' : C.white, fontSize: 16, fontWeight: 800, cursor: isDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: isDisabled ? 'none' : '0 4px 14px rgba(249,115,22,0.35)', letterSpacing: '0.01em', fontFamily: 'inherit', outline: 'none', WebkitTapHighlightColor: 'transparent', transition: 'background-color 0.15s ease' }}>
            {loading ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                Continue
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>

          {!allPhotosUploaded && (
            <p style={{ textAlign: 'center', fontSize: 12, color: C.slate, marginTop: 10, fontWeight: 500 }}>
              Upload all 4 photos to continue
            </p>
          )}
        </div>

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
```

**Step 2: Verify tsc**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/steps/RoofStep.tsx
git commit -m "feat: add RoofStep UI component with 2x2 photo grid and damage fields"
```

---

### Task 9: Wire RoofStep into ContractorWizardV2

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`

**Step 1: Add import**

```typescript
import RoofStep from './steps/RoofStep'
```

**Step 2: Update ElevationsStep wiring to use computeNextStep/computePrevStep**

Replace the current hardcoded `onContinue={() => state.setCurrentStep(3)}` and `onBack={() => state.setCurrentStep(1)}` in the ElevationsStep block with:

```tsx
onContinue={() => state.setCurrentStep(state.computeNextStep(2))}
onBack={() => state.setCurrentStep(state.computePrevStep(2))}
```

**Step 3: Replace the step > 2 placeholder with RoofStep + updated guard**

Replace:
```tsx
{state.currentStep > 2 && (
  <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
    <p style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>Step {state.currentStep}</p>
    <p style={{ marginTop: 8 }}>Coming in the next slice...</p>
  </div>
)}
```

With:
```tsx
{state.currentStep === 3 && (
  <RoofStep
    token={state.token}
    roof={state.roof}
    damageSpots={state.roofDamageSpots}
    onSaveRoof={state.saveRoof}
    onAddDamageSpot={state.addDamageSpot}
    onDeleteDamageSpot={state.deleteDamageSpot}
    onContinue={() => state.setCurrentStep(state.computeNextStep(3))}
    onBack={() => state.setCurrentStep(state.computePrevStep(3))}
    loading={state.roofLoading}
    error={state.error}
  />
)}

{state.currentStep > 3 && (
  <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>
    <p style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>Step {state.currentStep}</p>
    <p style={{ marginTop: 8 }}>Coming in the next slice...</p>
  </div>
)}
```

**Step 4: Verify tsc and vite build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```
Expected: zero errors, production bundle builds cleanly.

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx
git commit -m "feat: wire RoofStep into ContractorWizardV2, use computeNextStep/Prev for routing"
```

---

## Done

All 9 tasks complete. Backend: `go build ./...` and all tests pass. Frontend: `tsc && vite build` clean.

Smoke test checklist:
1. Complete Quick Setup with **roof selected** → should reach Step 3 (Roof)
2. Complete Quick Setup with **only exterior selected** → should reach Step 2 (Elevations) then Step 3 is skipped → Step 5 placeholder
3. On Roof step: upload Overview → slot shows thumbnail + green border ✓
4. Upload all 4 photos → Continue button activates (orange)
5. Toggle "Ridge damage" YES → Damage Photos section appears
6. Add a damage photo → thumbnail appears in gallery; tap × → photo removed
7. Back button returns to Elevations (or Step 1 if exterior was not selected)
