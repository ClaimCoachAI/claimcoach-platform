# Roof Sections — Design Doc

**Date:** 2026-03-06
**Status:** Approved

## Problem

The current Roof step in Contractor Wizard V2 supports only one roof per inspection. Properties commonly have multiple roofing systems (e.g., main house with 3-tab shingles, a flat patio roof, and a detached shed with modified bitumen). Assessors need to document each system independently with its own photos, measurements, and damage assessment. The step also lacks penetrations and complexity fields, which are required for accurate estimates.

## Solution

Replace the single-roof form with a **summary-first, multi-section** UI. Each roof section is an independent DB row. The assessor creates sections by type, fills in the detail form for each one, and continues when at least one section is complete.

---

## Database

**Migration 000023** — alter `inspection_roof`:

- Drop `UNIQUE (inspection_id)` constraint (was 1-per-inspection; now many)
- Add `section_type TEXT CHECK ('main_house','garage','patio','carport','flat_roof','other')`
- Add `section_custom_name TEXT` — populated only when `section_type = 'other'`
- Add `penetrations TEXT CHECK ('0_3','4_7','8_plus')`
- Add `complexity TEXT CHECK ('simple','moderate','complex')`
- Add `sort_order INT NOT NULL DEFAULT 0`

`inspection_roof_damage_spot` is unchanged.

---

## Backend API

New endpoints added to the existing magic-link public route group, following the rooms pattern:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/magic-links/:token/roof-sections` | List all sections |
| `POST` | `/api/magic-links/:token/roof-sections` | Create new section |
| `PATCH` | `/api/magic-links/:token/roof-sections/:roofId` | Update section fields |
| `DELETE` | `/api/magic-links/:token/roof-sections/:roofId` | Delete section |
| `POST` | `/api/magic-links/:token/roof-sections/:roofId/damage-spots` | Add damage photo |
| `DELETE` | `/api/magic-links/:token/roof-sections/:roofId/damage-spots/:spotId` | Remove damage photo |

**Create body:**
```json
{ "section_type": "main_house", "section_custom_name": null }
```

**Patch body** (partial update, all fields optional):
```json
{
  "pitch": "6_12",
  "shingle_type": "3tab",
  "layers": 1,
  "squares": 18,
  "penetrations": "4_7",
  "complexity": "moderate",
  "has_ridge_damage": true,
  "has_valley_damage": false,
  "has_flashing_damage": false,
  "decking_condition": "good",
  "notes": "..."
}
```

Implementation lives in `inspection_service.go` / `inspection_handler.go`, following the CTE-upsert-with-JOIN pattern used for elevations and rooms. Router updated in `api/router.go`.

---

## Frontend

### Types (`types.ts`)

Four new fields added to `RoofData`:

```typescript
section_type: 'main_house' | 'garage' | 'patio' | 'carport' | 'flat_roof' | 'other' | null
section_custom_name: string | null   // only when section_type = 'other'
penetrations: '0_3' | '4_7' | '8_plus' | null
complexity: 'simple' | 'moderate' | 'complex' | null
sort_order: number
```

### State (`useWizardV2State.ts`)

- `roof: RoofData | null` → `roofSections: RoofData[]`
- Add `createRoofSection(type, customName?)` — POST, appends to list
- Add `deleteRoofSection(roofId)` — DELETE, removes from list
- Existing `onSaveRoof` / `onAddDamageSpot` / `onDeleteDamageSpot` updated to accept `roofId`

### `RoofStep.tsx` — two screens

**Screen A: Section List (default)**

- Header: "Roof" / "Step 3 of 5"
- Each section shown as a card: section label + completion status (✓ Done / "X of 4 photos")
- Tapping a card opens Screen B for that section
- "+ Add Roof Section" button → type picker bottom sheet:
  - Options: Main House / Garage / Patio / Carport / Flat Roof / Other
  - "Other" reveals a text input for the custom name
  - Confirming creates the section row and immediately opens Screen B
- Continue button enabled when ≥ 1 section has all 4 required photos uploaded

**Screen B: Section Detail form**

- Back arrow returns to Screen A
- Read-only section type label at top
- Required photos: 2×2 grid (Overview, Slope, Shingles, Ridge) — same as current
- Roof Details: Pitch, Shingle Type, Layers, Squares — same as current
- **NEW — Penetrations pill row:** `0–3` / `4–7` / `8+`
- **NEW — Complexity pill row:** `Simple` / `Moderate` / `Complex`
- Damage flags: Ridge / Valley / Flashing — same as current
- Decking Condition — same as current
- Damage Photos gallery (shown when any damage flag = true) — same as current
- Notes — same as current
- "Delete this section" destructive link at bottom with confirmation prompt

### Completion logic

A section is **Done** when all 4 named photo slots (`overview_photo_id`, `slope_photo_id`, `shingles_photo_id`, `ridge_photo_id`) are non-null.

---

## Out of Scope

- Reordering sections (drag-to-reorder)
- Per-section named photo replacement from the summary screen
- Estimate impact display (complexity/penetrations affect price but estimate UI is separate)
