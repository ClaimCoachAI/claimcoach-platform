# Estimate PDF Report Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `ProcessEstimateJob` completes, automatically generate a PDF of the ClaimCoach estimate and store it in the claim's Documents tab.

**Architecture:** A new `PDFReportService` is injected into `AuditService` and called non-blockingly after the estimate is persisted in `ProcessEstimateJob`. It renders the PDF via `go-pdf/fpdf`, uploads bytes directly to Supabase Storage, and inserts a confirmed `documents` record. A DB migration adds `audit_report` to the `document_type` CHECK constraint.

**Tech Stack:** Go, `go-pdf/fpdf` (already in go.mod), `supabase-community/storage-go`, `DATA-DOG/go-sqlmock` (tests), `stretchr/testify` (tests)

**Spec:** `docs/superpowers/specs/2026-05-19-estimate-pdf-report-design.md`

---

## Chunk 1: Foundation — Migration, Model, Storage

### Task 1: DB migration — add `audit_report` to document_type CHECK constraint

**Files:**
- Create: `backend/internal/database/migrations/000030_add_audit_report_document_type.up.sql`
- Create: `backend/internal/database/migrations/000030_add_audit_report_document_type.down.sql`

- [ ] **Step 1.1: Verify no 000030 migration exists**

```bash
ls backend/internal/database/migrations/000030_* 2>/dev/null && echo "CONFLICT" || echo "OK to create"
```
Expected: `OK to create`

- [ ] **Step 1.2: Create the up migration**

Create `backend/internal/database/migrations/000030_add_audit_report_document_type.up.sql`:

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

- [ ] **Step 1.3: Create the down migration**

Create `backend/internal/database/migrations/000030_add_audit_report_document_type.down.sql`:

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

- [ ] **Step 1.4: Commit**

```bash
git add backend/internal/database/migrations/000030_add_audit_report_document_type.up.sql \
        backend/internal/database/migrations/000030_add_audit_report_document_type.down.sql
git commit -m "feat: add audit_report document type migration"
```

---

### Task 2: Add `DocumentTypeAuditReport` constant to models

**Files:**
- Modify: `backend/internal/models/document.go`

The `document_type` column has a DB CHECK constraint (updated by Task 1). The Go constants, `ValidDocumentTypes` slice, and `FileValidationRules` map must match. `PDFReportService` bypasses `RequestUploadURL`, so the `FileValidationRules` entry is defensive only — but omitting it would cause `ValidateFile` to reject `audit_report` if the type is ever used via the normal upload flow.

- [ ] **Step 2.1: Read the current model file**

Read `backend/internal/models/document.go` in full before editing.

- [ ] **Step 2.2: Add constant**

In the `DocumentType*` constants block, add:
```go
DocumentTypeAuditReport = "audit_report"
```

- [ ] **Step 2.3: Add to ValidDocumentTypes slice**

Append `DocumentTypeAuditReport` to the `ValidDocumentTypes` var slice.

- [ ] **Step 2.4: Add to FileValidationRules map**

Add entry to `FileValidationRules`:
```go
DocumentTypeAuditReport: {
    MaxSizeBytes: 25 * 1024 * 1024, // 25MB
    MimeTypes:    []string{"application/pdf"},
},
```

- [ ] **Step 2.5: Run model tests**

```bash
cd backend && go test ./internal/models/... -v
```
Expected: all PASS (verifies the file compiles correctly).

- [ ] **Step 2.6: Commit**

```bash
git add backend/internal/models/document.go
git commit -m "feat: add audit_report document type constant"
```

---

### Task 3: Add `UploadFile` method to `SupabaseStorage`

**Files:**
- Modify: `backend/internal/storage/supabase.go`
- Test: `backend/internal/storage/supabase_test.go`

The existing storage client only supports client-side uploads via presigned URLs. This adds a server-side direct upload for PDF bytes. Uses upsert so re-running an estimate overwrites the previous PDF at the same path.

Note: `SupabaseStorage` requires live credentials and cannot be instantiated in unit tests. The test below is a **compile-time interface check only** — it verifies the method signature exists and is correct. This is the right trade-off here since the method body is a thin wrapper over the storage client.

- [ ] **Step 3.1: Write a compile-check test**

In `backend/internal/storage/supabase_test.go`, add:

```go
// TestUploadFileCompileCheck is a compile-time interface satisfaction check.
// SupabaseStorage cannot be instantiated without live credentials, so this verifies
// the UploadFile method exists with the correct signature without making network calls.
func TestUploadFileCompileCheck(t *testing.T) {
    // This line fails to compile if UploadFile does not exist or has the wrong signature.
    var _ interface {
        UploadFile(filePath string, data []byte, mimeType string) error
    } = (*SupabaseStorage)(nil)
}
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd backend && go test ./internal/storage/... -run TestUploadFileCompileCheck -v
```
Expected: compile error — `*SupabaseStorage` does not implement the interface (method missing).

- [ ] **Step 3.3: Read supabase.go before editing**

Read `backend/internal/storage/supabase.go` in full before editing.

- [ ] **Step 3.4: Add `UploadFile` method**

Add `"bytes"` to the import block in `supabase.go`, then add this method at the end of the file:

```go
// UploadFile uploads raw bytes directly to storage (server-side upload).
// Uses upsert so re-uploading to the same path overwrites the existing file.
// Note: error wrapping is intentionally added here (not in the spec) for better diagnostics.
func (s *SupabaseStorage) UploadFile(filePath string, data []byte, mimeType string) error {
    upsert := true
    _, err := s.client.UploadFile(BucketName, filePath, bytes.NewReader(data),
        storage_go.FileOptions{ContentType: &mimeType, Upsert: &upsert})
    if err != nil {
        return fmt.Errorf("failed to upload file: %w", err)
    }
    return nil
}
```

- [ ] **Step 3.5: Run test to verify it passes**

```bash
cd backend && go test ./internal/storage/... -run TestUploadFileCompileCheck -v
```
Expected: PASS

- [ ] **Step 3.6: Confirm full storage test suite passes**

```bash
cd backend && go test ./internal/storage/... -v
```
Expected: all PASS

- [ ] **Step 3.7: Commit**

```bash
git add backend/internal/storage/supabase.go backend/internal/storage/supabase_test.go
git commit -m "feat: add UploadFile method to SupabaseStorage for server-side uploads"
```

---

## Chunk 2: PDFReportService

### Task 4: Create `PDFReportService`

**Files:**
- Create: `backend/internal/services/pdf_report_service.go`
- Create: `backend/internal/services/pdf_report_service_test.go`

This is the core of the feature. The service parses the estimate JSON, renders a PDF with `fpdf`, uploads it to storage via the `fileUploader` interface (injectable in tests), and inserts a `documents` DB record.

- [ ] **Step 4.1: Write the failing tests**

Create `backend/internal/services/pdf_report_service_test.go`:

```go
package services

import (
    "context"
    "encoding/json"
    "fmt"
    "testing"

    sqlmock "github.com/DATA-DOG/go-sqlmock"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// mockUploader implements the fileUploader interface used by PDFReportService.
type mockUploader struct {
    uploadedPath string
    uploadedData []byte
    uploadedMime string
    err          error
}

func (m *mockUploader) UploadFile(filePath string, data []byte, mimeType string) error {
    m.uploadedPath = filePath
    m.uploadedData = data
    m.uploadedMime = mimeType
    return m.err
}

func sampleEstimateJSON(t *testing.T) string {
    t.Helper()
    report := estimateReport{
        LineItems: []estimateLineItem{
            {
                XactimateCode: "RFG 300S",
                Description:   "Laminated shingles",
                Quantity:      25,
                Unit:          "SQ",
                UnitCost:      120.00,
                Total:         3000.00,
                Category:      "Roofing",
                Justification: "Full replacement required due to hail impact.",
            },
        },
        Subtotal:       3000.00,
        OverheadProfit: 600.00,
        Total:          3600.00,
    }
    b, err := json.Marshal(report)
    require.NoError(t, err)
    return string(b)
}

func TestPDFReportService_GenerateAndStore_Success(t *testing.T) {
    db, mock, err := sqlmock.New()
    require.NoError(t, err)
    defer db.Close()

    uploader := &mockUploader{}
    svc := NewPDFReportService(db, uploader)

    claimID := "claim-1234"
    orgID := "org-5678"
    userID := "user-9999"
    reportID := "report-abcd"
    address := "123 Main St, Houston, TX 77001"
    estimateJSON := sampleEstimateJSON(t)

    // Expect the documents INSERT
    mock.ExpectExec(`INSERT INTO documents`).
        WithArgs(
            sqlmock.AnyArg(), // id
            claimID,
            userID,
            "audit_report",
            sqlmock.AnyArg(), // file_url (storage path)
            "ClaimCoach Estimate Report.pdf",
            sqlmock.AnyArg(), // file_size_bytes
            "application/pdf",
            "confirmed",
            sqlmock.AnyArg(), // created_at
        ).
        WillReturnResult(sqlmock.NewResult(1, 1))

    err = svc.GenerateAndStore(context.Background(), claimID, orgID, userID, reportID, estimateJSON, address)
    assert.NoError(t, err)

    // Verify upload was called with correct path and mime type
    assert.NotEmpty(t, uploader.uploadedPath)
    assert.Contains(t, uploader.uploadedPath, "audit_report")
    assert.Contains(t, uploader.uploadedPath, reportID[:8])
    assert.Equal(t, "application/pdf", uploader.uploadedMime)
    assert.Greater(t, len(uploader.uploadedData), 0)

    // Verify all DB expectations met
    assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPDFReportService_GenerateAndStore_InvalidJSON(t *testing.T) {
    db, _, err := sqlmock.New()
    require.NoError(t, err)
    defer db.Close()

    svc := NewPDFReportService(db, &mockUploader{})

    err = svc.GenerateAndStore(context.Background(), "c1", "o1", "u1", "r1", "not-json", "addr")
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "failed to parse estimate JSON")
}

func TestPDFReportService_GenerateAndStore_UploadFails(t *testing.T) {
    db, _, err := sqlmock.New()
    require.NoError(t, err)
    defer db.Close()

    uploader := &mockUploader{err: fmt.Errorf("storage unavailable")}
    svc := NewPDFReportService(db, uploader)

    err = svc.GenerateAndStore(context.Background(), "c1", "o1", "u1", "r1", sampleEstimateJSON(t), "addr")
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "failed to upload PDF")
}

func TestParseEstimateJSON(t *testing.T) {
    input := sampleEstimateJSON(t)
    report, err := parseEstimateJSON(input)
    require.NoError(t, err)
    assert.Equal(t, 1, len(report.LineItems))
    assert.Equal(t, "RFG 300S", report.LineItems[0].XactimateCode)
    assert.Equal(t, "Roofing", report.LineItems[0].Category)
    assert.Equal(t, 3600.00, report.Total)
}
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/services/... -run "TestPDFReportService|TestParseEstimateJSON" -v 2>&1 | head -30
```
Expected: compile error — `PDFReportService`, `estimateReport`, `estimateLineItem`, `parseEstimateJSON` not defined.

- [ ] **Step 4.3: Create `pdf_report_service.go`**

Create `backend/internal/services/pdf_report_service.go`:

```go
package services

import (
    "bytes"
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "time"

    "github.com/claimcoach/backend/internal/models"
    "github.com/go-pdf/fpdf"
    "github.com/google/uuid"
)

// fileUploader abstracts storage so tests can inject a mock.
type fileUploader interface {
    UploadFile(filePath string, data []byte, mimeType string) error
}

// estimateLineItem mirrors the LLM JSON output for a single line item.
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

// estimateReport mirrors the top-level LLM JSON output structure.
type estimateReport struct {
    LineItems      []estimateLineItem `json:"line_items"`
    Subtotal       float64            `json:"subtotal"`
    OverheadProfit float64            `json:"overhead_profit"`
    Total          float64            `json:"total"`
}

// PDFReportService generates and stores PDF estimate reports.
type PDFReportService struct {
    db       *sql.DB
    uploader fileUploader
}

// NewPDFReportService creates a PDFReportService. Pass a *storage.SupabaseStorage as the uploader
// in production; pass a mock in tests.
func NewPDFReportService(db *sql.DB, uploader fileUploader) *PDFReportService {
    return &PDFReportService{db: db, uploader: uploader}
}

// GenerateAndStore renders a PDF from the estimate JSON and persists it as a document.
// Returns an error on failure; the caller logs it as a warning (non-blocking).
func (s *PDFReportService) GenerateAndStore(
    ctx context.Context,
    claimID, orgID, userID, reportID, estimateJSON, propertyAddress string,
) error {
    report, err := parseEstimateJSON(estimateJSON)
    if err != nil {
        return err
    }

    pdfBytes, err := renderPDF(report, claimID, propertyAddress)
    if err != nil {
        return fmt.Errorf("failed to render PDF: %w", err)
    }

    filePath := fmt.Sprintf("organizations/%s/claims/%s/audit_report/claimcoach-estimate_%s.pdf",
        orgID, claimID, reportID[:8])

    mimeType := "application/pdf"
    if err := s.uploader.UploadFile(filePath, pdfBytes, mimeType); err != nil {
        return fmt.Errorf("failed to upload PDF: %w", err)
    }

    return s.insertDocumentRecord(ctx, claimID, userID, filePath, int64(len(pdfBytes)))
}

// parseEstimateJSON unmarshals the LLM JSON estimate into a typed struct.
func parseEstimateJSON(raw string) (*estimateReport, error) {
    var report estimateReport
    if err := json.Unmarshal([]byte(raw), &report); err != nil {
        return nil, fmt.Errorf("failed to parse estimate JSON: %w", err)
    }
    return &report, nil
}

// renderPDF builds the PDF bytes from the estimate data.
func renderPDF(report *estimateReport, claimID, propertyAddress string) ([]byte, error) {
    pdf := fpdf.New("P", "mm", "A4", "")
    pdf.SetMargins(15, 15, 15)
    pdf.AddPage()

    pageW, _ := pdf.GetPageSize()
    contentW := pageW - 30 // 15mm margins each side

    // --- Header ---
    pdf.SetFont("Arial", "B", 18)
    pdf.SetTextColor(15, 52, 96) // navy
    pdf.CellFormat(contentW, 10, "ClaimCoach Estimate Report", "", 1, "L", false, 0, "")

    pdf.SetFont("Arial", "", 10)
    pdf.SetTextColor(80, 80, 80)
    if propertyAddress != "" {
        pdf.CellFormat(contentW, 6, propertyAddress, "", 1, "L", false, 0, "")
    }
    pdf.CellFormat(contentW/2, 6,
        fmt.Sprintf("Claim ID: %s", shortID(claimID)), "", 0, "L", false, 0, "")
    pdf.CellFormat(contentW/2, 6,
        fmt.Sprintf("Generated: %s", time.Now().Format("January 2, 2006")), "", 1, "R", false, 0, "")
    pdf.Ln(6)

    // --- Table header ---
    colWidths := [6]float64{28, 62, 14, 14, 22, 22}
    headers := [6]string{"Code", "Description", "Qty", "Unit", "Unit Cost", "Total"}

    pdf.SetFillColor(230, 245, 245) // light teal
    pdf.SetFont("Arial", "B", 9)
    pdf.SetTextColor(15, 52, 96)
    for i, h := range headers {
        pdf.CellFormat(colWidths[i], 7, h, "1", 0, "C", true, 0, "")
    }
    pdf.Ln(-1)

    // --- Group items by category, preserving insertion order ---
    categoryOrder := []string{}
    byCategory := map[string][]estimateLineItem{}
    for _, item := range report.LineItems {
        if _, exists := byCategory[item.Category]; !exists {
            categoryOrder = append(categoryOrder, item.Category)
        }
        byCategory[item.Category] = append(byCategory[item.Category], item)
    }

    for _, cat := range categoryOrder {
        // Category header row
        pdf.SetFillColor(240, 240, 240)
        pdf.SetFont("Arial", "B", 9)
        pdf.SetTextColor(60, 60, 60)
        pdf.CellFormat(contentW, 6, " "+cat, "1", 1, "L", true, 0, "")

        // Item rows
        pdf.SetFont("Arial", "", 8)
        pdf.SetTextColor(30, 30, 30)
        for _, item := range byCategory[cat] {
            pdf.SetFillColor(255, 255, 255)
            pdf.CellFormat(colWidths[0], 6, item.XactimateCode, "1", 0, "C", false, 0, "")
            pdf.CellFormat(colWidths[1], 6, truncate(item.Description, 38), "1", 0, "L", false, 0, "")
            pdf.CellFormat(colWidths[2], 6, fmt.Sprintf("%.1f", item.Quantity), "1", 0, "R", false, 0, "")
            pdf.CellFormat(colWidths[3], 6, item.Unit, "1", 0, "C", false, 0, "")
            pdf.CellFormat(colWidths[4], 6, fmt.Sprintf("$%.2f", item.UnitCost), "1", 0, "R", false, 0, "")
            pdf.CellFormat(colWidths[5], 6, fmt.Sprintf("$%.2f", item.Total), "1", 1, "R", false, 0, "")

            // Justification as italic sub-line
            if item.Justification != "" {
                pdf.SetFont("Arial", "I", 7)
                pdf.SetTextColor(100, 100, 100)
                pdf.CellFormat(colWidths[0], 5, "", "", 0, "", false, 0, "")
                pdf.MultiCell(contentW-colWidths[0], 5,
                    truncate(item.Justification, 120), "", "L", false)
                pdf.SetFont("Arial", "", 8)
                pdf.SetTextColor(30, 30, 30)
            }
        }
    }

    pdf.Ln(4)

    // --- Summary footer ---
    summaryX := pageW - 15 - 80
    pdf.SetFont("Arial", "", 9)
    pdf.SetTextColor(60, 60, 60)

    printSummaryRow := func(label string, amount float64, bold bool) {
        if bold {
            pdf.SetFont("Arial", "B", 10)
            pdf.SetTextColor(15, 52, 96)
        }
        pdf.SetX(summaryX)
        pdf.CellFormat(50, 7, label, "", 0, "L", false, 0, "")
        pdf.CellFormat(30, 7, fmt.Sprintf("$%.2f", amount), "T", 1, "R", false, 0, "")
        if bold {
            pdf.SetFont("Arial", "", 9)
            pdf.SetTextColor(60, 60, 60)
        }
    }

    printSummaryRow("Subtotal", report.Subtotal, false)
    printSummaryRow("Overhead & Profit (20%)", report.OverheadProfit, false)
    printSummaryRow("Grand Total", report.Total, true)

    var buf bytes.Buffer
    if err := pdf.Output(&buf); err != nil {
        return nil, fmt.Errorf("fpdf output failed: %w", err)
    }
    return buf.Bytes(), nil
}

// insertDocumentRecord inserts a confirmed documents record for the generated PDF.
func (s *PDFReportService) insertDocumentRecord(
    ctx context.Context,
    claimID, userID, filePath string,
    fileSize int64,
) error {
    query := `
        INSERT INTO documents (
            id, claim_id, uploaded_by_user_id, document_type, file_url,
            file_name, file_size_bytes, mime_type, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `
    _, err := s.db.ExecContext(ctx, query,
        uuid.New().String(),
        claimID,
        userID,
        models.DocumentTypeAuditReport,
        filePath,
        "ClaimCoach Estimate Report.pdf",
        fileSize,
        "application/pdf",
        "confirmed",
        time.Now(),
    )
    if err != nil {
        return fmt.Errorf("failed to insert document record: %w", err)
    }
    return nil
}

// shortID returns the first 8 characters of a UUID string.
func shortID(id string) string {
    if len(id) < 8 {
        return id
    }
    return id[:8]
}

// truncate cuts a string to maxLen characters, appending "…" if truncated.
func truncate(s string, maxLen int) string {
    if len(s) <= maxLen {
        return s
    }
    return s[:maxLen-1] + "…"
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
cd backend && go test ./internal/services/... -run "TestPDFReportService|TestParseEstimateJSON" -v
```
Expected: all PASS

- [ ] **Step 4.5: Run full services test suite**

```bash
cd backend && go test ./internal/services/... -v 2>&1 | tail -20
```
Expected: all PASS (no regressions)

- [ ] **Step 4.6: Commit**

```bash
git add backend/internal/services/pdf_report_service.go \
        backend/internal/services/pdf_report_service_test.go
git commit -m "feat: add PDFReportService for generating estimate PDF reports"
```

---

## Chunk 3: Integration — Wire into AuditService and Router

### Task 5: Inject `PDFReportService` into `AuditService`

**Files:**
- Modify: `backend/internal/services/audit_service.go`
- Create: `backend/internal/services/audit_service_test.go`

- [ ] **Step 5.1: Write the wiring test first**

Create `backend/internal/services/audit_service_test.go`:

```go
package services

import (
    "testing"

    sqlmock "github.com/DATA-DOG/go-sqlmock"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// TestNewAuditService_PDFServiceWired verifies the pdfReportService field is correctly
// assigned by NewAuditService after the constructor signature change.
func TestNewAuditService_PDFServiceWired(t *testing.T) {
    db, _, err := sqlmock.New()
    require.NoError(t, err)
    defer db.Close()

    pdfSvc := &PDFReportService{}
    svc := NewAuditService(db, nil, nil, nil, nil, pdfSvc)
    assert.NotNil(t, svc.pdfReportService)
}
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd backend && go test ./internal/services/... -run TestNewAuditService_PDFServiceWired -v
```
Expected: compile error — `NewAuditService` does not accept 6 arguments yet.

- [ ] **Step 5.3: Read audit_service.go before editing**

Read `backend/internal/services/audit_service.go` lines 1–50 to confirm the current struct and constructor.

- [ ] **Step 5.4: Add field to `AuditService` struct**

In the `AuditService` struct, add:
```go
pdfReportService *PDFReportService
```

- [ ] **Step 5.5: Update `NewAuditService` signature and body**

Change the function signature to accept `pdfReportService *PDFReportService` as the last parameter, and assign it in the return:

```go
func NewAuditService(db *sql.DB, llmClient LLMClient, searchClient LLMClient, scopeService *ScopeSheetService, asyncInvoker AsyncInvoker, pdfReportService *PDFReportService) *AuditService {
    return &AuditService{
        db:               db,
        llmClient:        llmClient,
        searchClient:     searchClient,
        scopeService:     scopeService,
        asyncInvoker:     asyncInvoker,
        pdfReportService: pdfReportService,
    }
}
```

- [ ] **Step 5.6: Run the wiring test**

```bash
cd backend && go test ./internal/services/... -run TestNewAuditService_PDFServiceWired -v
```
Expected: PASS (the services package compiles independently of `router.go`; the full binary build is broken until Task 6).

- [ ] **Step 5.7: Hook PDF generation into `ProcessEstimateJob`**

After the `updateAuditReportCompleted` call succeeds (step 7 in `ProcessEstimateJob`, around line 454), add the non-blocking PDF call. Insert it between `updateAuditReportCompleted` and `logAPIUsage`:

```go
// Generate PDF report (non-blocking — failure only logs a warning)
if s.pdfReportService != nil {
    if err := s.pdfReportService.GenerateAndStore(ctx, claimID, orgID, userID, auditReportID, estimateJSON, source.propertyAddress); err != nil {
        log.Printf("Warning: failed to generate PDF report for auditReportID=%s: %v", auditReportID, err)
    }
}
```

- [ ] **Step 5.8: Verify services package still compiles**

```bash
cd backend && go build ./internal/services/...
```
Expected: PASS (services package is self-consistent; only `router.go` is now broken).

---

### Task 6: Update router wiring

**Files:**
- Modify: `backend/internal/api/router.go`

- [ ] **Step 6.1: Read router.go before editing**

Read `backend/internal/api/router.go` lines 95–115 to confirm the current service construction.

- [ ] **Step 6.2: Wire `PDFReportService` and pass to `NewAuditService`**

Replace the current `NewAuditService` call (line 111) with:

```go
pdfReportService := services.NewPDFReportService(db, storageClient)
auditService := services.NewAuditService(db, llmClient, searchClient, scopeSheetService, asyncInvoker, pdfReportService)
```

`storageClient` is already constructed earlier in `router.go` (used by `documentService`). `*storage.SupabaseStorage` satisfies the `fileUploader` interface since it now has `UploadFile`.

- [ ] **Step 6.3: Full compile check**

```bash
cd backend && go build ./...
```
Expected: clean build, no errors.

- [ ] **Step 6.4: Run full test suite**

```bash
cd backend && go test ./... 2>&1 | tail -30
```
Expected: all PASS, no regressions.

- [ ] **Step 6.5: Commit**

```bash
git add backend/internal/services/audit_service.go \
        backend/internal/services/audit_service_test.go \
        backend/internal/api/router.go
git commit -m "feat: wire PDFReportService into AuditService — auto-generate estimate PDF on completion"
```

---

## Final Verification

- [ ] **Run the full backend test suite one more time**

```bash
cd backend && go test ./... -count=1 2>&1 | tail -20
```
Expected: all PASS

- [ ] **Manual smoke test (optional, requires deployed environment)**

1. Generate a ClaimCoach estimate for a claim that has a scope sheet or contractor estimate
2. Navigate to the Documents tab for that claim
3. Verify "ClaimCoach Estimate Report.pdf" appears in the list
4. Click to download and confirm the PDF opens with line items, justifications, and totals
