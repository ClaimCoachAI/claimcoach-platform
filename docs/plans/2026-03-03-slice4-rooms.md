# Slice 4 (Rooms / Interior) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-room interior inspection step where contractors create/edit rooms with name, dimensions, damaged-materials pills, and damage photos.

**Architecture:** Same 5-layer stack as previous slices: DB migration → Go models → Go service → Go handler+tests → router, then TypeScript types → state hook → React component → wire-up. Rooms are 1-to-many on `inspection_v2`; photos are 1-to-many on `inspection_room`. `damaged_materials` is stored as JSONB so it stays flexible and marshals to `[]string` in Go via a custom `JSONStringSlice` type.

**Tech Stack:** Go 1.21 + Gin + `database/sql` + lib/pq, React 18 + TypeScript (inline styles only), existing `useWizardV2State` pattern with `Map<roomId, timer>` debouncing.

---

## Context for implementers

- Repo root: `/Users/benjaminlopez/Documents/ClaimCoachAI Code`
- Backend: `backend/`  Go module `github.com/claimcoach/backend`
- Frontend: `frontend/src/components/contractor-wizard-v2/`
- Previous migration: `000019_add_inspection_roof.up.sql`
- Build check: `cd backend && go build ./...`
- Frontend build check: `cd frontend && npx tsc --noEmit && npx vite build`
- All styles as `React.CSSProperties` — no CSS modules, no Tailwind
- The `inspectionServiceInterface` in `handlers/inspection_handler.go` must be extended for every new service method
- The `mockInspectionService` in `handlers/inspection_handler_test.go` must have a `Fn` field + method implementation for every interface method

---

### Task 1: Migration 000020 — inspection_room + inspection_room_photo tables

**Files:**
- Create: `backend/internal/database/migrations/000020_add_inspection_rooms.up.sql`
- Create: `backend/internal/database/migrations/000020_add_inspection_rooms.down.sql`

**Step 1: Create the up migration**

```sql
-- 000020_add_inspection_rooms.up.sql

CREATE TABLE inspection_room (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id     UUID        NOT NULL REFERENCES inspection_v2(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL DEFAULT 'Room',
    length_ft         NUMERIC(6,1),
    width_ft          NUMERIC(6,1),
    height_ft         NUMERIC(6,1),
    damaged_materials JSONB       NOT NULL DEFAULT '[]'::jsonb,
    notes             TEXT,
    sort_order        INT         NOT NULL DEFAULT 0,
    created_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_room_inspection ON inspection_room(inspection_id);

CREATE TABLE inspection_room_photo (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     UUID        NOT NULL REFERENCES inspection_room(id) ON DELETE CASCADE,
    photo_id    UUID        REFERENCES documents(id),
    photo_url   TEXT,
    caption     TEXT,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_room_photo_room ON inspection_room_photo(room_id);
```

**Step 2: Create the down migration**

```sql
-- 000020_add_inspection_rooms.down.sql

DROP TABLE IF EXISTS inspection_room_photo;
DROP TABLE IF EXISTS inspection_room;
```

**Step 3: Verify files exist**

```bash
ls backend/internal/database/migrations/000020*
```
Expected: two files listed.

**Step 4: Commit**

```bash
git add backend/internal/database/migrations/000020_add_inspection_rooms.up.sql \
        backend/internal/database/migrations/000020_add_inspection_rooms.down.sql
git commit -m "feat: migration 000020 — inspection_room + inspection_room_photo"
```

---

### Task 2: Go Models — JSONStringSlice + InspectionRoom + InspectionRoomPhoto

**Files:**
- Modify: `backend/internal/models/inspection.go`

**Background:** `inspection.go` already imports `"time"`. Append three things: (1) a `JSONStringSlice` type with `driver.Valuer` / `sql.Scanner` so JSONB round-trips cleanly through `database/sql`; (2) `InspectionRoom`; (3) `InspectionRoomPhoto`. No existing code is touched.

**Step 1: Add three new imports at the top of the file**

Current import block at line 3:
```go
import "time"
```

Replace it with:
```go
import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)
```

**Step 2: Append the new types to the end of `inspection.go`**

```go
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
	ID               string         `json:"id" db:"id"`
	InspectionID     string         `json:"inspection_id" db:"inspection_id"`
	Name             string         `json:"name" db:"name"`
	LengthFt         *float64       `json:"length_ft" db:"length_ft"`
	WidthFt          *float64       `json:"width_ft" db:"width_ft"`
	HeightFt         *float64       `json:"height_ft" db:"height_ft"`
	DamagedMaterials JSONStringSlice `json:"damaged_materials" db:"damaged_materials"`
	Notes            *string        `json:"notes" db:"notes"`
	SortOrder        int            `json:"sort_order" db:"sort_order"`
	CreatedAt        time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at" db:"updated_at"`
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
```

**Step 3: Build check**

```bash
cd backend && go build ./...
```
Expected: no output (clean build).

**Step 4: Commit**

```bash
git add backend/internal/models/inspection.go
git commit -m "feat: Go models — InspectionRoom, InspectionRoomPhoto, JSONStringSlice"
```

---

### Task 3: Go Service — 6 methods for rooms

**Files:**
- Modify: `backend/internal/services/inspection_service.go`

**Background:** The file currently ends at line 759. Append everything below after the last line. The existing `validateToken` + `inspectionID lookup` pattern is used by every method. Read the existing `DeleteDamageSpot` method to understand the `RowsAffected → sql.ErrNoRows` pattern for deletions.

**Step 1: Append input types and 6 methods to `inspection_service.go`**

```go
// ── Rooms ─────────────────────────────────────────────────────────────────────

// CreateRoomInput is the request body for POST /inspection/rooms.
type CreateRoomInput struct {
	Name             string                  `json:"name"`
	LengthFt         *float64                `json:"length_ft"`
	WidthFt          *float64                `json:"width_ft"`
	HeightFt         *float64                `json:"height_ft"`
	DamagedMaterials models.JSONStringSlice  `json:"damaged_materials"`
	Notes            *string                 `json:"notes"`
}

// UpdateRoomInput is the request body for PUT /inspection/rooms/:roomId.
type UpdateRoomInput struct {
	Name             string                  `json:"name"`
	LengthFt         *float64                `json:"length_ft"`
	WidthFt          *float64                `json:"width_ft"`
	HeightFt         *float64                `json:"height_ft"`
	DamagedMaterials models.JSONStringSlice  `json:"damaged_materials"`
	Notes            *string                 `json:"notes"`
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
		return nil, err
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
	return &r, photoRows.Err()
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
```

**Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 3: Commit**

```bash
git add backend/internal/services/inspection_service.go
git commit -m "feat: service methods — GetRooms, CreateRoom, UpdateRoom, DeleteRoom, AddRoomPhoto, DeleteRoomPhoto"
```

---

### Task 4: Go Handler + Tests

**Files:**
- Modify: `backend/internal/handlers/inspection_handler.go`
- Modify: `backend/internal/handlers/inspection_handler_test.go`

**Background:** Read the existing handler file carefully. The pattern is:
1. Add type aliases at the top (lines 14-24)
2. Extend `inspectionServiceInterface` (lines 28-37)
3. Add handler methods after `DeleteDamageSpot`

For tests: add `Fn` fields to `mockInspectionService`, method implementations, and 6 new test functions.

**Step 1: Add 6 type aliases to `inspection_handler.go`**

After the existing alias block (after line 24), add:
```go
type getRoomsResponse    = []models.InspectionRoom
type createRoomInput     = services.CreateRoomInput
type updateRoomInput     = services.UpdateRoomInput
type addRoomPhotoInput   = services.AddRoomPhotoInput
type roomResponse        = models.InspectionRoom
type roomPhotoResponse   = models.InspectionRoomPhoto
```

**Step 2: Extend `inspectionServiceInterface` with 6 new methods**

Add after `DeleteDamageSpot`:
```go
GetRooms(token string) ([]roomResponse, error)
CreateRoom(token string, input createRoomInput) (*roomResponse, error)
UpdateRoom(token string, roomID string, input updateRoomInput) (*roomResponse, error)
DeleteRoom(token string, roomID string) error
AddRoomPhoto(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error)
DeleteRoomPhoto(token string, photoID string) error
```

**Step 3: Add 6 handler methods to `inspection_handler.go`**

Append after `DeleteDamageSpot`:

```go
// GetRooms handles GET /api/magic-links/:token/v2/inspection/rooms.
// Returns 200 with all rooms and their photos (empty array when none).
func (h *InspectionHandler) GetRooms(c *gin.Context) {
	token := c.Param("token")

	rooms, err := h.service.GetRooms(token)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load rooms: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": rooms})
}

// CreateRoom handles POST /api/magic-links/:token/v2/inspection/rooms.
// Returns 201 with the new room (photos is always an empty array).
func (h *InspectionHandler) CreateRoom(c *gin.Context) {
	token := c.Param("token")

	var input createRoomInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	room, err := h.service.CreateRoom(token, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create room: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": room})
}

// UpdateRoom handles PUT /api/magic-links/:token/v2/inspection/rooms/:roomId.
// Returns 200 with the updated room (including its photos).
func (h *InspectionHandler) UpdateRoom(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	var input updateRoomInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	room, err := h.service.UpdateRoom(token, roomID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update room: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": room})
}

// DeleteRoom handles DELETE /api/magic-links/:token/v2/inspection/rooms/:roomId.
// Returns 204 on success, 404 when the room does not exist or belongs to another inspection.
func (h *InspectionHandler) DeleteRoom(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	err := h.service.DeleteRoom(token, roomID)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete room: " + err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

// AddRoomPhoto handles POST /api/magic-links/:token/v2/inspection/rooms/:roomId/photos.
// Returns 201 with the new photo row.
func (h *InspectionHandler) AddRoomPhoto(c *gin.Context) {
	token := c.Param("token")
	roomID := c.Param("roomId")

	var input addRoomPhotoInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request: " + err.Error()})
		return
	}

	photo, err := h.service.AddRoomPhoto(token, roomID, input)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add room photo: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": photo})
}

// DeleteRoomPhoto handles DELETE /api/magic-links/:token/v2/inspection/rooms/:roomId/photos/:photoId.
// Returns 204 on success, 404 when the photo does not exist or belongs to another inspection.
func (h *InspectionHandler) DeleteRoomPhoto(c *gin.Context) {
	token := c.Param("token")
	photoID := c.Param("photoId")

	err := h.service.DeleteRoomPhoto(token, photoID)
	if err != nil {
		if isTokenError(err) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Invalid or expired magic link"})
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Room photo not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete room photo: " + err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
```

**Step 4: Update `inspection_handler_test.go`**

Add 6 `Fn` fields to `mockInspectionService`:
```go
getRoomsFn       func(token string) ([]roomResponse, error)
createRoomFn     func(token string, input createRoomInput) (*roomResponse, error)
updateRoomFn     func(token string, roomID string, input updateRoomInput) (*roomResponse, error)
deleteRoomFn     func(token string, roomID string) error
addRoomPhotoFn   func(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error)
deleteRoomPhotoFn func(token string, photoID string) error
```

Add 6 method implementations to `mockInspectionService`:
```go
func (m *mockInspectionService) GetRooms(token string) ([]roomResponse, error) {
	return m.getRoomsFn(token)
}
func (m *mockInspectionService) CreateRoom(token string, input createRoomInput) (*roomResponse, error) {
	return m.createRoomFn(token, input)
}
func (m *mockInspectionService) UpdateRoom(token string, roomID string, input updateRoomInput) (*roomResponse, error) {
	return m.updateRoomFn(token, roomID, input)
}
func (m *mockInspectionService) DeleteRoom(token string, roomID string) error {
	return m.deleteRoomFn(token, roomID)
}
func (m *mockInspectionService) AddRoomPhoto(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error) {
	return m.addRoomPhotoFn(token, roomID, input)
}
func (m *mockInspectionService) DeleteRoomPhoto(token string, photoID string) error {
	return m.deleteRoomPhotoFn(token, photoID)
}
```

Add 6 new test functions at the end of the file:
```go
func TestInspectionHandler_GetRooms_ReturnsEmptySlice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		getRoomsFn: func(token string) ([]roomResponse, error) {
			return []roomResponse{}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.GET("/api/magic-links/:token/v2/inspection/rooms", handler.GetRooms)
	req, _ := http.NewRequest("GET", "/api/magic-links/test-token/v2/inspection/rooms", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	data := body["data"].([]interface{})
	assert.Len(t, data, 0)
}

func TestInspectionHandler_CreateRoom_Returns201WithRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		createRoomFn: func(token string, input createRoomInput) (*roomResponse, error) {
			return &roomResponse{
				ID:           "room-uuid-111",
				InspectionID: "insp-uuid-222",
				Name:         "Living Room",
				Photos:       []models.InspectionRoomPhoto{},
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/rooms", handler.CreateRoom)
	payload := map[string]interface{}{"name": "Living Room"}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/rooms", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "room-uuid-111", data["id"])
	assert.Equal(t, "Living Room", data["name"])
}

func TestInspectionHandler_UpdateRoom_Returns200WithRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		updateRoomFn: func(token string, roomID string, input updateRoomInput) (*roomResponse, error) {
			return &roomResponse{
				ID:   roomID,
				Name: input.Name,
				Photos: []models.InspectionRoomPhoto{},
			}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.PUT("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.UpdateRoom)
	payload := map[string]interface{}{"name": "Kitchen"}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("PUT", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "Kitchen", data["name"])
}

func TestInspectionHandler_DeleteRoom_Returns204OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoomFn: func(token string, roomID string) error { return nil },
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.DeleteRoom)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestInspectionHandler_DeleteRoom_Returns404ForUnknownRoom(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mock := &mockInspectionService{
		deleteRoomFn: func(token string, roomID string) error {
			return fmt.Errorf("room not found: %w", sql.ErrNoRows)
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", handler.DeleteRoom)
	req, _ := http.NewRequest("DELETE", "/api/magic-links/test-token/v2/inspection/rooms/nonexistent", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNotFound, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, false, resp["success"])
}

func TestInspectionHandler_AddRoomPhoto_Returns201OnSuccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	caption := "Water stain on south wall"
	mock := &mockInspectionService{
		addRoomPhotoFn: func(token string, roomID string, input addRoomPhotoInput) (*roomPhotoResponse, error) {
			return &roomPhotoResponse{ID: "photo-uuid-333", RoomID: roomID, Caption: &caption}, nil
		},
	}
	handler := NewInspectionHandler(mock)
	r := gin.New()
	r.POST("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos", handler.AddRoomPhoto)
	payload := map[string]interface{}{"caption": caption}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "/api/magic-links/test-token/v2/inspection/rooms/room-uuid-111/photos", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "photo-uuid-333", data["id"])
}
```

**Step 5: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 6: Commit**

```bash
git add backend/internal/handlers/inspection_handler.go \
        backend/internal/handlers/inspection_handler_test.go
git commit -m "feat: handlers + tests — GetRooms, CreateRoom, UpdateRoom, DeleteRoom, AddRoomPhoto, DeleteRoomPhoto"
```

---

### Task 5: Router — wire 6 room routes

**Files:**
- Modify: `backend/internal/api/router.go`

**Background:** In `router.go`, the roof routes end at line 135. Add the rooms block immediately after.

**Step 1: Add 6 routes after the last roof route (line 135)**

```go
// Rooms routes
r.GET("/api/magic-links/:token/v2/inspection/rooms", inspectionHandler.GetRooms)
r.POST("/api/magic-links/:token/v2/inspection/rooms", inspectionHandler.CreateRoom)
r.PUT("/api/magic-links/:token/v2/inspection/rooms/:roomId", inspectionHandler.UpdateRoom)
r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId", inspectionHandler.DeleteRoom)
r.POST("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos", inspectionHandler.AddRoomPhoto)
r.DELETE("/api/magic-links/:token/v2/inspection/rooms/:roomId/photos/:photoId", inspectionHandler.DeleteRoomPhoto)
```

**Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: clean.

**Step 3: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: routes — 6 room endpoints"
```

---

### Task 6: TypeScript Types

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/types.ts`

**Step 1: Append to the end of `types.ts`**

```typescript
// ── Rooms ─────────────────────────────────────────────────────────────────────

export const DAMAGED_MATERIALS = [
  'Drywall',
  'Flooring',
  'Baseboards',
  'Ceiling',
  'Trim',
] as const

export type DamagedMaterial = (typeof DAMAGED_MATERIALS)[number]

export interface InspectionRoomPhoto {
  id: string
  room_id: string
  photo_id: string | null
  photo_url: string | null
  caption: string | null
  sort_order: number
  created_at: string
}

export interface InspectionRoom {
  id: string
  inspection_id: string
  name: string
  length_ft: number | null
  width_ft: number | null
  height_ft: number | null
  damaged_materials: DamagedMaterial[]
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  photos: InspectionRoomPhoto[]
}

export interface CreateRoomInput {
  name: string
  length_ft?: number | null
  width_ft?: number | null
  height_ft?: number | null
  damaged_materials?: DamagedMaterial[]
  notes?: string | null
}

export interface UpdateRoomInput {
  name: string
  length_ft: number | null
  width_ft: number | null
  height_ft: number | null
  damaged_materials: DamagedMaterial[]
  notes: string | null
}
```

**Step 2: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/types.ts
git commit -m "feat: TypeScript types — InspectionRoom, InspectionRoomPhoto, DamagedMaterial"
```

---

### Task 7: State Hook — extend useWizardV2State

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`

**Background:** Read the full file before editing. The file uses a single `roofDebounceTimer` ref. For rooms, we need a `Map<roomId, timer>` ref. Each room's auto-save debounces independently. The `computeNextStep`/`computePrevStep` callbacks must now include step 4 in the dynamic step array when `include_interior` is true.

**Step 1: Add imports at the top of the file**

After the existing type imports, add:
```typescript
import {
  InspectionRoom,
  InspectionRoomPhoto,
  CreateRoomInput,
  UpdateRoomInput,
  DamagedMaterial,
} from './types'
```
(Add to the existing import from `'./types'` if they are imported together.)

**Step 2: Add 6 new fields to `WizardV2State` interface**

```typescript
// Rooms (step 4)
rooms: InspectionRoom[]
roomsLoading: boolean
loadRooms: () => Promise<void>
createRoom: (input: CreateRoomInput) => Promise<InspectionRoom | null>
updateRoom: (roomId: string, input: UpdateRoomInput) => void   // debounced, no return
deleteRoom: (roomId: string) => Promise<void>
addRoomPhoto: (roomId: string, input: { photo_document_id?: string; caption?: string; sort_order?: number }) => Promise<InspectionRoomPhoto | null>
deleteRoomPhoto: (roomId: string, photoId: string) => Promise<void>
```

**Step 3: Add state + ref declarations inside the hook body**

After the existing roof state declarations, add:
```typescript
const [rooms, setRooms] = useState<InspectionRoom[]>([])
const [roomsLoading, setRoomsLoading] = useState(false)
const roomDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
```

**Step 4: Add loadRooms callback**

```typescript
const loadRooms = useCallback(async () => {
  if (!token) return
  setRoomsLoading(true)
  try {
    const res = await fetch(`/api/magic-links/${token}/v2/inspection/rooms`)
    const json = await res.json()
    if (json.success) setRooms(json.data ?? [])
  } catch (e) {
    console.error('loadRooms error', e)
  } finally {
    setRoomsLoading(false)
  }
}, [token])
```

**Step 5: Add createRoom callback**

```typescript
const createRoom = useCallback(async (input: CreateRoomInput): Promise<InspectionRoom | null> => {
  if (!token) return null
  try {
    const res = await fetch(`/api/magic-links/${token}/v2/inspection/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (json.success) {
      const newRoom: InspectionRoom = json.data
      setRooms(prev => [...prev, newRoom])
      return newRoom
    }
  } catch (e) {
    console.error('createRoom error', e)
  }
  return null
}, [token])
```

**Step 6: Add updateRoom callback (debounced)**

```typescript
const updateRoom = useCallback((roomId: string, input: UpdateRoomInput) => {
  if (!token) return
  // Optimistic update — reflect changes immediately in UI
  setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...input } : r))
  // Debounce the API call
  const existing = roomDebounceTimers.current.get(roomId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(async () => {
    roomDebounceTimers.current.delete(roomId)
    try {
      const res = await fetch(`/api/magic-links/${token}/v2/inspection/rooms/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (json.success) {
        setRooms(prev => prev.map(r => r.id === roomId ? json.data : r))
      }
    } catch (e) {
      console.error('updateRoom debounce error', e)
    }
  }, 800)
  roomDebounceTimers.current.set(roomId, timer)
}, [token])
```

**Step 7: Add deleteRoom callback**

```typescript
const deleteRoom = useCallback(async (roomId: string) => {
  if (!token) return
  setRooms(prev => prev.filter(r => r.id !== roomId))
  try {
    await fetch(`/api/magic-links/${token}/v2/inspection/rooms/${roomId}`, { method: 'DELETE' })
  } catch (e) {
    console.error('deleteRoom error', e)
  }
}, [token])
```

**Step 8: Add addRoomPhoto callback**

```typescript
const addRoomPhoto = useCallback(async (
  roomId: string,
  input: { photo_document_id?: string; caption?: string; sort_order?: number }
): Promise<InspectionRoomPhoto | null> => {
  if (!token) return null
  try {
    const res = await fetch(`/api/magic-links/${token}/v2/inspection/rooms/${roomId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json()
    if (json.success) {
      const photo: InspectionRoomPhoto = json.data
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, photos: [...r.photos, photo] } : r))
      return photo
    }
  } catch (e) {
    console.error('addRoomPhoto error', e)
  }
  return null
}, [token])
```

**Step 9: Add deleteRoomPhoto callback**

```typescript
const deleteRoomPhoto = useCallback(async (roomId: string, photoId: string) => {
  if (!token) return
  setRooms(prev => prev.map(r =>
    r.id === roomId ? { ...r, photos: r.photos.filter(p => p.id !== photoId) } : r
  ))
  try {
    await fetch(`/api/magic-links/${token}/v2/inspection/rooms/${roomId}/photos/${photoId}`, {
      method: 'DELETE',
    })
  } catch (e) {
    console.error('deleteRoomPhoto error', e)
  }
}, [token])
```

**Step 10: Update computeNextStep and computePrevStep**

The existing `computeNextStep` / `computePrevStep` build a `steps` array like:
```typescript
const steps: WizardStep[] = [1]
if (include_exterior) steps.push(2 as WizardStep)
if (include_roof)     steps.push(3 as WizardStep)
if (include_interior) steps.push(4 as WizardStep)
steps.push(5 as WizardStep)
```

**IMPORTANT:** Check if `include_interior` is already included. If not, add `if (include_interior) steps.push(4 as WizardStep)` before the final `steps.push(5 as WizardStep)`.

Also update `submitQuickSetup` if it inline-builds the same array — add the same `include_interior` condition there too.

**Step 11: Update `useEffect` to call loadRooms on step 4**

In the existing `useEffect` that loads step data, add:
```typescript
if (currentStep === 4) {
  loadRooms()
}
```

**Step 12: Add 8 new fields to the return object**

```typescript
rooms,
roomsLoading,
loadRooms,
createRoom,
updateRoom,
deleteRoom,
addRoomPhoto,
deleteRoomPhoto,
```

**Step 13: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

**Step 14: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/useWizardV2State.ts
git commit -m "feat: state hook — rooms CRUD with Map-based debounce"
```

---

### Task 8: RoomsStep.tsx component

**Files:**
- Create: `frontend/src/components/contractor-wizard-v2/steps/RoomsStep.tsx`

**Layout reminder:** Mobile-first, inline styles only (`React.CSSProperties`), single scrollable page with accordion cards. Each card expands to show: photo gallery, 3 dimension inputs, pill row for damaged_materials, notes textarea, delete button.

**Step 1: Create the file**

```tsx
import React, { useState } from 'react'
import {
  InspectionRoom,
  UpdateRoomInput,
  DAMAGED_MATERIALS,
  DamagedMaterial,
} from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomsStepProps {
  rooms: InspectionRoom[]
  roomsLoading: boolean
  onCreateRoom: () => Promise<void>
  onUpdateRoom: (roomId: string, input: UpdateRoomInput) => void
  onDeleteRoom: (roomId: string) => Promise<void>
  onAddRoomPhoto: (roomId: string, input: { caption?: string }) => Promise<void>
  onDeleteRoomPhoto: (roomId: string, photoId: string) => Promise<void>
  onContinue: () => void
  onBack: () => void
}

// ── DamagedMaterialPills ──────────────────────────────────────────────────────

interface DamagedMaterialPillsProps {
  selected: DamagedMaterial[]
  onChange: (next: DamagedMaterial[]) => void
}

function DamagedMaterialPills({ selected, onChange }: DamagedMaterialPillsProps) {
  const toggle = (material: DamagedMaterial) => {
    const next = selected.includes(material)
      ? selected.filter(m => m !== material)
      : [...selected, material]
    onChange(next)
  }

  const pillContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '20px',
    border: `1.5px solid ${active ? '#2563eb' : '#d1d5db'}`,
    backgroundColor: active ? '#eff6ff' : '#ffffff',
    color: active ? '#1d4ed8' : '#374151',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    userSelect: 'none',
  })

  return (
    <div>
      <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
        Damaged materials
      </label>
      <div style={pillContainerStyle}>
        {DAMAGED_MATERIALS.map(material => (
          <button
            key={material}
            type="button"
            style={pillStyle(selected.includes(material))}
            onClick={() => toggle(material)}
          >
            {material}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── RoomPhotoGallery ──────────────────────────────────────────────────────────

interface RoomPhotoGalleryProps {
  photos: InspectionRoom['photos']
  onDelete: (photoId: string) => void
  onAdd: () => void
}

function RoomPhotoGallery({ photos, onDelete, onAdd }: RoomPhotoGalleryProps) {
  const scrollStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '4px',
  }

  const thumbStyle: React.CSSProperties = {
    flexShrink: 0,
    width: '72px',
    height: '72px',
    borderRadius: '8px',
    objectFit: 'cover',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    position: 'relative',
  }

  const addTileStyle: React.CSSProperties = {
    flexShrink: 0,
    width: '72px',
    height: '72px',
    borderRadius: '8px',
    border: '1.5px dashed #9ca3af',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: '#f9fafb',
    color: '#6b7280',
    fontSize: '24px',
  }

  return (
    <div>
      <label style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>
        Damage photos
      </label>
      <div style={scrollStyle}>
        {photos.map(photo => (
          <div key={photo.id} style={{ position: 'relative' }}>
            {photo.photo_url ? (
              <img src={photo.photo_url} style={thumbStyle} alt={photo.caption ?? 'damage photo'} />
            ) : (
              <div style={{ ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px' }}>📷</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={addTileStyle} onClick={onAdd}>+</div>
      </div>
    </div>
  )
}

// ── RoomCard ──────────────────────────────────────────────────────────────────

interface RoomCardProps {
  room: InspectionRoom
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (input: UpdateRoomInput) => void
  onDelete: () => void
  onAddPhoto: () => void
  onDeletePhoto: (photoId: string) => void
}

function RoomCard({
  room,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddPhoto,
  onDeletePhoto,
}: RoomCardProps) {
  const buildInput = (overrides: Partial<UpdateRoomInput>): UpdateRoomInput => ({
    name: room.name,
    length_ft: room.length_ft,
    width_ft: room.width_ft,
    height_ft: room.height_ft,
    damaged_materials: room.damaged_materials as DamagedMaterial[],
    notes: room.notes,
    ...overrides,
  })

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    backgroundColor: isExpanded ? '#f8faff' : '#ffffff',
  }

  const bodyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '0 16px 16px',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    boxSizing: 'border-box',
  }

  const dimRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '4px',
    display: 'block',
  }

  const deleteButtonStyle: React.CSSProperties = {
    alignSelf: 'flex-end',
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid #fca5a5',
    backgroundColor: '#fff5f5',
    color: '#dc2626',
    fontSize: '13px',
    cursor: 'pointer',
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle} onClick={onToggle}>
        <span style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>{room.name}</span>
        <span style={{ color: '#6b7280', fontSize: '18px' }}>{isExpanded ? '−' : '+'}</span>
      </div>
      {isExpanded && (
        <div style={bodyStyle}>
          {/* Room name */}
          <div>
            <label style={{ ...labelStyle }}>Room name</label>
            <input
              style={inputStyle}
              value={room.name}
              onChange={e => onUpdate(buildInput({ name: e.target.value }))}
              placeholder="e.g. Living Room"
            />
          </div>

          {/* Dimensions */}
          <div>
            <label style={{ ...labelStyle }}>Dimensions (ft)</label>
            <div style={dimRowStyle}>
              <div>
                <span style={labelStyle}>Length</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.length_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ length_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
              <div>
                <span style={labelStyle}>Width</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.width_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ width_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
              <div>
                <span style={labelStyle}>Height</span>
                <input
                  type="number"
                  style={inputStyle}
                  value={room.height_ft ?? ''}
                  onChange={e => onUpdate(buildInput({ height_ft: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Damaged materials */}
          <DamagedMaterialPills
            selected={room.damaged_materials as DamagedMaterial[]}
            onChange={next => onUpdate(buildInput({ damaged_materials: next }))}
          />

          {/* Damage photos */}
          <RoomPhotoGallery
            photos={room.photos}
            onDelete={onDeletePhoto}
            onAdd={onAddPhoto}
          />

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
              value={room.notes ?? ''}
              onChange={e => onUpdate(buildInput({ notes: e.target.value || null }))}
              placeholder="Any additional notes…"
            />
          </div>

          <button type="button" style={deleteButtonStyle} onClick={onDelete}>
            🗑 Delete room
          </button>
        </div>
      )}
    </div>
  )
}

// ── RoomsStep ─────────────────────────────────────────────────────────────────

export default function RoomsStep({
  rooms,
  roomsLoading,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onAddRoomPhoto,
  onDeleteRoomPhoto,
  onContinue,
  onBack,
}: RoomsStepProps) {
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleCreateRoom = async () => {
    setCreating(true)
    await onCreateRoom()
    setCreating(false)
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('Delete this room?')) return
    if (expandedRoomId === roomId) setExpandedRoomId(null)
    await onDeleteRoom(roomId)
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  }

  const headerStyle: React.CSSProperties = {
    padding: '20px 16px 12px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
  }

  const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  const addButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1.5px dashed #9ca3af',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '15px',
    fontWeight: 500,
    cursor: creating ? 'not-allowed' : 'pointer',
    opacity: creating ? 0.6 : 1,
  }

  const footerStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
  }

  const backBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    fontSize: '15px',
    cursor: 'pointer',
  }

  const continueBtnStyle: React.CSSProperties = {
    flex: 2,
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: rooms.length > 0 ? '#2563eb' : '#9ca3af',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: rooms.length > 0 ? 'pointer' : 'not-allowed',
  }

  if (roomsLoading) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280' }}>Loading rooms…</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Step 4 of 5</p>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0', color: '#111827' }}>
          Rooms / Interior
        </h2>
      </div>

      <div style={bodyStyle}>
        {rooms.map(room => (
          <RoomCard
            key={room.id}
            room={room}
            isExpanded={expandedRoomId === room.id}
            onToggle={() => setExpandedRoomId(prev => prev === room.id ? null : room.id)}
            onUpdate={input => onUpdateRoom(room.id, input)}
            onDelete={() => handleDeleteRoom(room.id)}
            onAddPhoto={() => onAddRoomPhoto(room.id, {})}
            onDeletePhoto={photoId => onDeleteRoomPhoto(room.id, photoId)}
          />
        ))}

        <button
          type="button"
          style={addButtonStyle}
          onClick={handleCreateRoom}
          disabled={creating}
        >
          {creating ? 'Adding…' : '+ Add Room'}
        </button>
      </div>

      <div style={footerStyle}>
        <button type="button" style={backBtnStyle} onClick={onBack}>← Back</button>
        <button
          type="button"
          style={continueBtnStyle}
          disabled={rooms.length === 0}
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/steps/RoomsStep.tsx
git commit -m "feat: RoomsStep component — accordion cards, pill multi-select, photo gallery"
```

---

### Task 9: Wire RoomsStep into ContractorWizardV2

**Files:**
- Modify: `frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx`

**Background:** Read `ContractorWizardV2.tsx` before editing. After Slice 3:
- `currentStep === 3` renders `<RoofStep>` with `onContinue={() => setCurrentStep(computeNextStep(3))}` and `onBack={() => setCurrentStep(computePrevStep(3))}`
- `currentStep > 3` renders a placeholder

The edit here: replace the `currentStep > 3` placeholder with `currentStep === 4` (RoomsStep) plus `currentStep > 4` (placeholder).

**Step 1: Add RoomsStep import**

```typescript
import RoomsStep from './steps/RoomsStep'
```

**Step 2: Replace the `currentStep > 3` placeholder**

Find the block:
```tsx
{currentStep > 3 && (
  <div>...</div>
)}
```

Replace with:
```tsx
{currentStep === 4 && (
  <RoomsStep
    rooms={rooms}
    roomsLoading={roomsLoading}
    onCreateRoom={async () => { await createRoom({ name: 'Room' }) }}
    onUpdateRoom={updateRoom}
    onDeleteRoom={deleteRoom}
    onAddRoomPhoto={addRoomPhoto}
    onDeleteRoomPhoto={deleteRoomPhoto}
    onContinue={() => setCurrentStep(computeNextStep(4))}
    onBack={() => setCurrentStep(computePrevStep(4))}
  />
)}
{currentStep > 4 && (
  <div style={{ padding: '32px 16px', textAlign: 'center' }}>
    <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Step 5 coming soon</h2>
  </div>
)}
```

**Step 3: Also update RoofStep's onContinue/onBack to use computeNextStep/computePrevStep**

If the current RoofStep wiring uses `setCurrentStep(4)` hardcoded, replace:
```tsx
onContinue={() => setCurrentStep(computeNextStep(3))}
onBack={() => setCurrentStep(computePrevStep(3))}
```

**Step 4: Full build check**

```bash
cd frontend && npx tsc --noEmit && npx vite build
```
Expected: zero errors.

**Step 5: Commit**

```bash
git add frontend/src/components/contractor-wizard-v2/ContractorWizardV2.tsx
git commit -m "feat: wire RoomsStep into wizard"
```
