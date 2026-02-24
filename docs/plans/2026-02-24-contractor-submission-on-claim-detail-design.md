# Contractor Submission on Claim Detail — Design

**Date:** 2026-02-24
**Status:** Approved

## Problem

When a contractor completes the wizard via a magic link, their scope sheet data (damage areas, tags, dimensions, notes) and uploaded photos are stored correctly in the database but are never displayed to the property manager on the claim detail page. The property manager has no way to see what the contractor submitted without downloading files manually.

The scope sheet data also needs to be accessible for a future LLM step that will use it to generate audit reports.

## Solution

Add a **Contractor Submission** section to `ClaimDetail.tsx` that surfaces the scope sheet and contractor photos whenever a contractor has submitted.

## Architecture

### No backend changes needed

All required endpoints already exist:
- `GET /api/claims/:id/scope-sheet` — returns submitted scope sheet with areas, tags, dimensions, notes
- `GET /api/claims/:id/documents` — already fetched by ClaimDetail; filter for `contractor_photo` type

### Frontend changes

**1. `ContractorSubmissionWrapper` (new component in `ClaimDetail.tsx`)**

- Fetches scope sheet using query key `['scope-sheet', claimId]` (shared cache with `AuditSectionWrapper`)
- Only renders when scope sheet exists and `submitted_at` is set (not a draft)
- Renders `ScopeSheetSummary` with the scope sheet
- Below that, renders a simple photo list filtered from the `documents` prop

**2. `ScopeSheetSummary.tsx` (two small tweaks)**

- Add per-area `notes` rendering below tags for each area (the `notes` field on `ScopeArea` is currently unused)
- Remove the misleading footer text: "Complete scope sheet details are available in the documents section"

**3. Placement in `ClaimDetail.tsx`**

Inserted between the Documents section and Magic Link History — always visible when a submitted scope sheet exists, regardless of claim status.

## Data Flow

```
ClaimDetail already fetches:
  documents[]  via  GET /api/claims/:id/documents

ContractorSubmissionWrapper fetches:
  scopeSheet   via  GET /api/claims/:id/scope-sheet  (shared cache)

Renders:
  ScopeSheetSummary(scopeSheet)
    └── areas: category emoji, name, tags, dimensions, per-area notes
    └── general_notes (if present)

  Contractor Photos section
    └── documents.filter(d => d.document_type === 'contractor_photo')
    └── Simple list: file name | upload date | Download link
    └── Empty state if no photos
```

## What the property manager sees

- Section header: "Contractor Submission"
- Submitted date and contractor name (from scope sheet metadata)
- Each damage area with: emoji, category name, damage tags, dimensions, notes
- General notes (if any)
- List of uploaded photos with download links

## Out of scope

- Photo thumbnails or lightbox (simple list with download is sufficient)
- Editing scope sheet data from the agent view (read-only)
- LLM integration (separate future step)
