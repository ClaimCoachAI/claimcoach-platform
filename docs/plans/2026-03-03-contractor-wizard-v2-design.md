# Contractor Wizard V2 — Design Document
**Date:** 2026-03-03
**Status:** Approved

---

## Overview

Replace the existing `ScopeSheetForm.tsx` + contractor wizard with a new **Guided Tour Builder** — a structured, mobile-first multi-step wizard that walks contractors through a property damage inspection step by step.

The new wizard lives at `/contractor/v2/:token` (isolated from the live `/contractor/:token` flow) and is built in 5 vertical slices. Once all slices are complete and tested, the magic link email will be updated to point to the new route.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Replacement strategy | Full replace (not additive) | Old flat schema is incompatible with new dynamic entity model |
| Backend schema | New tables (MVP subset) | New UI requires dynamic elevations/rooms as entities, not flat columns |
| Existing data | Clean break | Users will delete old claims and create new ones |
| Magic link flow | Preserved | Contractor still receives email → secure link → fills wizard |
| Routing | `/contractor/v2/:token` until fully tested | Zero downtime, zero regressions on live flow |

---

## Wizard Steps

| Slice | Screen | Description |
|-------|--------|-------------|
| 1 | **Quick Setup** | Address (pre-filled), property type, stories, area selection |
| 2 | **Elevations** | Per side (Front/Right/Back/Left): siding damage, gutters, windows, doors |
| 3 | **Roof** | Per section (Main/Other): type, pitch, measurements, penetrations |
| 4 | **Room-by-Room** | Dimensions, surfaces, insulation, fixtures per room |
| 5 | **Data Check** | Missing items, hints/help, submit to ClaimCoach |

---

## Architecture

### Frontend

```
frontend/src/pages/ContractorUploadV2.tsx
frontend/src/components/contractor-wizard-v2/
  ContractorWizardV2.tsx       ← wizard shell + step routing
  WizardV2Progress.tsx         ← progress bar
  useWizardV2State.ts          ← shared state + API calls
  types.ts                     ← TypeScript types
  steps/
    QuickSetupStep.tsx         ← Slice 1
    ElevationsStep.tsx         ← Slice 2
    RoofStep.tsx               ← Slice 3
    RoomsStep.tsx              ← Slice 4
    DataCheckStep.tsx          ← Slice 5
```

New route in `App.tsx`:
```tsx
<Route path="/contractor/v2/:token" element={<ContractorUploadV2 />} />
```

### Backend

New endpoints (no auth required, token-validated):
```
GET  /api/magic-links/:token/v2/inspection         ← load draft or claim pre-fill data
POST /api/magic-links/:token/v2/inspection         ← save Quick Setup (Slice 1)
POST /api/magic-links/:token/v2/inspection/elevations/:side   ← Slice 2
POST /api/magic-links/:token/v2/inspection/roof/:section      ← Slice 3
POST /api/magic-links/:token/v2/inspection/rooms              ← Slice 4
POST /api/magic-links/:token/v2/inspection/submit             ← Slice 5
```

New Go files:
```
backend/internal/models/inspection.go
backend/internal/handlers/inspection_handler.go
backend/internal/services/inspection_service.go
```

---

## Database Schema (MVP Subset)

### Migration 000017 — Slice 1

```sql
CREATE TABLE inspection_v2 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  magic_link_id   UUID NOT NULL REFERENCES magic_links(id),
  property_type   TEXT CHECK (property_type IN ('sfh','duplex','small_mf','mf','commercial_light')),
  stories         INT,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','in_progress','submitted')),
  current_step    INT NOT NULL DEFAULT 1,
  submitted_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_area_selection (
  inspection_id       UUID PRIMARY KEY REFERENCES inspection_v2(id) ON DELETE CASCADE,
  include_roof        BOOL NOT NULL DEFAULT false,
  include_exterior    BOOL NOT NULL DEFAULT false,
  include_interior    BOOL NOT NULL DEFAULT false,
  include_porch       BOOL NOT NULL DEFAULT false
);
```

### Future migrations (one per slice)
- `000018` — `inspection_elevation` (Slice 2)
- `000019` — `inspection_roof_section` (Slice 3)
- `000020` — `inspection_room`, `room_opening`, `room_damage_selection`, `room_features` (Slice 4)

---

## Slice 1: Quick Setup — Detailed Design

### Go Model (`models/inspection.go`)

```go
type InspectionV2 struct {
    ID            string                   `json:"id" db:"id"`
    ClaimID       string                   `json:"claim_id" db:"claim_id"`
    MagicLinkID   string                   `json:"magic_link_id" db:"magic_link_id"`
    PropertyType  *string                  `json:"property_type" db:"property_type"`
    Stories       *int                     `json:"stories" db:"stories"`
    Status        string                   `json:"status" db:"status"`
    CurrentStep   int                      `json:"current_step" db:"current_step"`
    AreaSelection *InspectionAreaSelection `json:"area_selection"`
}

type InspectionAreaSelection struct {
    IncludeRoof     bool `json:"include_roof"`
    IncludeExterior bool `json:"include_exterior"`
    IncludeInterior bool `json:"include_interior"`
    IncludePorch    bool `json:"include_porch"`
}
```

### API Endpoints

| Method | Endpoint | Behavior |
|--------|----------|----------|
| `GET` | `/api/magic-links/:token/v2/inspection` | Returns existing draft if found, or claim address for pre-fill |
| `POST` | `/api/magic-links/:token/v2/inspection` | Upserts inspection + area selection, advances `current_step` to 2 |

POST body:
```json
{
  "property_type": "sfh",
  "stories": 2,
  "area_selection": {
    "include_roof": true,
    "include_exterior": true,
    "include_interior": false,
    "include_porch": false
  }
}
```

### Frontend: `QuickSetupStep.tsx`

UI elements (mobile-first, matches mockup):
- **Address bar** — pre-filled from claim, read-only
- **Property type cards** — SFH / Duplex / Small MF / MF / Commercial (icon grid, single select)
- **Stories picker** — 1 2 3 4 5 tap-to-select row
- **Area checkboxes** — Roof / Exterior / Interior / Porch·Patio·Fence
- **Continue →** — orange CTA, disabled until at least one area is checked

### Frontend: `useWizardV2State.ts`

Manages:
- `inspectionId` — set after first successful POST
- `currentStep` — 1–5, drives which step component is rendered
- `propertyType`, `stories`, `areaSelection` — Quick Setup fields
- Auto-saves draft on field change (debounced 800ms via PATCH)

---

## What's Out of Scope (v1)

Per the MVP subset recommendation:
- `damage_item` table
- `inspection_quantity_snapshot` (compute live instead)
- `estimate_snapshot_json`
- `audit_log`
- `help_article` / `help_context_map` (Data Check hints are hardcoded for v1)
