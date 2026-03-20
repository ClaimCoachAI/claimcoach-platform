# PDF Damage Assessment — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Replace the Step 2 "Damage Assessment" experience. Instead of sending a magic link to an assessor to fill out a scope sheet, users upload a contractor's property damage estimate PDF. The AI extracts the damage scope (what was damaged, not the prices) and uses it to generate the independent ClaimCoach estimate in Step 3.

The existing magic link / scope sheet flow is **hidden, not deleted**, pending a future decision on whether to remove it entirely.

---

## User Flow

### Step 2 — Damage Assessment

**Screen 1: Upload**
- Step card header: "Damage Assessment" (same title, same CURRENT badge)
- Subtitle: "Upload your contractor's damage estimate to get started"
- PDF drag-and-drop dropzone with "Choose File" button
- Accepts PDF only, max 10MB
- On file select:
  1. Call `POST /api/claims/:id/contractor-estimate/upload-url` → get presigned URL
  2. PUT file directly to Supabase storage
  3. Call `POST /api/claims/:id/contractor-estimate/:estimateId/confirm` → creates DB record with `parse_status: pending`
  4. Show loading spinner ("Analyzing your estimate...")
  5. Call `POST /api/claims/:id/contractor-estimate/:estimateId/parse` → **synchronous**, blocks until Claude finishes (90s timeout, matching carrier estimate pattern). Returns parsed data or error directly in the response.
  6. On success: transition to Screen 2. On error: show failure state.

**Screen 2: Damage Summary (shown after successful parse response)**
- Header: "Estimate parsed from [vendor_name]" with green checkmark
- Title: "Damage found in N areas"
- Subtitle: "Here's a summary of what was damaged. We'll use this to build your independent ClaimCoach estimate."
- Damage area cards: icon + category name + one-line plain-English description
  - No item counts, no prices
- Single button: "Continue" → marks Step 2 complete, advances to Step 3

**Parse failure state (shown when `parse_status == failed` or `areas` array is empty)**
- Inline error below the dropzone: "We couldn't read that file. Make sure it's a contractor damage estimate PDF and try again."
- Upload area resets, user can try again (new upload supersedes previous)

### Step 3 — Check if Worth Filing

**Waiting state** — shown when no `contractor_estimate` record exists with `parse_status == completed`:
- Icon: 📄
- Title: "Damage Estimate Not Yet Uploaded"
- Body: "Upload your contractor's damage estimate in Step 2 to generate your ClaimCoach estimate."

**Ready state** — shown when `contractor_estimate.parse_status == completed`:
- User manually triggers ClaimCoach estimate generation via button click
- Existing generation flow runs using contractor PDF parsed data instead of scope sheet data

---

## What the AI Extracts from the PDF

Claude parses the PDF and extracts **damage scope only** — not prices. The structured output:

```json
{
  "vendor_name": "ReRoof of Texas",
  "property_address": "11131 Candle Park, San Antonio TX 78249",
  "areas": [
    {
      "category": "Roof",
      "summary": "Full shingle replacement including underlayment, flashing, and trim",
      "items": ["tear-off composition shingles", "install architectural laminate shingles", "synthetic underlayment", "drip edge", "valley metal", "pipe jack flashing", "ridge cap shingles"]
    },
    {
      "category": "Windows",
      "summary": "Broken window, damaged screens, and dented aluminum trim",
      "items": ["replace damaged window screens", "replace broken insulated window", "replace dented aluminum window trim"]
    }
  ]
}
```

The `items` array feeds `GenerateIndustryEstimate()` for pricing research. The `summary` string is shown to the user.

The parse prompt must handle both PDF formats seen in the wild:
- **Section-based** (e.g., ReRoof of Texas): named sections with line items underneath
- **Line-item invoice** (e.g., Lone Star Contractors): numbered rows with Product/Description/Qty/Rate/Amount columns

In both cases, extract the repair/replacement work described — ignore price columns entirely.

---

## Data Model

### New table: `contractor_estimates`

Separate from `carrier_estimates` (which stores the insurance company's estimate in Step 5/6). These are two distinct documents from two different parties.

```sql
CREATE TABLE contractor_estimates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            UUID NOT NULL REFERENCES claims(id),
  file_path           TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  file_size_bytes     BIGINT,
  uploaded_by_user_id UUID REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  parse_status        TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  parsed_data         JSONB,   -- structured output: vendor_name, property_address, areas[]
  parse_error         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One active record per claim. A new upload replaces the previous one (soft: new record created, old record's status is irrelevant — always use the latest by `created_at`).

### Step 3 gate condition

Step 3 checks: `GET /api/claims/:id/contractor-estimate` — if the latest record has `parse_status == completed`, the ready state is shown. No new field needed on the `claims` table.

---

## Backend Changes

### New Endpoints

```
POST   /api/claims/:id/contractor-estimate/upload-url
       → Returns presigned Supabase upload URL (PDF only, 10MB max)

POST   /api/claims/:id/contractor-estimate/:estimateId/confirm
       → Creates contractor_estimates record with parse_status: pending

POST   /api/claims/:id/contractor-estimate/:estimateId/parse
       → Synchronous. Runs Claude parsing inline (90s timeout). Returns parsed_data on success or error on failure. No jobId.

GET    /api/claims/:id/contractor-estimate
       → Returns latest contractor_estimate record for the claim (single object, not array)
```

### New Service: `ContractorEstimateService`

Mirrors `CarrierEstimateService`. New Claude prompt focused on damage scope extraction — explicitly instructs Claude to ignore all price/cost data and output only the `areas` JSON structure above.

### Update `GenerateIndustryEstimate()`

Current function reads from `ScopeSheetService.GetScopeSheetByClaimID()`. Update to auto-detect source:

1. Query for contractor estimate with `parse_status == completed`
2. If found, use `parsed_data.areas[].items` as the damage input
3. If not found, fall back to scope sheet (backward compatibility for existing claims)
4. If neither exists, return error

**Migration required for `audit_reports`:** `scope_sheet_id` is currently `NOT NULL` with `ON DELETE CASCADE`. A new migration must:
```sql
ALTER TABLE audit_reports ALTER COLUMN scope_sheet_id DROP NOT NULL;
ALTER TABLE audit_reports DROP CONSTRAINT audit_reports_scope_sheet_id_fkey;
ALTER TABLE audit_reports ADD CONSTRAINT audit_reports_scope_sheet_id_fkey
  FOREIGN KEY (scope_sheet_id) REFERENCES scope_sheets(id) ON DELETE SET NULL;
```
The `AuditReport` model's `ScopeSheetID` field changes from `string` to `*string`. All `Scan()` calls that read this column must be updated to scan into `*string`.

### Updated Text in `Step3ViabilityAnalysis.tsx`

| Old | New |
|-----|-----|
| "Waiting for Assessment Scope Sheet" | "Damage Estimate Not Yet Uploaded" |
| "The AI analysis requires the assessor's scope sheet. Send the assessment link in Step 2 and return here once submitted." | "Upload your contractor's damage estimate in Step 2 to generate your ClaimCoach estimate." |
| "Reading scope sheet" | "Reading damage estimate" |
| "Based on your scope sheet and policy" | "Based on your damage estimate and policy" |
| "Assessment scope sheet received" | "Damage estimate uploaded" |
| "Build a full ClaimCoach estimate from the scope sheet" | "Build a full ClaimCoach estimate from your damage estimate" |

---

## Hiding the Old Step 2 Flow

Hide at the **render call site** in `ClaimStepper.tsx` (or wherever `Step2ContractorModal` is mounted), not just inside the modal component itself:

```tsx
{/* HIDDEN: Magic link / scope sheet flow — replaced by PDF upload (Step 2).
    Do not delete. Pending decision on whether to remove or repurpose.
    Spec: docs/superpowers/specs/2026-03-20-pdf-damage-assessment-design.md */}
{/* <Step2ContractorModal ... /> */}
```

Also hide the "Send Assessment Link" button in `NextStepCard.tsx` if it renders independently of the modal.

---

## Out of Scope

- Editing damage areas after parsing (user cannot modify extracted items)
- Support for non-PDF formats (images, Word docs)
- Automatic Step 3 triggering — user clicks manually
- Deleting or archiving old contractor estimate records
