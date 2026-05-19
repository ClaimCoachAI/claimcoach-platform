# Design: Auto-Generate PDF Report on ClaimCoach Estimate

**Date:** 2026-05-19
**Status:** Approved (v3 — post spec-review corrections)

## Summary

When `ProcessEstimateJob` completes successfully, automatically generate a PDF version of the estimate and store it in the claim's Documents tab so users can view and download it.

## Requirements

### Included
- PDF generated inline after estimate is saved in `ProcessEstimateJob` (same Lambda invocation)
- PDF content: claim header (property address, claim ID, date generated) + line items table + justifications + subtotal/O&P/grand total
- PDF stored in Supabase Storage and surfaced in the Documents tab as `document_type = "audit_report"`
- PDF downloadable via existing `GET /api/documents/:id` → presigned URL flow
- PDF generation failure is non-blocking: estimate succeeds, failure is logged as a warning
- DB migration required to add `audit_report` to the `documents_document_type_check` constraint

### Excluded
- ClaimCoach branding/logo
- On-demand re-generation endpoint
- Async/background generation

## Architecture

### New Component: `PDFReportService`

Located at `backend/internal/services/pdf_report_service.go`.

Responsibilities:
1. Parse `estimateJSON` into a typed `EstimateReport` struct (see below)
2. Render PDF bytes using `go-pdf/fpdf` (already in go.mod)
3. Upload PDF bytes directly to Supabase Storage via a new `UploadFile` method on `SupabaseStorage`
4. Insert a confirmed `documents` record into the DB

Dependencies injected at construction: `*sql.DB`, `*storage.SupabaseStorage`.

### Integration Point

In `AuditService.ProcessEstimateJob`, after `updateAuditReportCompleted` succeeds (line ~454). `source` is already in scope at this point (set earlier in the function via `resolveEstimateSource`).

```go
// 7. Persist completed estimate
if err := s.updateAuditReportCompleted(ctx, auditReportID, estimateJSON); err != nil {
    return fmt.Errorf("failed to save completed estimate: %w", err)
}

// Non-blocking PDF generation
if s.pdfReportService != nil {
    if err := s.pdfReportService.GenerateAndStore(ctx, claimID, orgID, userID, auditReportID, estimateJSON, source.propertyAddress); err != nil {
        log.Printf("Warning: failed to generate PDF report for auditReportID=%s: %v", auditReportID, err)
    }
}
```

`AuditService` gains a `pdfReportService *PDFReportService` field, injected in `NewAuditService`.

### Wiring

`NewAuditService` has ONE call site: `backend/internal/api/router.go:111`. The Lambda handler gets its `auditService` from `api.NewRouter`, so updating `router.go` is sufficient — no other wiring changes needed.

```go
// Before
auditService := services.NewAuditService(db, llmClient, searchClient, scopeSheetService, asyncInvoker)

// After
pdfReportService := services.NewPDFReportService(db, storageClient)
auditService := services.NewAuditService(db, llmClient, searchClient, scopeSheetService, asyncInvoker, pdfReportService)
```

`storageClient` is already instantiated in `router.go` (used by `DocumentService`).

### Storage Path

```
organizations/{org-id}/claims/{claim-id}/audit_report/claimcoach-estimate_{reportID[:8]}.pdf
```

### Document Record

`file_size_bytes` is set to `int64(len(pdfBytes))` after generation (size is only known post-render, unlike the client-upload path where size is declared upfront). `uploaded_by_user_id` is the `userID` parameter from `ProcessEstimateJob` — it is always a valid UUID in this code path.

```sql
INSERT INTO documents (id, claim_id, uploaded_by_user_id, document_type, file_url,
  file_name, file_size_bytes, mime_type, status, created_at)
VALUES (..., 'audit_report', <filePath>, 'ClaimCoach Estimate Report.pdf',
  int64(len(pdfBytes)), 'application/pdf', 'confirmed', NOW())
```

## PDF Layout

### Header
- Title: "ClaimCoach Estimate Report"
- Property Address
- Claim ID (short form: first 8 chars)
- Date Generated (formatted as "January 2, 2006")

### Line Items Table

Columns: Xactimate Code | Description | Qty | Unit | Unit Cost | Total

- Items grouped by `category` with a shaded category header row
- Justification text rendered as a smaller italic line beneath each item's description row

### Footer Summary
Right-aligned block:
- Subtotal
- Overhead & Profit (20%)
- **Grand Total**

## Data Structures

### EstimateReport (Go struct for parsing LLM JSON output)

Define these as unexported types in `backend/internal/services/pdf_report_service.go`:

```go
type estimateLineItem struct {
    XactimateCode string  `json:"xactimate_code"`
    Description   string  `json:"description"`
    Quantity      float64 `json:"quantity"`
    Unit          string  `json:"unit"`
    UnitCost      float64 `json:"unit_cost"`
    Total         float64 `json:"total"`
    Category      string  `json:"category"`
    Justification string  `json:"justification"`
}

type estimateReport struct {
    LineItems      []estimateLineItem `json:"line_items"`
    Subtotal       float64            `json:"subtotal"`
    OverheadProfit float64            `json:"overhead_profit"`
    Total          float64            `json:"total"`
}
```

## Storage: New `UploadFile` Method

Add to `backend/internal/storage/supabase.go`. The `Upsert: true` ensures re-running an estimate overwrites the previous PDF at the same path. Add the `boolPtr` helper in the same file since `storage_go.FileOptions.Upsert` is `*bool`.

```go
func (s *SupabaseStorage) UploadFile(filePath string, data []byte, mimeType string) error {
    upsert := true
    _, err := s.client.UploadFile(BucketName, filePath, bytes.NewReader(data),
        storage_go.FileOptions{ContentType: &mimeType, Upsert: &upsert})
    return err
}
```

Add `"bytes"` to the imports in `supabase.go`.

## Data Model Changes

### `models/document.go`
Add constant:
```go
DocumentTypeAuditReport = "audit_report"
```

Add to `ValidDocumentTypes` slice and to `FileValidationRules` map (PDF, 25MB max). Note: `PDFReportService` bypasses `RequestUploadURL` entirely, so these additions are defensive only — they don't affect the PDF insert path. Without a `FileValidationRules` entry, `ValidateFile` would reject `audit_report` if anyone tried to use the normal upload flow for this type.

### DB Migration

**Check first:** Verify no `000030_*.sql` file exists in `backend/internal/database/migrations/` before naming these files.

**`000030_add_audit_report_document_type.up.sql`:**

Required — the `documents.document_type` column has a DB-level `CHECK` constraint (`documents_document_type_check`). Without this migration, the documents INSERT will fail with a constraint violation.

```sql
ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;

ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
CHECK (document_type IN (
    'policy_pdf',
    'contractor_photo',
    'contractor_estimate',
    'carrier_estimate',
    'proof_of_repair',
    'other',
    'pa_contract',
    'letter_of_representation',
    'carrier_acknowledgement',
    'audit_report'
));
```

**`000030_add_audit_report_document_type.down.sql`:**

```sql
ALTER TABLE documents DROP CONSTRAINT documents_document_type_check;

ALTER TABLE documents ADD CONSTRAINT documents_document_type_check
CHECK (document_type IN (
    'policy_pdf',
    'contractor_photo',
    'contractor_estimate',
    'carrier_estimate',
    'proof_of_repair',
    'other',
    'pa_contract',
    'letter_of_representation',
    'carrier_acknowledgement'
));
```

## Estimated Impact

- ~50–200ms added to estimate generation (fpdf is CPU-fast; Supabase upload is the main variable)
- One DB migration required
- No frontend changes required (Documents tab already renders all confirmed documents)
