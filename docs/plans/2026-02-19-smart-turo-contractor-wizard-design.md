# Smart Turo Contractor Wizard — Design Doc
**Date:** 2026-02-19
**Status:** Approved — cleared for implementation
**Replaces:** Legacy 10-step flat-form contractor wizard

---

## Overview

Full replacement of the existing 10-step contractor wizard with a mobile-first, field-worker-optimized "Smart Turo" experience. The old fixed-form flow with ~40 flat database columns is replaced by a dynamic Triage → Guided Tour → Review flow backed by a JSONB data model.

**Why the old approach failed:**
- Blue-collar contractors in the field (hot roofs, flooded basements) cannot navigate desktop-style forms with tiny checkboxes
- Fixed 10-step form forces contractors to scroll past irrelevant sections (e.g., a plumber seeing roof shingle questions)
- Flat schema (~40 columns) is incompatible with dynamic category-based collection

---

## Architecture: Triage-then-Tour

### Phase 1 — Triage Screen
Single screen asking "What was affected?" User selects one or more damage categories via chunky full-width toggle tiles. Interior Rooms expands inline to sub-categories. Selecting "Start Walkthrough" locks the selection and dynamically builds the wizard step array.

### Phase 2 — Guided Tour (N steps)
One screen per selected category. Steps are generated only for selected categories — no wasted screens. Each step has:
1. Native camera trigger (`capture="environment"`) — forces live field photos, not screenshots
2. Damage tag grid — chunky toggles specific to the category
3. Optional dimension inputs (sqft or L×W)
4. Optional notes field
5. Next button

### Phase 3 — Review & Submit
Summary card per area, general notes textarea, submit button.

---

## Data Model — Approach 1: JSONB

**Decision:** JSONB column on `scope_sheets` table. Flexible, fast to build, Postgres-queryable, and ideal for direct AI estimator consumption.

### Database Schema Change

```sql
-- Drop all legacy flat columns
-- Add new flexible columns
ALTER TABLE scope_sheets
  ADD COLUMN areas JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN triage_selections JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN general_notes TEXT;

-- Drop legacy flat columns (roof_type, fascia_lf, etc.)
```

### Payload Shape

```json
{
  "areas": [
    {
      "id": "uuid",
      "category": "Roof",
      "category_key": "roof",
      "order": 1,
      "tags": ["Shingles_Damaged", "Gutters_Damaged", "Pitch_Steep"],
      "dimensions": { "square_footage": 2400 },
      "photo_ids": ["doc-uuid-1", "doc-uuid-2"],
      "notes": ""
    },
    {
      "id": "uuid",
      "category": "Kitchen",
      "category_key": "interior_kitchen",
      "order": 2,
      "tags": ["Drywall_Damaged", "Flooring_Damaged"],
      "dimensions": { "length": 15, "width": 12, "square_footage": 180 },
      "photo_ids": ["doc-uuid-3"],
      "notes": ""
    }
  ],
  "general_notes": "Water entered through roof penetration above kitchen.",
  "triage_selections": ["roof", "interior_kitchen"]
}
```

---

## Tag Taxonomy (AI Contract)

Tags are snake-case, underscore-separated, AI-readable strings. This is the shared contract between UI, DB, and AI estimator.

```
roof
  Type_3Tab_Shingle
  Type_Architectural_Shingle
  Type_Metal
  Pitch_Steep
  Shingles_Damaged
  Underlayment_Torn
  Decking_Damaged
  Vents_Damaged
  Flashing_Missing
  Gutters_Damaged
  Fascia_Damaged
  Soffit_Damaged
  Accessories_Damaged

exterior_walls
  Siding_Damaged
  Siding_Paint_Needed
  Fascia_Damaged
  Soffit_Damaged
  Gutters_Damaged
  Window_Broken
  Door_Damaged
  Trim_Damaged

interior_kitchen
  Drywall_Damaged
  Ceiling_Damaged
  Flooring_Damaged
  Cabinets_Damaged
  Appliances_Damaged

interior_bathroom
  Drywall_Damaged
  Ceiling_Damaged
  Flooring_Damaged
  Fixtures_Damaged

interior_living
  Drywall_Damaged
  Ceiling_Damaged
  Flooring_Damaged

interior_bedroom
  Drywall_Damaged
  Ceiling_Damaged
  Flooring_Damaged

water_mitigation
  Standing_Water_Present
  Baseboards_Swollen
  Drywall_Cuts_Needed
  Dehumidifiers_Needed
  Air_Movers_Needed

fencing_other
  Fence_Sections_Damaged
  Gate_Damaged
  Posts_Broken
```

---

## Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| Entry | `ContractorUpload.tsx` | Token validation (unchanged) |
| Wizard shell | `ContractorWizard.tsx` | Phase routing, state, draft save |
| State hook | `useWizardState.ts` | Full replacement — new shape |
| Phase 1 | `TriageScreen.tsx` | Chunky category toggles |
| Phase 2 | `TourStep.tsx` | Reusable per-category step |
| Taxonomy | `taxonomy.ts` | Tag definitions per category |
| Phase 3 | `ReviewScreen.tsx` | Summary + submit |

**Frontend state shape:**
```typescript
interface WizardState {
  phase: 'triage' | 'tour' | 'review'
  triageSelections: string[]
  areas: ScopeArea[]
  currentTourStep: number
  generalNotes: string
}

interface ScopeArea {
  id: string
  category: string
  category_key: string
  order: number
  tags: string[]
  dimensions: Record<string, number>
  photo_ids: string[]
  notes: string
}
```

---

## Backend Changes (Go)

### Files Changed
1. **`scope_sheets` table** — migration drops flat columns, adds JSONB columns
2. **`scope_sheet_service.go`** — marshal/unmarshal `areas` JSONB instead of flat struct scan
3. **`audit_service.go`** — `buildEstimatePrompt` iterates over `areas[]` using tags

### New AI Prompt Format
```
SCOPE SHEET DATA:
- Area: Roof
  Damage tags: Shingles_Damaged, Gutters_Damaged, Pitch_Steep
  Square footage: 2,400 sq ft

- Area: Kitchen
  Damage tags: Drywall_Damaged, Flooring_Damaged
  Dimensions: 15 x 12 ft (180 sq ft)
```

---

## Order of Implementation

1. **Database migration** — drop flat columns, add JSONB columns
2. **Backend refactor** — `scope_sheet_service.go`, `audit_service.go`
3. **Frontend refactor** — new wizard components
