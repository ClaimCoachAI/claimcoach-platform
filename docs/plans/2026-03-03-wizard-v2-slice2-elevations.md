# Wizard V2 Slice 2 — Elevations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Elevations step (Slice 2) to the Contractor Wizard V2 — per-side photo uploads and damage data for the four property elevations (front/right/back/left).

**Architecture:** New `inspection_elevation` DB table + two Go endpoints (GET all / PUT one side) wired into the existing `InspectionHandler`/`InspectionService` pattern from Slice 1. Photo uploads reuse the existing `/api/magic-links/:token/documents/upload-url` + confirm endpoints — no new upload infrastructure needed. Frontend renders a tabbed UI with photo upload area + conditional damage fields per side, driven by `useWizardV2State`.

**Tech Stack:** Go 1.21, Gin, database/sql + lib/pq, PostgreSQL; React 18 + TypeScript, Vite, Axios.

---

## Project Context

This is Slice 2 of a 5-slice vertical implementation. Slice 1 (Quick Setup) is complete and smoke-tested. Key files already exist:

- `backend/internal/models/inspection.go` — `InspectionV2`, `InspectionAreaSelection` structs
- `backend/internal/services/inspection_service.go` — `InspectionService` with `GetByToken`, `SaveSetup`
- `backend/internal/handlers/inspection_handler.go` — `InspectionHandler`, `inspectionServiceInterface`
- `backend/internal/handlers/inspection_handler_test.go` — 3 passing tests with `mockInspectionService`
- `backend/internal/api/router.go` — two routes already wired for Slice 1
- `backend/internal/database/migrations/000017_add_inspection_v2.up.sql`
- `frontend/src/components/contractor-wizard-v2/types.ts`
- `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`
- `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`

**Go module path:** `github.com/claimcoach/backend`

**Run Go tests (inspection handler only):**
```bash
cd backend && go test ./internal/handlers/ -run TestInspectionHandler -v
```
*(Do NOT run `./internal/handlers/...` — pre-existing broken tests in other handler test files will fail. Always filter by `-run TestInspectionHandler`.)*

**Build check:**
```bash
cd backend && go build ./...
```

---

## Backend Tasks (Tasks 1–5)

---

### Task 1: Migration 000018 — inspection_elevation table

**Files:**
- Create: `backend/internal/database/migrations/000018_add_inspection_elevation.up.sql`
- Create: `backend/internal/database/migrations/000018_add_inspection_elevation.down.sql`

No test needed — migrations are verified by build + subsequent service tests.

**Step 1: Create the up migration**

```sql
-- backend/internal/database/migrations/000018_add_inspection_elevation.up.sql
CREATE TABLE inspection_elevation (
    id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id     UUID    NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,
    side              TEXT    NOT NULL CHECK (side IN ('front','right','back','left')),
    photo_document_id UUID    REFERENCES documents(id),
    has_damage        BOOLEAN NOT NULL DEFAULT false,
    siding_type       TEXT    CHECK (siding_type IN ('vinyl','wood','fiber_cement','brick','stucco','other')),
    siding_replace_sf NUMERIC(8,2),
    siding_paint_sf   NUMERIC(8,2),
    gutter_lf         NUMERIC(8,2),
    windows_count     INT,
    doors_count       INT,
    notes             TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (inspection_id, side)
);

CREATE INDEX idx_inspection_elevation_inspection ON inspection_elevation(inspection_id);
```

**Step 2: Create the down migration**

```sql
-- backend/internal/database/migrations/000018_add_inspection_elevation.down.sql
DROP TABLE IF EXISTS inspection_elevation;
```

**Step 3: Commit**

```bash
git add backend/internal/database/migrations/000018_add_inspection_elevation.up.sql \
        backend/internal/database/migrations/000018_add_inspection_elevation.down.sql
git commit -m "feat: add migration 000018 for inspection_elevation table"
```

---

### Task 2: Go Model — InspectionElevation

**Files:**
- Modify: `backend/internal/models/inspection.go` (append after existing structs)

**Step 1: Append to `backend/internal/models/inspection.go`**

Add this code at the end of the file (after `InspectionAreaSelection`):

```go
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
```

**Step 2: Build to verify no errors**

```bash
cd backend && go build ./internal/models/...
```

Expected: no output (success).

**Step 3: Commit**

```bash
git add backend/internal/models/inspection.go
git commit -m "feat: add InspectionElevation model and ElevationSide helpers"
```

---

### Task 3: Go Service — GetElevations and SaveElevation

**Files:**
- Modify: `backend/internal/services/inspection_service.go` (append two new methods + two input types)

**Step 1: Append to `backend/internal/services/inspection_service.go`**

Add after the existing `SaveSetup` method:

```go
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
		return nil, fmt.Errorf("inspection not found for this magic link")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to look up inspection: %w", err)
	}

	now := time.Now()
	newID := uuid.New().String()

	var e models.InspectionElevation
	err = s.db.QueryRow(`
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
		RETURNING id, inspection_id, side,
		          photo_document_id, has_damage, siding_type,
		          siding_replace_sf, siding_paint_sf, gutter_lf,
		          windows_count, doors_count, notes,
		          created_at, updated_at
	`,
		newID, inspectionID, side,
		input.PhotoDocumentID, input.HasDamage, input.SidingType,
		input.SidingReplaceSF, input.SidingPaintSF, input.GutterLF,
		input.WindowsCount, input.DoorsCount, input.Notes,
		now,
	).Scan(
		&e.ID, &e.InspectionID, &e.Side,
		&e.PhotoDocumentID, &e.HasDamage, &e.SidingType,
		&e.SidingReplaceSF, &e.SidingPaintSF, &e.GutterLF,
		&e.WindowsCount, &e.DoorsCount, &e.Notes,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert elevation: %w", err)
	}

	// Advance to step 3 once all 4 sides have a confirmed photo.
	var sidesWithPhoto int
	if countErr := s.db.QueryRow(`
		SELECT COUNT(*) FROM inspection_elevation
		WHERE inspection_id = $1 AND photo_document_id IS NOT NULL
	`, inspectionID).Scan(&sidesWithPhoto); countErr == nil && sidesWithPhoto == 4 {
		_, _ = s.db.Exec(
			`UPDATE inspection_v2 SET current_step = 3, updated_at = $1
			 WHERE id = $2 AND current_step < 3`,
			now, inspectionID,
		)
	}

	return &e, nil
}
```

**Step 2: Build to verify no errors**

```bash
cd backend && go build ./internal/services/...
```

Expected: no output (success).

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: add GetElevations and SaveElevation to InspectionService"
```

---

### Task 4: Go Handler + Tests

**Files:**
- Modify: `backend/internal/handlers/inspection_handler.go`
- Modify: `backend/internal/handlers/inspection_handler_test.go`

#### Part A — Update the handler file

**Step 1: Add type aliases near the top of `inspection_handler.go` (after existing aliases, before the interface)**

The current type alias block is lines 13–15:
```go
// type aliases so the mock in tests and the real service share identical types.
type getSetupResponse = services.GetSetupResponse
type saveSetupInput = services.SaveSetupInput
type inspectionV2Response = models.InspectionV2
```

Replace that block with:
```go
// type aliases so the mock in tests and the real service share identical types.
type getSetupResponse        = services.GetSetupResponse
type saveSetupInput          = services.SaveSetupInput
type inspectionV2Response    = models.InspectionV2
type saveElevationInput      = services.SaveElevationInput
type inspectionElevResponse  = models.InspectionElevation
```

**Step 2: Replace the interface definition (lines 18–22) with the extended version**

Old:
```go
// inspectionServiceInterface is the narrow interface used by InspectionHandler.
// It is satisfied by *services.InspectionService and by mockInspectionService in tests.
type inspectionServiceInterface interface {
	GetByToken(token string) (*getSetupResponse, error)
	SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error)
}
```

New:
```go
// inspectionServiceInterface is the narrow interface used by InspectionHandler.
// It is satisfied by *services.InspectionService and by mockInspectionService in tests.
type inspectionServiceInterface interface {
	GetByToken(token string) (*getSetupResponse, error)
	SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error)
	GetElevations(token string) ([]inspectionElevResponse, error)
	SaveElevation(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
}
```

**Step 3: Append two handler methods at the end of `inspection_handler.go`**

```go
// GetElevations handles GET /api/magic-links/:token/v2/inspection/elevations.
// Returns all saved elevation rows for this inspection (empty array when none yet).
func (h *InspectionHandler) GetElevations(c *gin.Context) {
	token := c.Param("token")

	elevations, err := h.service.GetElevations(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to load elevations: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    elevations,
	})
}

// SaveElevation handles PUT /api/magic-links/:token/v2/inspection/elevations/:side.
// :side must be one of front, right, back, left — returns 400 otherwise.
func (h *InspectionHandler) SaveElevation(c *gin.Context) {
	token := c.Param("token")
	side := c.Param("side")

	if !models.IsValidElevationSide(side) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid elevation side: must be front, right, back, or left",
		})
		return
	}

	var input saveElevationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	elevation, err := h.service.SaveElevation(token, side, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired magic link",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to save elevation: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    elevation,
	})
}
```

**Note:** You also need to add `"github.com/claimcoach/backend/internal/models"` to the import block in `inspection_handler.go` since `models.IsValidElevationSide` is now used directly. The existing imports are `"net/http"`, `"strings"`, `"github.com/claimcoach/backend/internal/models"`, `"github.com/claimcoach/backend/internal/services"`, `"github.com/gin-gonic/gin"`. Check if `models` is already imported — if so, no change needed. It is NOT currently imported (only `services` and `models` are used via type aliases). Add it:

```go
import (
	"net/http"
	"strings"

	"github.com/claimcoach/backend/internal/models"
	"github.com/claimcoach/backend/internal/services"
	"github.com/gin-gonic/gin"
)
```

#### Part B — Update the test file

**Step 4: Update `mockInspectionService` in `inspection_handler_test.go`**

The existing struct (lines 14–17) needs two new function fields. Replace the entire `mockInspectionService` struct + its method implementations:

```go
type mockInspectionService struct {
	getByTokenFn    func(token string) (*getSetupResponse, error)
	saveSetupFn     func(token string, input saveSetupInput) (*inspectionV2Response, error)
	getElevationsFn func(token string) ([]inspectionElevResponse, error)
	saveElevationFn func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error)
}

func (m *mockInspectionService) GetByToken(token string) (*getSetupResponse, error) {
	return m.getByTokenFn(token)
}

func (m *mockInspectionService) SaveSetup(token string, input saveSetupInput) (*inspectionV2Response, error) {
	return m.saveSetupFn(token, input)
}

func (m *mockInspectionService) GetElevations(token string) ([]inspectionElevResponse, error) {
	return m.getElevationsFn(token)
}

func (m *mockInspectionService) SaveElevation(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
	return m.saveElevationFn(token, side, input)
}
```

**Step 5: Write 4 failing tests** — append these to `inspection_handler_test.go`:

```go
func TestInspectionHandler_GetElevations_ReturnsEmptySlice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getElevationsFn: func(token string) ([]inspectionElevResponse, error) {
			return []inspectionElevResponse{}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/elevations", handler.GetElevations)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/elevations", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].([]interface{})
	assert.Len(t, data, 0)
}

func TestInspectionHandler_SaveElevation_ReturnsBadRequestForInvalidSide(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewInspectionHandler(&mockInspectionService{})
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/elevations/diagonal", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Contains(t, resp["error"], "Invalid elevation side")
}

func TestInspectionHandler_SaveElevation_Returns201WhenValid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	sideVal := "front"
	mock := &mockInspectionService{
		saveElevationFn: func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
			return &inspectionElevResponse{
				ID:        "elev-uuid-123",
				Side:      models.ElevationSide(side),
				HasDamage: false,
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/elevations/"+sideVal, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "elev-uuid-123", data["id"])
	assert.Equal(t, "front", data["side"])
}

func TestInspectionHandler_SaveElevation_Returns401ForInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		saveElevationFn: func(token string, side string, input saveElevationInput) (*inspectionElevResponse, error) {
			return nil, fmt.Errorf("invalid or expired token: token has expired")
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", handler.SaveElevation)
	payload := map[string]interface{}{"has_damage": false}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/expired-token/v2/inspection/elevations/front", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
```

**Note:** The test file needs `"fmt"` added to its imports. The existing imports are `"bytes"`, `"encoding/json"`, `"net/http"`, `"net/http/httptest"`, `"testing"`, `"github.com/gin-gonic/gin"`, `"github.com/stretchr/testify/assert"`. Add `"fmt"` and `"github.com/claimcoach/backend/internal/models"` to the import block.

**Step 6: Run tests to verify they pass**

```bash
cd backend && go test ./internal/handlers/ -run TestInspectionHandler -v
```

Expected output — all 7 tests PASS:
```
--- PASS: TestInspectionHandler_GetSetup_ReturnsAddressWhenNoDraft
--- PASS: TestInspectionHandler_SaveSetup_ReturnsBadRequestWhenNoAreaSelected
--- PASS: TestInspectionHandler_SaveSetup_Returns201WhenValid
--- PASS: TestInspectionHandler_GetElevations_ReturnsEmptySlice
--- PASS: TestInspectionHandler_SaveElevation_ReturnsBadRequestForInvalidSide
--- PASS: TestInspectionHandler_SaveElevation_Returns201WhenValid
--- PASS: TestInspectionHandler_SaveElevation_Returns401ForInvalidToken
PASS
```

**Step 7: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go \
        backend/internal/handlers/inspection_handler_test.go
git commit -m "feat: add GetElevations and SaveElevation handler with 4 tests"
```

---

### Task 5: Router — wire elevation routes

**Files:**
- Modify: `backend/internal/api/router.go`

**Step 1: Add two new routes**

In `router.go`, find the Inspection V2 routes block (currently lines 124–127):
```go
	// Inspection V2 routes (public - no auth required)
	r.GET("/api/magic-links/:token/v2/inspection", inspectionHandler.GetSetup)
	r.POST("/api/magic-links/:token/v2/inspection", inspectionHandler.SaveSetup)
```

Append two lines to make it:
```go
	// Inspection V2 routes (public - no auth required)
	r.GET("/api/magic-links/:token/v2/inspection", inspectionHandler.GetSetup)
	r.POST("/api/magic-links/:token/v2/inspection", inspectionHandler.SaveSetup)
	r.GET("/api/magic-links/:token/v2/inspection/elevations", inspectionHandler.GetElevations)
	r.PUT("/api/magic-links/:token/v2/inspection/elevations/:side", inspectionHandler.SaveElevation)
```

**Step 2: Build entire backend to verify clean compile**

```bash
cd backend && go build ./...
```

Expected: no output (success).

**Step 3: Run all inspection handler tests one final time**

```bash
cd backend && go test ./internal/handlers/ -run TestInspectionHandler -v
```

Expected: 7/7 PASS.

**Step 4: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: wire elevation GET/PUT routes for inspection v2 slice 2"
```

---

## Frontend Tasks (Tasks 6–10)

> **Note:** The user asked to stop after backend Tasks 1–5. Execute Tasks 6–10 in a separate session after backend is confirmed clean.

---

### Task 6: TypeScript Types — ElevationData

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/types.ts`

Add after existing types:

```typescript
export type ElevationSide = 'front' | 'right' | 'back' | 'left'
export type SidingType = 'vinyl' | 'wood' | 'fiber_cement' | 'brick' | 'stucco' | 'other'

export interface ElevationData {
  id?: string
  side: ElevationSide
  photo_document_id: string | null
  photo_url: string | null
  has_damage: boolean
  siding_type: SidingType | null
  siding_replace_sf: number | null
  siding_paint_sf: number | null
  gutter_lf: number | null
  windows_count: number | null
  doors_count: number | null
  notes: string | null
}
```

Commit: `"feat: add ElevationData types for wizard v2 slice 2"`

---

### Task 7: State Hook — elevation state + API calls

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Additions:**

1. Import `ElevationData` and `ElevationSide` from `./types`
2. Add to `WizardV2State` interface:
   ```typescript
   elevations: ElevationData[]
   elevationLoading: boolean
   saveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
   ```
3. Inside the hook, add:
   ```typescript
   const [elevations, setElevations] = useState<ElevationData[]>([])
   const [elevationLoading, setElevationLoading] = useState(false)
   ```
4. Add `loadElevations` function (called when `currentStep` transitions to 2):
   ```typescript
   const loadElevations = useCallback(async () => {
     try {
       const res = await axios.get(`/api/magic-links/${token}/v2/inspection/elevations`)
       setElevations(res.data.data)
     } catch {
       // non-fatal: elevations just stay empty
     }
   }, [token])
   ```
5. Add a `useEffect` that calls `loadElevations()` when `currentStep === 2`.
6. Add `saveElevation`:
   ```typescript
   const saveElevation = useCallback(async (side: ElevationSide, data: Partial<ElevationData>) => {
     setElevationLoading(true)
     try {
       const res = await axios.put(
         `/api/magic-links/${token}/v2/inspection/elevations/${side}`,
         data,
       )
       setElevations(prev => {
         const idx = prev.findIndex(e => e.side === side)
         if (idx >= 0) {
           const updated = [...prev]
           updated[idx] = res.data.data
           return updated
         }
         return [...prev, res.data.data]
       })
     } finally {
       setElevationLoading(false)
     }
   }, [token])
   ```
7. Return `elevations`, `elevationLoading`, `saveElevation` from the hook.

Commit: `"feat: add elevation state and API calls to useWizardV2State"`

---

### Task 8: Photo Upload Hook — usePhotoUpload

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/usePhotoUpload.ts`

This hook handles the 3-step upload flow (request URL → PUT to storage → confirm):

```typescript
import { useState, useCallback } from 'react'
import axios from 'axios'

export interface PhotoUploadResult {
  documentId: string
  fileUrl: string | null
}

export function usePhotoUpload(token: string) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadPhoto = useCallback(async (file: File): Promise<PhotoUploadResult | null> => {
    setUploading(true)
    setUploadError(null)
    try {
      // Step 1: Request presigned upload URL
      const urlRes = await axios.post(`/api/magic-links/${token}/documents/upload-url`, {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        document_type: 'contractor_photo',
      })
      const { upload_url, document_id } = urlRes.data.data

      // Step 2: PUT file directly to storage
      await axios.put(upload_url, file, {
        headers: { 'Content-Type': file.type },
      })

      // Step 3: Confirm the upload
      await axios.post(`/api/magic-links/${token}/documents/${document_id}/confirm`)

      return { documentId: document_id, fileUrl: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setUploadError(msg)
      return null
    } finally {
      setUploading(false)
    }
  }, [token])

  return { uploadPhoto, uploading, uploadError }
}
```

Commit: `"feat: add usePhotoUpload hook for contractor photo uploads"`

---

### Task 9: ElevationsStep UI Component

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/steps/ElevationsStep.tsx`

This is the most complex task. Use the `frontend-design` skill to generate a polished mobile-first component.

**Component contract:**

```typescript
interface ElevationsStepProps {
  token: string
  elevations: ElevationData[]
  onSaveElevation: (side: ElevationSide, data: Partial<ElevationData>) => Promise<void>
  onContinue: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}
```

**UI requirements:**
- Tab strip at top: FRONT | RIGHT | BACK | LEFT (teal underline on active tab)
- Per tab:
  - Photo upload zone: tap/click triggers file input, shows thumbnail after upload, shows upload progress
  - "Was there damage on this side?" — YES / NO pill toggle (default NO)
  - When YES: reveal siding type dropdown, siding replace SF, siding paint SF, gutter LF, windows count, doors count, notes textarea
- Progress dots row: "✓ Front ○ Right ○ Back ○ Left" — checkmark when side has photo
- "Continue →" CTA (orange): enabled only when all 4 tabs have a confirmed photo_document_id
- "← Back" link (gray text)
- Auto-save on blur for damage fields (no debounce needed for MVP)

**Style:** Match existing `QuickSetupStep.tsx` — navy gradient header, white card body, teal accents, orange CTA, same padding/font sizes.

Commit: `"feat: add ElevationsStep component for wizard v2 slice 2"`

---

### Task 10: Wire ElevationsStep into ContractorWizardV2

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`

1. Import `ElevationsStep` from `./steps/ElevationsStep`
2. Replace the `currentStep === 2` "coming soon" placeholder with:
   ```tsx
   {currentStep === 2 && (
     <ElevationsStep
       token={token}
       elevations={elevations}
       onSaveElevation={saveElevation}
       onContinue={() => setCurrentStep(3)}
       onBack={() => setCurrentStep(1)}
       loading={elevationLoading}
       error={error}
     />
   )}
   ```
3. Build check: `cd frontend && npm run build` — expect 0 errors.

**Manual smoke test:**
1. Visit `/contractor/v2/:token` and complete Step 1 (Quick Setup)
2. Wizard advances to Step 2 — Elevations tab appears
3. On "FRONT" tab, tap the photo upload zone — file picker opens
4. Select a JPEG — thumbnail appears, loading spinner while uploading
5. Toggle "Was there damage?" to YES — damage fields slide in
6. Enter siding SF, gutter LF
7. Switch to RIGHT tab — damage fields are reset (new side)
8. Complete all 4 sides with photos
9. "Continue →" becomes active — tap it
10. Wizard advances to Step 3 ("coming soon" placeholder)
11. Check DB: 4 rows in `inspection_elevation`, all with `photo_document_id` set

Commit: `"feat: wire ElevationsStep into ContractorWizardV2 shell"`
