# Legal Package ZIP — Design Doc
**Date:** 2026-02-26

## Overview

When a claim reaches LEGAL_REVIEW and the PM reaches Phase 4 (Attorney Briefing), they need to send a formal legal handoff to their attorney. The handoff consists of two parts:

1. **Email body (existing):** The rich "Legal Referral One-Pager" text (cover letter) — kept exactly as-is so the attorney can evaluate the case on their phone before opening the ZIP.
2. **Email attachment (new):** A downloadable ZIP file containing a generated attorney briefing PDF + all claim documents organized into categorized folders.

---

## Backend

### New endpoint
`GET /api/claims/:id/legal-package/download` (protected, authenticated)

Returns `application/zip` binary stream with header:
`Content-Disposition: attachment; filename="ClaimCoach-Legal-Package-{claimNumber}-{date}.zip"`

### New service: `LegalPackageService`
Single method: `GenerateLegalPackage(claimID, orgID string) ([]byte, string, error)`

**Step 1 — Load all data:**
- Claim + Property + Policy
- Audit report (including `pm_brain` JSON for financial data)
- Scope sheet
- All documents for the claim (fetched from `documents` table, categorized by type)

**Step 2 — Generate attorney briefing PDF:**
- Use `go-pdf/fpdf` (pure Go, no system deps)
- Replicate the frontend `buildAttorneyBriefing()` logic server-side
- Sections: Claim Snapshot, Executive Summary, Financial Summary, Key Dispute Issues, Requested Legal Outcome, Attachments Index
- Target: clean 1-page PDF

**Step 3 — Fetch attachments from Supabase Storage:**
- Download each file by category using presigned/signed URLs
- Categories: carrier estimate PDFs, policy PDF, contractor photos, scope sheet docs, additional evidence (vendor reports, mitigation invoices)
- Skip categories with no uploaded files (no empty folders in ZIP)

**Step 4 — Assemble ZIP:**
```
ClaimCoach-Legal-Package-{claimNumber}/
├── 1-Legal-Brief/
│   └── Attorney-Briefing.pdf
├── 2-Carrier-Documents/
│   └── {carrier estimate PDFs, denial letters, EOBs}
├── 3-ClaimCoach-Documents/
│   ├── {scope sheet}
│   └── photos/
│       └── {contractor photos}
├── 4-Policy-Documents/
│   └── {policy PDF, dec pages, endorsements}
└── 5-Additional-Evidence/
    └── {vendor reports, mitigation invoices}
```

**Step 5 — Stream ZIP:**
- Build in-memory using `bytes.Buffer` + `archive/zip` (stdlib, no new deps)
- Write to `gin.Context` response with correct headers

### New handler: `LegalPackageHandler`
- `Download(c *gin.Context)` — validates auth/ownership, calls service, streams response

### New route (in `router.go`):
```go
api.GET("/claims/:id/legal-package/download", legalPackageHandler.Download)
```

### New dependency:
```
github.com/go-pdf/fpdf v2 (pure Go PDF generation)
```

---

## Frontend

### New API function (`frontend/src/lib/api.ts`)
```ts
downloadLegalPackage(claimId: string): Promise<void>
```
- GET request with `responseType: 'blob'`
- Creates object URL, triggers browser download, then revokes URL

### UI update (`Step6AdjudicationEngine.tsx` — Phase 4 only)

**No changes to the attorney briefing text box** — the rich Legal Referral One-Pager text remains exactly as-is (acts as email cover letter).

**Add below the text box:**
- `"⬇ Download Case Files (ZIP)"` button — distinct styling (solid dark button, not outline)
- Loading state while ZIP is being generated on server
- Error state if download fails

**Layout order (Phase 4):**
1. Attorney Briefing text box + Copy button (unchanged)
2. `"⬇ Download Case Files (ZIP)"` button ← NEW
3. `"✓ I Have Sent This to My Attorney"` acknowledgment button (unchanged)

---

## Data Flow

```
PM clicks "Download Case Files (ZIP)"
  → Frontend: GET /api/claims/:id/legal-package/download
    → Handler: validates auth, extracts claimID
      → LegalPackageService.GenerateLegalPackage()
        → Load claim/property/policy/audit/documents
        → Generate PDF (fpdf)
        → Fetch files from Supabase Storage
        → Assemble ZIP (archive/zip)
        → Return []byte
    → Handler: stream ZIP bytes with correct headers
  → Frontend: blob → object URL → trigger download
```

---

## Error Handling

- Missing audit report → 400 "Audit report required before generating legal package"
- No documents uploaded → ZIP still generated with just the attorney briefing PDF (documents folders omitted)
- Individual file fetch failure → skip that file, log warning, continue (don't fail the whole ZIP)
- PDF generation failure → 500

---

## Out of Scope (MVP)

- Storing the generated ZIP in Supabase Storage
- Emailing the ZIP automatically via SendGrid
- Download history/audit trail
