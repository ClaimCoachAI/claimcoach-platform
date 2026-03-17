# Claim Photo Gallery & Damage Report

**Date:** 2026-03-17
**Status:** Approved

## Problem

Property managers have no way to see all uploaded claim photos in one place, and no plain-English summary of what was damaged. Photos exist in the database but are never surfaced on the claim detail page.

## Solution

Two new tabs added to `ClaimDetail.tsx`: **Photos** (flat grid + lightbox) and **Damage Report** (summary + area breakdown). Existing content becomes the **Overview** tab.

## Audience

Internal: property manager / ClaimCoach user.

---

## Tab Bar

Three underline-style tabs: **Overview**, **Photos**, **Damage Report**.

- Active indicator: `--color-teal` underline, label in `--color-teal-dark`
- Inactive: `--color-slate`
- Font: Manrope
- Photos tab shows a mint count badge (`--mint-light` bg, `--teal-dark` text) once the media query has resolved. Hidden before the tab has ever been clicked (query hasn't run yet). Hidden if count is 0 after load. The badge is NOT shown on initial page load — it appears the first time the user visits the Photos tab.

---

## ClaimPhotoGallery Component

**File:** `frontend/src/components/ClaimPhotoGallery.tsx`
**Props:** `claimId: string`

**Data fetching:** React Query `useQuery(['claim-media', claimId])`, `enabled: activeTab === 'photos'`. Calls `getClaimMedia(claimId)` → `GET /api/claims/:id/media`. The tab bar stays fully interactive during load — this component owns its own loading state.

**States:**

| State | UI |
|-------|-----|
| Loading | 8 skeleton squares: `aspect-ratio: 1`, `background: --gray-100`, `border-radius: 12px`, CSS pulse animation |
| Error | "Something went wrong loading photos. Try refreshing the page." centered |
| Empty | "No photos uploaded yet. They'll appear here once your assessor completes the damage assessment." |
| Loaded | 4-column responsive grid of square thumbnails |

**Thumbnails:** `aspect-ratio: 1`, `border-radius: 12px`, `border: 1px solid --gray-200`. Hover: overlay with magnify icon (`opacity: 0 → 1`). Click: opens lightbox at that index.

**Lightbox:**

- Fixed overlay. Backdrop: `rgba(15,23,42,0.85)`.
- Only the backdrop element itself closes the lightbox — check `e.target === backdropRef.current`. Clicks on the image, arrows, counter, or caption do NOT close it.
- Centered `<img>`, `max-width: 90vw`, `max-height: 85vh`, `object-fit: contain`.
- Left/right arrow buttons positioned at sides of viewport, outside the image.
- Keyboard: `ArrowLeft` → prev, `ArrowRight` → next, `Escape` → close.
- Wraps: prev from index 0 goes to last; next from last goes to 0.
- `{index + 1} / {total}` counter + `item.caption` shown below the image.

---

## ClaimDamageReport Component

**File:** `frontend/src/components/ClaimDamageReport.tsx`
**Props:** `scopeSheet: ScopeSheet | null`

Type reference: `ScopeSheet` and `ScopeArea` are defined in `frontend/src/types/scopeSheet.ts`. Key fields used:

```ts
// ScopeSheet
is_draft: boolean
areas: ScopeArea[]

// ScopeArea
category: string           // display label, e.g. "Roof"
category_key: string       // taxonomy key, e.g. "roof"
tags: string[]             // e.g. ["Shingles_Damaged", "Gutters_Damaged"]
dimensions: Record<string, number>  // e.g. { square_footage: 1200 } or { length: 14, width: 12 }
notes: string              // empty string if none (not null)
```

**States:**

| Condition | UI |
|-----------|-----|
| `scopeSheet === null \|\| scopeSheet.is_draft === true` | "Damage report will appear once your assessor submits their scope sheet." |
| Submitted, `areas.length === 0` | "No damage areas recorded in the scope sheet." |
| Submitted, areas present | Summary card + area cards |

**Emoji:** `CATEGORY_MAP[area.category_key]?.emoji ?? '📌'`

**Import:** `import { CATEGORY_MAP } from './contractor-wizard/taxonomy'`
(`ClaimDamageReport.tsx` lives in `frontend/src/components/`, same directory as `ScopeSheetSummary.tsx` which already uses this exact import path.)

**Summary bullets — pure deterministic client-side logic, no AI:**

Group `areas` by `category_key`:

| Group | Match | Sentence template |
|-------|-------|-------------------|
| Roof | `startsWith('roof')` | `"Roof has damage across {N} section(s)."` |
| Exterior | `=== 'exterior_walls'` | `"Exterior walls show damage on {N} area(s)."` |
| Interior | `startsWith('interior_')` | `"{N} interior room(s) affected with water or structural damage."` |
| Water | `=== 'water_mitigation'` | `"Water mitigation work required."` |
| Other | anything else | One bullet **per area**: `"{label}: {tags}."` where `label = CATEGORY_MAP[area.category_key]?.label ?? area.category` and `tags = area.tags.map(t => t.replace(/_/g, ' ')).join(', ')` |

Rules:
- Skip any group with 0 matching areas (i.e., no bullet for that group).
- Pluralize: `{N} section` when N=1, `{N} sections` when N>1 (same for "area" and "room").
- Total bullets: 2–4. If Other areas push the count over 4, cap at 4 and drop remaining Other bullets.

**Area cards (one per `ScopeArea`):**

- Row: emoji (taxonomy lookup) + `area.category` + dimensions (if present)
  - `dimensions.square_footage` → `"{n} sq ft"`
  - `dimensions.length && dimensions.width` → `"{l} × {w} ft"`
- Tags: `area.tags` as mint chips (`--mint-light` bg, `--teal-dark` text), underscores replaced with spaces
- Notes: `area.notes` in italic below tags, only if `area.notes !== ''`

---

## Backend: GET /api/claims/:id/media

### New service method: `InspectionService.GetMediaByClaimID`

**Signature:** `func (s *InspectionService) GetMediaByClaimID(claimID string) ([]MediaItem, error)`

All DB logic here. Uses existing `s.db` and `s.convertFileURLToPublic`. Returns `[]MediaItem{}` (empty, not nil) if no inspection or no photos found.

**MediaItem struct** (define in `backend/internal/services/inspection_service.go` or a nearby models file):

```go
type MediaItem struct {
    URL     string `json:"url"`
    Caption string `json:"caption"`
}
```

**Step 1 — Look up inspection:**

```sql
SELECT iv2.id
FROM inspection_v2 iv2
JOIN magic_links ml ON ml.id = iv2.magic_link_id
WHERE ml.claim_id = $1 AND iv2.submitted_at IS NOT NULL
ORDER BY iv2.submitted_at DESC
LIMIT 1
```

If `sql.ErrNoRows`, return `[]MediaItem{}, nil`.

**Step 2 — Collect photos in order:**

All URL columns may be NULL — scan into `sql.NullString` and skip if not valid. `s.convertFileURLToPublic` takes and returns `*string`; pass a pointer to the scanned string.

**Roof slots** (4 document JOINs per section):

```sql
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
```

For each section, check the four URL columns in order (overview→"Overview", slope→"Slope", shingles→"Shingles", ridge→"Ridge"). Skip nulls. Apply `s.convertFileURLToPublic`. Caption: `"{sectionLabel} – {slotLabel}"`.

**Damage spots** (`photo_url` stored directly — no documents JOIN needed):

```sql
SELECT ds.roof_id, ds.photo_url, ds.sort_order, r.section_type, r.section_custom_name
FROM inspection_roof_damage_spot ds
JOIN inspection_roof r ON r.id = ds.roof_id
WHERE r.inspection_id = $1 AND ds.photo_url IS NOT NULL
ORDER BY r.sort_order, ds.sort_order
```

Caption: `"{sectionLabel} – Damage Spot {N}"` — N is 1-indexed per section. Track `currentRoofID`; when `ds.roof_id` changes, reset N to 1. Apply `s.convertFileURLToPublic`.

**Elevations** (URL via documents JOIN):

```sql
SELECT e.side, d.file_url
FROM inspection_elevation e
LEFT JOIN documents d ON d.id = e.photo_document_id
WHERE e.inspection_id = $1 AND d.file_url IS NOT NULL
ORDER BY CASE e.side WHEN 'front' THEN 1 WHEN 'right' THEN 2 WHEN 'back' THEN 3 WHEN 'left' THEN 4 END
```

Caption: capitalize first letter of `side` + `" Elevation"` e.g. `"Front Elevation"`. Apply `s.convertFileURLToPublic`.

**Room photos** (`photo_url` stored directly — no documents JOIN needed):

```sql
SELECT rp.photo_url, rp.caption, r.name
FROM inspection_room_photo rp
JOIN inspection_room r ON r.id = rp.room_id
WHERE r.inspection_id = $1 AND rp.photo_url IS NOT NULL
ORDER BY r.sort_order, r.created_at, rp.sort_order
```

Caption: `rp.caption` if non-null, else `r.name`. Apply `s.convertFileURLToPublic`.

**Caption label maps** (hardcoded in the method):

- Slot labels: `overview_photo_id → "Overview"`, `slope_photo_id → "Slope"`, `shingles_photo_id → "Shingles"`, `ridge_photo_id → "Ridge"` (index by slot position in loop)
- Section type labels: `main_house → "Main House"`, `garage → "Garage"`, `patio → "Patio"`, `carport → "Carport"`, `flat_roof → "Flat Roof"`, `other → "Other"`. If `section_custom_name` is non-null, use that instead.

---

### Handler: `backend/internal/handlers/claim_media_handler.go`

```go
type ClaimMediaHandler struct {
    claimService      *services.ClaimService
    inspectionService *services.InspectionService
}

func NewClaimMediaHandler(
    claimService *services.ClaimService,
    inspectionService *services.InspectionService,
) *ClaimMediaHandler

// GET /api/claims/:id/media
func (h *ClaimMediaHandler) GetMedia(c *gin.Context) {
    claimID := c.Param("id")
    user := c.MustGet("user").(models.User)  // confirmed pattern from document_handler.go
    orgID := user.OrganizationID

    if _, err := h.claimService.GetClaim(claimID, orgID); err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
        return
    }
    items, err := h.inspectionService.GetMediaByClaimID(claimID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
        return
    }
    c.JSON(http.StatusOK, gin.H{"data": items})  // wraps in {data:[...]} matching all other endpoints
}
```

404 for claim not found or wrong org (never distinguish). 500 on DB error.

---

### Router registration

Inside existing protected `api` group in `backend/internal/api/router.go`:

```go
claimMediaHandler := handlers.NewClaimMediaHandler(claimService, inspectionService)
api.GET("/claims/:id/media", claimMediaHandler.GetMedia)
```

Both `claimService` and `inspectionService` are already initialized earlier in `router.go`.

---

## TypeScript: `frontend/src/lib/api.ts`

```ts
export interface MediaItem {
  url: string
  caption: string
}

export async function getClaimMedia(claimId: string): Promise<MediaItem[]> {
  const response = await api.get(`/api/claims/${claimId}/media`)
  return response.data.data  // backend returns { data: [...] } — same pattern as getCarrierEstimates, getAuditReport
}
```

Follows the same axios instance and interceptor pattern as all other functions in `api.ts`. Throws on error (no silent fallback).

**Scope sheet in ClaimDetail:** The scope sheet query currently lives inside child wrapper components, not at `ClaimDetail`'s top level. Lift `useQuery(['scope-sheet', claimId])` to `ClaimDetail`'s top-level component body so the result can be passed as the `scopeSheet` prop to `<ClaimDamageReport>`. React Query deduplicates by key — no extra network request is made.

---

## Data Flow

```
ClaimDetail.tsx
  ├── activeTab: 'overview' | 'photos' | 'report'  (useState)
  ├── (existing) useQuery ['scope-sheet', claimId]  →  ScopeSheet | null
  │
  ├── Photos tab active
  │     └── <ClaimPhotoGallery claimId={claimId} />
  │           └── useQuery ['claim-media', claimId] enabled=activeTab==='photos'
  │                 └── GET /api/claims/:id/media  →  MediaItem[]
  │
  └── Damage Report tab active
        └── <ClaimDamageReport scopeSheet={scopeSheet} />
              └── no fetch — reads prop
```

---

## File Checklist

| File | Change |
|------|--------|
| `frontend/src/pages/ClaimDetail.tsx` | Add `activeTab` state, tab bar UI, conditional component render |
| `frontend/src/components/ClaimPhotoGallery.tsx` | New — grid, all states, lightbox |
| `frontend/src/components/ClaimDamageReport.tsx` | New — summary bullets + area cards |
| `frontend/src/lib/api.ts` | Add `MediaItem` interface + `getClaimMedia()` |
| `backend/internal/services/inspection_service.go` | Add `GetMediaByClaimID` + `MediaItem` struct |
| `backend/internal/handlers/claim_media_handler.go` | New thin handler |
| `backend/internal/api/router.go` | Register route in protected group |

---

## Out of Scope

- External sharing of photos or damage report
- AI-generated summaries (all logic is deterministic client-side)
- Photo upload from the claim detail page
- Filtering or searching photos
- Any changes to the Documents section
