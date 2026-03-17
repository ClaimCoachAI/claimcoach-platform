# Claim Photo Gallery & Damage Report

**Date:** 2026-03-17
**Status:** Approved

## Problem

Inside a claim, users have no way to see all uploaded photos in one place, and there is no human-readable summary of what was damaged. Photos exist in the database (tied to roof sections, elevations, and rooms) but are never surfaced to the property manager on the claim detail page. The scope sheet summary shows tags but is not easy for a non-technical user to read.

## Solution

Add two new tabs to `ClaimDetail.tsx` — **Photos** and **Damage Report** — sitting alongside the existing content (now called **Overview**). The photo gallery is a flat grid of all claim photos. The damage report is a plain-English summary + area-by-area breakdown derived from the submitted scope sheet.

## Audience

Internal: property manager / ClaimCoach user viewing a specific claim.

## Design

### Tab Bar

`ClaimDetail.tsx` gets a tab bar with three tabs:

- **Overview** — existing content (progress bar, claim journey steps, scope sheet summary, documents, meetings, payments, etc.)
- **Photos** — flat photo grid with lightbox
- **Damage Report** — plain-English summary + area breakdown

Tab bar uses underline-style active indicator in `--color-teal`. Active tab label in `--color-teal-dark`. Inactive in `--color-slate`. Tabs use Manrope font to match existing UI. Photo count shown as a mint badge on the Photos tab.

### ClaimPhotoGallery Component

**Location:** `frontend/src/components/ClaimPhotoGallery.tsx`

- Fetches `GET /v1/claims/:id/media` via React Query, enabled only when Photos tab is active (lazy load).
- Renders a 4-column responsive grid of square thumbnails.
- Each thumbnail has a hover overlay with a magnify icon.
- Clicking a thumbnail opens a full-screen lightbox overlay:
  - Darkened backdrop
  - Centered image, constrained to viewport
  - Left/right arrow buttons to navigate prev/next
  - Keyboard: `ArrowLeft`, `ArrowRight`, `Escape`
  - Click outside image to close
- Empty state: shown if no photos yet ("No photos uploaded yet. They'll appear here once your assessor completes the damage assessment.")
- Photo count badge on the tab updates once data loads.

### ClaimDamageReport Component

**Location:** `frontend/src/components/ClaimDamageReport.tsx`

- Receives the `scopeSheet: ScopeSheet | null` prop — already fetched in `ClaimDetail`, no extra API call.
- If `scopeSheet` is null or `is_draft === true`: placeholder state ("Damage report will appear once your assessor submits their scope sheet.").
- If submitted:
  - **Summary card** (top): 2–4 plain-English bullet points generated client-side from the scope areas. Each bullet describes a category of damage in simple language (e.g., "Roof has hail damage across 2 sections with ridge and flashing impact.").
  - **Damage by Area** (below): one card per `ScopeArea` showing emoji + area name, dimensions (if present), damage tags (styled as mint chips), and notes (if present).

Summary bullet generation logic: group areas by high-level category (roof, exterior, interior), count areas per group, and produce one sentence per group. Pure client-side — no AI call.

### Backend: Media Endpoint

**Route:** `GET /v1/claims/:id/media`
**Handler location:** `backend/internal/handlers/` (new file `claim_media_handler.go`)

Returns a flat list of all photo URLs associated with the claim's inspection:

```json
[
  { "url": "https://...", "caption": "Overview" },
  { "url": "https://...", "caption": "Front Elevation" }
]
```

**Query logic:**
1. Verify caller belongs to the claim's organization (same auth pattern as existing claim handlers).
2. Look up the `inspection_v2` record for the claim.
3. If no inspection exists, return `[]`.
4. Collect photos from:
   - Roof sections: `overview_photo_url`, `slope_photo_url`, `shingles_photo_url`, `ridge_photo_url` (skip nulls)
   - Roof damage spots: `photo_url` (skip nulls)
   - Elevations: `photo_url` (skip nulls)
   - Room photos: join `inspection_rooms` → `inspection_room_photos`, collect `photo_url`
5. Return the flat array. Caption is derived from the source (slot name or room name).

No new database tables or migrations required.

## Data Flow

```
ClaimDetail.tsx
  ├── (existing) useQuery: GET /v1/claims/:id/scope-sheet  →  ScopeSheet
  ├── (new) activeTab state: 'overview' | 'photos' | 'report'
  │
  ├── Photos tab active?
  │     └── ClaimPhotoGallery
  │           └── useQuery (enabled: activeTab==='photos')
  │                 └── GET /v1/claims/:id/media  →  MediaItem[]
  │
  └── Damage Report tab active?
        └── ClaimDamageReport
              └── receives scopeSheet prop (already loaded, no extra fetch)
```

## File Checklist

| File | Change |
|------|--------|
| `frontend/src/pages/ClaimDetail.tsx` | Add tab state, tab bar UI, render new components per tab |
| `frontend/src/components/ClaimPhotoGallery.tsx` | New — photo grid + lightbox |
| `frontend/src/components/ClaimDamageReport.tsx` | New — summary + area cards |
| `frontend/src/lib/api.ts` | Add `getClaimMedia(claimId)` function |
| `backend/internal/handlers/claim_media_handler.go` | New — GET /v1/claims/:id/media |
| `backend/internal/router/` or equivalent | Register new route |

## Out of Scope

- Sharing photos or damage report externally (no public link)
- AI-generated summaries (summary is derived from scope sheet data only)
- Photo upload from this page (photos are uploaded by the assessor via the contractor wizard)
- Filtering or searching photos
- Documents tab (already exists in the Overview tab)
