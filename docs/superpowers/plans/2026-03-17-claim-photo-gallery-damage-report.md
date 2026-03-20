# Claim Photo Gallery & Damage Report Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Photos and Damage Report tabs to ClaimDetail with a new backend media endpoint and two new display-only frontend components.

**Architecture:** Backend adds `GET /api/claims/:id/media` backed by `InspectionService.GetMediaByClaimID`, which queries four tables (roof slots, damage spots, elevations, room photos) and returns a flat ordered `[]MediaItem`. Frontend adds `ClaimPhotoGallery` (lazy grid + lightbox) and `ClaimDamageReport` (deterministic client-side summary) wired into a three-tab layout (`Overview` / `Photos` / `Damage Report`) in `ClaimDetail`.

**Tech Stack:** Go 1.21, Gin, PostgreSQL (backend); React 18, TypeScript, @tanstack/react-query, axios (frontend).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/internal/handlers/claim_media_handler_test.go` | Create | Integration tests — written first (TDD) |
| `backend/internal/handlers/claim_media_handler.go` | Create | Thin HTTP handler: auth-check claim ownership, call service |
| `backend/internal/services/inspection_service.go` | Modify | Add `MediaItem` struct + `GetMediaByClaimID` method |
| `backend/internal/api/router.go` | Modify | Register `GET /claims/:id/media` in protected group |
| `frontend/src/lib/api.ts` | Modify | Add `MediaItem` interface + `getClaimMedia()` |
| `frontend/src/components/ClaimPhotoGallery.tsx` | Create | Grid, all states, lightbox |
| `frontend/src/components/ClaimDamageReport.tsx` | Create | Summary bullets + area cards |
| `frontend/src/pages/ClaimDetail.tsx` | Modify | Tab bar, lift scope-sheet query, conditional rendering |

---

## Existing test helper signatures in `claim_handler_test.go`

Before writing the tests, know these helpers:

```go
// Returns (orgID, userID, token) — token == userID in tests
createAuthenticatedUser(t *testing.T, db *sql.DB) (string, string, string)

createTestProperty(t *testing.T, db *sql.DB, orgID string) string  // returns propertyID

createTestPolicy(t *testing.T, db *sql.DB, propertyID string, deductible float64) string  // returns policyID

createTestClaim(t *testing.T, db *sql.DB, propertyID, policyID, orgID, userID string) string  // returns claimID
```

The auth middleware in tests uses the token as a user ID to load a real `models.User` from the DB.

---

## Chunk 1: Backend — Tests + Handler + Service

Tasks follow strict TDD order: write tests → red → implement → green.

### Task 1: Write the integration tests (TDD red phase)

**Files:**
- Create: `backend/internal/handlers/claim_media_handler_test.go`

> These tests use the real-database pattern from `claim_handler_test.go`. They require a local Postgres instance at `localhost:5432/claimcoach_test`.

- [ ] **Step 1: Create the test file**

  ```go
  package handlers

  import (
  	"encoding/json"
  	"net/http"
  	"net/http/httptest"
  	"strings"
  	"testing"

  	"github.com/claimcoach/backend/internal/models"
  	"github.com/claimcoach/backend/internal/services"
  	"github.com/claimcoach/backend/internal/storage"
  	"github.com/gin-gonic/gin"
  	"github.com/stretchr/testify/assert"
  )

  // newClaimMediaTestRouter sets up a gin engine with mock auth that loads a real
  // user from the DB (token == userID, same pattern as setupTestRouter).
  func newClaimMediaTestRouter(h *ClaimMediaHandler) *gin.Engine {
  	gin.SetMode(gin.TestMode)
  	r := gin.New()
  	r.Use(func(c *gin.Context) {
  		auth := c.GetHeader("Authorization")
  		if auth == "" {
  			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
  			c.Abort()
  			return
  		}
  		parts := strings.Split(auth, " ")
  		if len(parts) != 2 || parts[0] != "Bearer" {
  			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
  			c.Abort()
  			return
  		}
  		// token == userID in tests
  		userID := parts[1]
  		realDB := h.claimService.GetDB()
  		var user models.User
  		err := realDB.QueryRow(`
  			SELECT id, organization_id, email, name, role, created_at, updated_at
  			FROM users WHERE id = $1
  		`, userID).Scan(
  			&user.ID, &user.OrganizationID, &user.Email,
  			&user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
  		)
  		if err != nil {
  			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
  			c.Abort()
  			return
  		}
  		c.Set("user", user)
  		c.Next()
  	})
  	r.GET("/api/claims/:id/media", h.GetMedia)
  	return r
  }

  func newClaimMediaHandler(t *testing.T) (*ClaimMediaHandler, func()) {
  	db := setupTestDB(t)
  	storageClient, err := storage.NewSupabaseStorage("http://localhost", "fake-key")
  	if err != nil {
  		t.Logf("storage init warning: %v (expected in tests)", err)
  	}
  	claimSvc := services.NewClaimService(db, nil, nil)
  	magicLinkSvc := services.NewMagicLinkService(db, nil, storageClient, claimSvc, nil)
  	inspSvc := services.NewInspectionService(db, magicLinkSvc, storageClient)
  	h := NewClaimMediaHandler(claimSvc, inspSvc)
  	return h, func() { db.Close() }
  }

  func TestClaimMediaHandler_NoAuth(t *testing.T) {
  	h, cleanup := newClaimMediaHandler(t)
  	defer cleanup()

  	r := newClaimMediaTestRouter(h)
  	req, _ := http.NewRequest("GET", "/api/claims/some-id/media", nil)
  	w := httptest.NewRecorder()
  	r.ServeHTTP(w, req)

  	assert.Equal(t, http.StatusUnauthorized, w.Code)
  }

  func TestClaimMediaHandler_ClaimNotFound(t *testing.T) {
  	h, cleanup := newClaimMediaHandler(t)
  	defer cleanup()

  	db := h.claimService.GetDB()
  	orgID, userID, token := createAuthenticatedUser(t, db)
  	_ = orgID // user belongs to org; claim we request belongs to nobody

  	r := newClaimMediaTestRouter(h)
  	req, _ := http.NewRequest("GET", "/api/claims/nonexistent-id/media", nil)
  	req.Header.Set("Authorization", "Bearer "+token)
  	w := httptest.NewRecorder()
  	r.ServeHTTP(w, req)

  	assert.Equal(t, http.StatusNotFound, w.Code)
  	_ = userID
  }

  func TestClaimMediaHandler_NoInspection_ReturnsEmptyArray(t *testing.T) {
  	h, cleanup := newClaimMediaHandler(t)
  	defer cleanup()

  	db := h.claimService.GetDB()
  	orgID, userID, token := createAuthenticatedUser(t, db)
  	propID := createTestProperty(t, db, orgID)
  	policyID := createTestPolicy(t, db, propID, 2500.00)
  	claimID := createTestClaim(t, db, propID, policyID, orgID, userID)

  	r := newClaimMediaTestRouter(h)
  	req, _ := http.NewRequest("GET", "/api/claims/"+claimID+"/media", nil)
  	req.Header.Set("Authorization", "Bearer "+token)
  	w := httptest.NewRecorder()
  	r.ServeHTTP(w, req)

  	assert.Equal(t, http.StatusOK, w.Code)

  	var body struct {
  		Data []json.RawMessage `json:"data"`
  	}
  	err := json.Unmarshal(w.Body.Bytes(), &body)
  	assert.NoError(t, err)
  	assert.NotNil(t, body.Data)      // must be [] not null
  	assert.Len(t, body.Data, 0)
  }
  ```

  > **Note:** `newClaimMediaTestRouter` uses `h.claimService.GetDB()` — this requires `ClaimService` to expose a `GetDB() *sql.DB` method. Check `claim_service.go` for this method. It already exists (used by `getDBFromHandler` in `claim_handler_test.go`).

- [ ] **Step 2: Run — expect compile errors because `ClaimMediaHandler` doesn't exist yet**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestClaimMediaHandler -v 2>&1 | head -20
  ```

  Expected: compile error `undefined: ClaimMediaHandler` or similar. This is the TDD red phase.

### Task 2: Create `claim_media_handler.go` (make tests compile)

**Files:**
- Create: `backend/internal/handlers/claim_media_handler.go`

- [ ] **Step 3: Create the handler**

  ```go
  package handlers

  import (
  	"net/http"

  	"github.com/claimcoach/backend/internal/models"
  	"github.com/claimcoach/backend/internal/services"
  	"github.com/gin-gonic/gin"
  )

  type ClaimMediaHandler struct {
  	claimService      *services.ClaimService
  	inspectionService *services.InspectionService
  }

  func NewClaimMediaHandler(
  	claimService *services.ClaimService,
  	inspectionService *services.InspectionService,
  ) *ClaimMediaHandler {
  	return &ClaimMediaHandler{
  		claimService:      claimService,
  		inspectionService: inspectionService,
  	}
  }

  // GetMedia handles GET /api/claims/:id/media
  func (h *ClaimMediaHandler) GetMedia(c *gin.Context) {
  	claimID := c.Param("id")
  	user := c.MustGet("user").(models.User)

  	if _, err := h.claimService.GetClaim(claimID, user.OrganizationID); err != nil {
  		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
  		return
  	}

  	items, err := h.inspectionService.GetMediaByClaimID(claimID)
  	if err != nil {
  		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
  		return
  	}

  	c.JSON(http.StatusOK, gin.H{"data": items})
  }
  ```

- [ ] **Step 4: Run tests — expect compile errors because `GetMediaByClaimID` doesn't exist yet**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestClaimMediaHandler -v 2>&1 | head -20
  ```

  Expected: compile error `h.inspectionService.GetMediaByClaimID undefined`. Still red.

### Task 3: Implement `GetMediaByClaimID` in `inspection_service.go`

**Files:**
- Modify: `backend/internal/services/inspection_service.go`

- [ ] **Step 5: Add `MediaItem` struct and `roofSectionLabel` helper**

  Add just after the `NewInspectionService` constructor (after line ~31), before `SaveSetupInput`:

  ```go
  // MediaItem represents a single inspection photo with its display caption.
  type MediaItem struct {
  	URL     string `json:"url"`
  	Caption string `json:"caption"`
  }

  // roofSectionLabel returns the display label for a roof section.
  // customName takes precedence when set.
  func roofSectionLabel(sectionType string, customName sql.NullString) string {
  	if customName.Valid && customName.String != "" {
  		return customName.String
  	}
  	labels := map[string]string{
  		"main_house": "Main House",
  		"garage":     "Garage",
  		"patio":      "Patio",
  		"carport":    "Carport",
  		"flat_roof":  "Flat Roof",
  		"other":      "Other",
  	}
  	if l, ok := labels[sectionType]; ok {
  		return l
  	}
  	return sectionType
  }
  ```

- [ ] **Step 6: Add `GetMediaByClaimID` at the end of `inspection_service.go`**

  ```go
  // GetMediaByClaimID returns all inspection photos for the most recent submitted
  // inspection linked to claimID, ordered: roof slot photos → damage spots →
  // elevations → room photos.
  // Returns an empty (non-nil) slice if no submitted inspection exists or no photos found.
  func (s *InspectionService) GetMediaByClaimID(claimID string) ([]MediaItem, error) {
  	// 1. Find the most-recent submitted inspection for this claim.
  	var inspectionID string
  	err := s.db.QueryRow(`
  		SELECT iv2.id
  		FROM inspection_v2 iv2
  		JOIN magic_links ml ON ml.id = iv2.magic_link_id
  		WHERE ml.claim_id = $1 AND iv2.submitted_at IS NOT NULL
  		ORDER BY iv2.submitted_at DESC
  		LIMIT 1
  	`, claimID).Scan(&inspectionID)
  	if err == sql.ErrNoRows {
  		return []MediaItem{}, nil
  	}
  	if err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: lookup inspection: %w", err)
  	}

  	var items []MediaItem
  	slotLabels := []string{"Overview", "Slope", "Shingles", "Ridge"}

  	// 2a. Roof section slot photos (4 per section via documents JOIN).
  	roofRows, err := s.db.Query(`
  		SELECT
  			r.section_type, r.section_custom_name, r.sort_order,
  			d_ov.file_url, d_sl.file_url, d_sh.file_url, d_ri.file_url
  		FROM inspection_roof r
  		LEFT JOIN documents d_ov ON d_ov.id = r.overview_photo_id
  		LEFT JOIN documents d_sl ON d_sl.id = r.slope_photo_id
  		LEFT JOIN documents d_sh ON d_sh.id = r.shingles_photo_id
  		LEFT JOIN documents d_ri ON d_ri.id = r.ridge_photo_id
  		WHERE r.inspection_id = $1
  		ORDER BY r.sort_order, r.created_at
  	`, inspectionID)
  	if err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: roof query: %w", err)
  	}
  	defer roofRows.Close()

  	for roofRows.Next() {
  		var sType string
  		var customName sql.NullString
  		var sortOrder int
  		var urls [4]sql.NullString
  		if err := roofRows.Scan(&sType, &customName, &sortOrder, &urls[0], &urls[1], &urls[2], &urls[3]); err != nil {
  			return nil, fmt.Errorf("GetMediaByClaimID: roof scan: %w", err)
  		}
  		label := roofSectionLabel(sType, customName)
  		for i, u := range urls {
  			if !u.Valid {
  				continue
  			}
  			pub := s.convertFileURLToPublic(&u.String)
  			if pub == nil {
  				continue
  			}
  			items = append(items, MediaItem{
  				URL:     *pub,
  				Caption: label + " – " + slotLabels[i],
  			})
  		}
  	}
  	if err := roofRows.Err(); err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: roof rows: %w", err)
  	}

  	// 2b. Damage spots (photo_url stored directly — no documents JOIN).
  	spotRows, err := s.db.Query(`
  		SELECT ds.roof_id, ds.photo_url, ds.sort_order, r.section_type, r.section_custom_name
  		FROM inspection_roof_damage_spot ds
  		JOIN inspection_roof r ON r.id = ds.roof_id
  		WHERE r.inspection_id = $1 AND ds.photo_url IS NOT NULL
  		ORDER BY r.sort_order, ds.sort_order
  	`, inspectionID)
  	if err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: spots query: %w", err)
  	}
  	defer spotRows.Close()

  	var currentRoofID string
  	spotN := 0
  	for spotRows.Next() {
  		var roofID, photoURL string
  		var spotSortOrder int
  		var sType string
  		var customName sql.NullString
  		if err := spotRows.Scan(&roofID, &photoURL, &spotSortOrder, &sType, &customName); err != nil {
  			return nil, fmt.Errorf("GetMediaByClaimID: spot scan: %w", err)
  		}
  		if roofID != currentRoofID {
  			currentRoofID = roofID
  			spotN = 0
  		}
  		spotN++
  		pub := s.convertFileURLToPublic(&photoURL)
  		if pub == nil {
  			continue
  		}
  		label := roofSectionLabel(sType, customName)
  		items = append(items, MediaItem{
  			URL:     *pub,
  			Caption: fmt.Sprintf("%s – Damage Spot %d", label, spotN),
  		})
  	}
  	if err := spotRows.Err(); err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: spot rows: %w", err)
  	}

  	// 2c. Elevations (URL via documents JOIN).
  	elevRows, err := s.db.Query(`
  		SELECT e.side, d.file_url
  		FROM inspection_elevation e
  		LEFT JOIN documents d ON d.id = e.photo_document_id
  		WHERE e.inspection_id = $1 AND d.file_url IS NOT NULL
  		ORDER BY CASE e.side
  			WHEN 'front' THEN 1
  			WHEN 'right' THEN 2
  			WHEN 'back'  THEN 3
  			WHEN 'left'  THEN 4
  		END
  	`, inspectionID)
  	if err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: elevation query: %w", err)
  	}
  	defer elevRows.Close()

  	for elevRows.Next() {
  		var side, fileURL string
  		if err := elevRows.Scan(&side, &fileURL); err != nil {
  			return nil, fmt.Errorf("GetMediaByClaimID: elevation scan: %w", err)
  		}
  		pub := s.convertFileURLToPublic(&fileURL)
  		if pub == nil {
  			continue
  		}
  		caption := strings.ToUpper(side[:1]) + side[1:] + " Elevation"
  		items = append(items, MediaItem{URL: *pub, Caption: caption})
  	}
  	if err := elevRows.Err(); err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: elevation rows: %w", err)
  	}

  	// 2d. Room photos (photo_url stored directly — no documents JOIN).
  	roomRows, err := s.db.Query(`
  		SELECT rp.photo_url, rp.caption, r.name
  		FROM inspection_room_photo rp
  		JOIN inspection_room r ON r.id = rp.room_id
  		WHERE r.inspection_id = $1 AND rp.photo_url IS NOT NULL
  		ORDER BY r.sort_order, r.created_at, rp.sort_order
  	`, inspectionID)
  	if err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: room query: %w", err)
  	}
  	defer roomRows.Close()

  	for roomRows.Next() {
  		var photoURL, roomName string
  		var caption sql.NullString
  		if err := roomRows.Scan(&photoURL, &caption, &roomName); err != nil {
  			return nil, fmt.Errorf("GetMediaByClaimID: room scan: %w", err)
  		}
  		pub := s.convertFileURLToPublic(&photoURL)
  		if pub == nil {
  			continue
  		}
  		cap := roomName
  		if caption.Valid && caption.String != "" {
  			cap = caption.String
  		}
  		items = append(items, MediaItem{URL: *pub, Caption: cap})
  	}
  	if err := roomRows.Err(); err != nil {
  		return nil, fmt.Errorf("GetMediaByClaimID: room rows: %w", err)
  	}

  	if items == nil {
  		return []MediaItem{}, nil
  	}
  	return items, nil
  }
  ```

- [ ] **Step 7: Verify it compiles**

  ```bash
  cd backend && go build ./...
  ```

  Expected: no errors.

- [ ] **Step 8: Run tests — expect green**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestClaimMediaHandler -v
  ```

  Expected: all 3 tests PASS.

### Task 4: Register route in `router.go`

**Files:**
- Modify: `backend/internal/api/router.go`

- [ ] **Step 9: Add handler init + route in the protected `api` group**

  Find:
  ```go
  // Inspection V2 routes (protected - requires auth)
  api.GET("/claims/:id/inspection", inspectionHandler.GetByClaimID)
  ```

  Add immediately after:
  ```go
  // Media routes (protected - requires auth)
  claimMediaHandler := handlers.NewClaimMediaHandler(claimService, inspectionService)
  api.GET("/claims/:id/media", claimMediaHandler.GetMedia)
  ```

- [ ] **Step 10: Final backend compile check**

  ```bash
  cd backend && go build ./...
  ```

  Expected: no errors.

- [ ] **Step 11: Commit**

  ```bash
  git add backend/internal/handlers/claim_media_handler_test.go \
          backend/internal/handlers/claim_media_handler.go \
          backend/internal/services/inspection_service.go \
          backend/internal/api/router.go
  git commit -m "feat: add GET /api/claims/:id/media endpoint with photo aggregation"
  ```

---

## Chunk 2: Frontend — API Client + ClaimPhotoGallery

### Task 5: Add `MediaItem` + `getClaimMedia` to `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the type and function at the end of `api.ts`**

  ```typescript
  export interface MediaItem {
    url: string
    caption: string
  }

  export async function getClaimMedia(claimId: string): Promise<MediaItem[]> {
    const response = await api.get(`/api/claims/${claimId}/media`)
    return response.data.data
  }
  ```

- [ ] **Step 2: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

### Task 6: Create `ClaimPhotoGallery.tsx`

**Files:**
- Create: `frontend/src/components/ClaimPhotoGallery.tsx`

> **Props note:** The spec lists `Props: claimId: string` but also requires `enabled: activeTab === 'photos'` in the query to defer loading until the Photos tab is first visited. We add an `isActive: boolean` prop to carry that intent cleanly.

- [ ] **Step 3: Create the component**

  ```tsx
  import { useState, useEffect, useRef, useCallback } from 'react'
  import { useQuery } from '@tanstack/react-query'
  import { getClaimMedia } from '../lib/api'

  interface ClaimPhotoGalleryProps {
    claimId: string
    isActive: boolean
  }

  export default function ClaimPhotoGallery({ claimId, isActive }: ClaimPhotoGalleryProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const backdropRef = useRef<HTMLDivElement>(null)

    const { data: photos, isLoading, isError } = useQuery({
      queryKey: ['claim-media', claimId],
      queryFn: () => getClaimMedia(claimId),
      enabled: isActive,
    })

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (lightboxIndex === null || !photos) return
      if (e.key === 'ArrowRight') setLightboxIndex((lightboxIndex + 1) % photos.length)
      if (e.key === 'ArrowLeft')  setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)
      if (e.key === 'Escape')     setLightboxIndex(null)
    }, [lightboxIndex, photos])

    useEffect(() => {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    if (isLoading) {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                background: '#f3f4f6',
                borderRadius: '12px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )
    }

    if (isError) {
      return (
        <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '32px 0' }}>
          Something went wrong loading photos. Try refreshing the page.
        </p>
      )
    }

    if (!photos || photos.length === 0) {
      return (
        <p style={{ textAlign: 'center', color: 'var(--color-slate)', padding: '32px 0' }}>
          No photos uploaded yet. They'll appear here once your assessor completes the damage assessment.
        </p>
      )
    }

    const currentPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null

    return (
      <>
        {/* Photo grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {photos.map((photo, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className="photo-grid-btn"
              style={{
                aspectRatio: '1',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                position: 'relative',
                cursor: 'pointer',
                padding: 0,
                background: 'none',
              }}
            >
              <img
                src={photo.url}
                alt={photo.caption}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div className="photo-hover-overlay" style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.15s',
              }}>
                <svg width="28" height="28" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Lightbox */}
        {currentPhoto !== null && lightboxIndex !== null && (
          <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) setLightboxIndex(null) }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.85)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)}
              style={{
                position: 'fixed', left: '16px', top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: '44px', height: '44px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: 'white',
              }}
              aria-label="Previous photo"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <img
                src={currentPhoto.url}
                alt={currentPhoto.caption}
                style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }}
              />
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', textAlign: 'center', margin: 0 }}>
                <span style={{ color: 'rgba(255,255,255,0.5)', marginRight: '8px' }}>
                  {lightboxIndex + 1} / {photos.length}
                </span>
                {currentPhoto.caption}
              </p>
            </div>

            <button
              onClick={() => setLightboxIndex((lightboxIndex + 1) % photos.length)}
              style={{
                position: 'fixed', right: '16px', top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
                width: '44px', height: '44px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: 'white',
              }}
              aria-label="Next photo"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </>
    )
  }
  ```

- [ ] **Step 4: Add hover CSS to `frontend/src/index.css`**

  Append at the end of the file:
  ```css
  /* Photo gallery thumbnail hover overlay */
  .photo-grid-btn:hover .photo-hover-overlay {
    opacity: 1 !important;
  }
  ```

- [ ] **Step 5: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/lib/api.ts \
          frontend/src/components/ClaimPhotoGallery.tsx \
          frontend/src/index.css
  git commit -m "feat: add ClaimPhotoGallery component and getClaimMedia API function"
  ```

---

## Chunk 3: Frontend — ClaimDamageReport + ClaimDetail Integration

### Task 7: Create `ClaimDamageReport.tsx`

**Files:**
- Create: `frontend/src/components/ClaimDamageReport.tsx`

- [ ] **Step 1: Create the component**

  ```tsx
  import type { ScopeSheet, ScopeArea } from '../types/scopeSheet'
  import { CATEGORY_MAP } from './contractor-wizard/taxonomy'

  interface ClaimDamageReportProps {
    scopeSheet: ScopeSheet | null
  }

  function pluralize(n: number, singular: string, plural: string): string {
    return `${n} ${n === 1 ? singular : plural}`
  }

  function buildSummaryBullets(areas: ScopeArea[]): string[] {
    const roofAreas     = areas.filter(a => a.category_key.startsWith('roof'))
    const exteriorAreas = areas.filter(a => a.category_key === 'exterior_walls')
    const interiorAreas = areas.filter(a => a.category_key.startsWith('interior_'))
    const waterAreas    = areas.filter(a => a.category_key === 'water_mitigation')
    const otherAreas    = areas.filter(a =>
      !a.category_key.startsWith('roof') &&
      a.category_key !== 'exterior_walls' &&
      !a.category_key.startsWith('interior_') &&
      a.category_key !== 'water_mitigation'
    )

    const bullets: string[] = []

    if (roofAreas.length > 0)
      bullets.push(`Roof has damage across ${pluralize(roofAreas.length, 'section', 'sections')}.`)

    if (exteriorAreas.length > 0)
      bullets.push(`Exterior walls show damage on ${pluralize(exteriorAreas.length, 'area', 'areas')}.`)

    if (interiorAreas.length > 0)
      bullets.push(`${pluralize(interiorAreas.length, 'interior room', 'interior rooms')} affected with water or structural damage.`)

    if (waterAreas.length > 0)
      bullets.push('Water mitigation work required.')

    for (const area of otherAreas) {
      if (bullets.length >= 4) break
      const label = CATEGORY_MAP[area.category_key]?.label ?? area.category
      const tags  = area.tags.map(t => t.replace(/_/g, ' ')).join(', ')
      bullets.push(`${label}: ${tags}.`)
    }

    return bullets
  }

  function formatDimensions(dims: Record<string, number>): string {
    if (!dims || Object.keys(dims).length === 0) return ''
    if (dims.square_footage) return `${dims.square_footage.toLocaleString()} sq ft`
    if (dims.length && dims.width) return `${dims.length} × ${dims.width} ft`
    return ''
  }

  export default function ClaimDamageReport({ scopeSheet }: ClaimDamageReportProps) {
    if (!scopeSheet || scopeSheet.is_draft) {
      return (
        <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
          Damage report will appear once your assessor submits their scope sheet.
        </p>
      )
    }

    const areas = scopeSheet.areas ?? []

    if (areas.length === 0) {
      return (
        <p style={{ color: 'var(--color-slate)', textAlign: 'center', padding: '32px 0' }}>
          No damage areas recorded in the scope sheet.
        </p>
      )
    }

    const bullets = buildSummaryBullets(areas)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Summary card */}
        <div style={{
          background: 'var(--glass-mint)',
          border: '1px solid var(--color-mint-dark)',
          borderRadius: '16px',
          padding: '20px 24px',
        }}>
          <h3 style={{
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--color-teal-dark)',
            marginBottom: '12px',
            fontFamily: 'Manrope, sans-serif',
          }}>
            Damage Summary
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--color-slate-dark)', fontSize: '14px' }}>
                <span style={{ color: 'var(--color-teal)', marginTop: '2px', flexShrink: 0 }}>•</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Area cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {areas.map((area, i) => {
            const emoji = CATEGORY_MAP[area.category_key]?.emoji ?? '📌'
            const dims  = formatDimensions(area.dimensions)
            return (
              <div key={i} style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: area.tags.length || area.notes ? '10px' : 0 }}>
                  <span style={{ fontSize: '20px' }}>{emoji}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '15px', flex: 1 }}>
                    {area.category}
                  </span>
                  {dims && (
                    <span style={{ fontSize: '13px', color: 'var(--color-slate)' }}>{dims}</span>
                  )}
                </div>

                {area.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: area.notes ? '10px' : 0 }}>
                    {area.tags.map((tag, j) => (
                      <span key={j} style={{
                        background: 'var(--color-mint-light)',
                        color: 'var(--color-teal-dark)',
                        borderRadius: '20px',
                        padding: '3px 10px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}>
                        {tag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {area.notes && (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-slate)', fontStyle: 'italic' }}>
                    {area.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

### Task 8: Integrate tabs into `ClaimDetail.tsx`

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`

> `ClaimDetail` is ~1600 lines. Make surgical edits only — do not rewrite the file.

> **`queryClient` note:** `ClaimDetail` already declares `const queryClient = useQueryClient()` at line 849 — no new import needed.

- [ ] **Step 3: Add imports at the top of `ClaimDetail.tsx`**

  Find the existing import block. After the `ScopeSheetSummary` import line, add:
  ```typescript
  import ClaimPhotoGallery from '../components/ClaimPhotoGallery'
  import ClaimDamageReport from '../components/ClaimDamageReport'
  ```

  Do **not** import `getClaimMedia` — `ClaimDetail` does not call it directly.

- [ ] **Step 4: Add `activeTab` state + lifted scope-sheet query inside `ClaimDetail()`**

  After the existing `useState` declarations (around line 853), add:

  ```typescript
  const [activeTab, setActiveTab] = useState<'overview' | 'photos' | 'report'>('overview')

  // Lift scope-sheet query so result can be passed as a prop to ClaimDamageReport.
  // React Query deduplicates — ContractorSubmissionWrapper / AuditSectionWrapper
  // continue using their own copies with zero extra network requests.
  const { data: scopeSheet = null } = useQuery<ScopeSheet | null>({
    queryKey: ['scope-sheet', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${id}/scope-sheet`)
        return response.data.data as ScopeSheet
      } catch (error: any) {
        if (error.response?.status === 404) return null
        throw error
      }
    },
    enabled: !!id,
  })

  // Badge: read photo count from query cache — populated after first Photos tab visit.
  // mediaData is undefined before the Photos tab is clicked (query never ran).
  // showPhotoBadge is false until then, satisfying the spec's "not shown on initial page load" rule.
  const mediaData = queryClient.getQueryData<{ url: string; caption: string }[]>(['claim-media', id])
  const photoCount = mediaData?.length ?? 0
  const showPhotoBadge = photoCount > 0
  ```

- [ ] **Step 5: Add the tab bar to the main JSX**

  In the main `return (...)`, find the closing `</div>` of the `{/* Claim Header */}` block (the `bg-white shadow rounded-lg p-6` div, around line 1430–1440 in the file). Immediately after that closing tag, insert the tab bar:

  ```tsx
  {/* Tab bar */}
  <div style={{
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '24px',
  }}>
    {(['overview', 'photos', 'report'] as const).map((tab) => {
      const labels: Record<string, string> = {
        overview: 'Overview',
        photos: 'Photos',
        report: 'Damage Report',
      }
      const isActive = activeTab === tab
      return (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontFamily: 'Manrope, sans-serif',
            fontSize: '14px',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'var(--color-teal-dark)' : 'var(--color-slate)',
            borderBottom: isActive ? '2px solid var(--color-teal)' : '2px solid transparent',
            marginBottom: '-1px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {labels[tab]}
          {tab === 'photos' && showPhotoBadge && (
            <span style={{
              background: 'var(--color-mint-light)',
              color: 'var(--color-teal-dark)',
              borderRadius: '20px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 700,
            }}>
              {photoCount}
            </span>
          )}
        </button>
      )
    })}
  </div>
  ```

- [ ] **Step 6: Add Photos and Damage Report tab content**

  Immediately after the tab bar JSX, add:

  ```tsx
  {/* Photos tab */}
  {activeTab === 'photos' && id && (
    <ClaimPhotoGallery claimId={id} isActive={true} />
  )}

  {/* Damage Report tab */}
  {activeTab === 'report' && (
    <ClaimDamageReport scopeSheet={scopeSheet} />
  )}
  ```

- [ ] **Step 7: Wrap existing content in Overview tab**

  Find the JSX comment `{/* Documents Section */}` (which is the first major section after the Claim Header). Wrap the entire span from `{/* Documents Section */}` to just before the final `</div>` that closes the `<div className="space-y-6">` wrapper in:

  ```tsx
  {activeTab === 'overview' && (
    <>
      {/* ...all existing sections unchanged... */}
    </>
  )}
  ```

  The existing sections that go inside are (in order):
  - Documents Section
  - `ContractorSubmissionWrapper`
  - `MagicLinkHistory`
  - `CarrierEstimateUpload`
  - `AuditSectionWrapper`
  - `MeetingsSection`
  - `PaymentsSection`
  - `RCVDemandSection`
  - `DeductibleAnalysis`
  - Activity Log / Timeline

  Do not delete or modify any of these — just wrap them.

- [ ] **Step 8: TypeScript compile check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 9: Run dev server and manually verify**

  ```bash
  cd frontend && npm run dev
  ```

  Manual checklist:
  - [ ] Three tabs visible: Overview, Photos, Damage Report
  - [ ] Overview tab shows all existing content unchanged
  - [ ] Photos tab: tab bar stays interactive during load; skeletons appear; grid or empty state after load
  - [ ] Clicking a thumbnail opens lightbox; image centered, `max-width: 90vw`, `max-height: 85vh`
  - [ ] Clicking backdrop (not image/arrows) closes lightbox
  - [ ] Arrow keys and screen arrows navigate; wraps from last→first and first→last
  - [ ] ESC closes lightbox
  - [ ] Caption shows `{index+1} / {total}` and item.caption
  - [ ] Damage Report tab: shows pending state if no scope sheet; shows bullets + area cards if submitted
  - [ ] Badge on Photos tab: NOT shown on initial page load; appears after first Photos visit AND count > 0; hidden if 0 photos

- [ ] **Step 10: Commit**

  ```bash
  git add frontend/src/components/ClaimDamageReport.tsx \
          frontend/src/pages/ClaimDetail.tsx
  git commit -m "feat: add Photos and Damage Report tabs to ClaimDetail"
  ```

---

## Summary

After all chunks are complete:

| What | Where |
|------|-------|
| Backend endpoint | `GET /api/claims/:id/media` → `{ data: MediaItem[] }` |
| Service method | `InspectionService.GetMediaByClaimID` in `inspection_service.go` |
| Handler | `ClaimMediaHandler.GetMedia` in `claim_media_handler.go` |
| Frontend API | `getClaimMedia()` + `MediaItem` interface in `api.ts` |
| Photo gallery | `ClaimPhotoGallery` — lazy grid + lightbox, `enabled: isActive` |
| Damage report | `ClaimDamageReport` — deterministic bullets + area cards, no AI |
| Tab integration | Three-tab layout in `ClaimDetail` wraps all existing content in Overview tab |
