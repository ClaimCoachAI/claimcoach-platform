# Legal Package ZIP — Implementation Plan
**Date:** 2026-02-26

## Key Facts From Codebase

- `github.com/go-pdf/fpdf` is **already in `go.mod`** as an indirect dep — just needs promotion
- Document types from `models/document.go`: `policy_pdf`, `contractor_photo`, `contractor_estimate`, `carrier_estimate`, `proof_of_repair`, `other`
- Carrier estimates live in a separate `carrier_estimates` table (not `documents`), use `file_path`
- Storage downloads: `storage.GenerateDownloadURL(filePath)` → signed URL → `http.Get()`
- Audit/PMBrain data: `auditService.GetAuditReportByClaimID()` already fetches it all
- Phase 4 UI lives in `Step6AdjudicationEngine.tsx` — ZIP button goes between briefing box and yellow instruction banner

---

## Task Execution Order

```
Task 1 (go get fpdf)
  └── Task 2 (LegalPackageService)
        └── Task 3 (LegalPackageHandler)
              └── Task 4 (register route in router.go)
                    └── Task 5 (api.ts: downloadLegalPackage)
                          └── Task 6 (Step6 UI: ZIP button)
```

---

## Task 1 — Promote fpdf to a direct dependency

**Command** (run from `backend/`):
```
go get github.com/go-pdf/fpdf@v0.9.0
```

Updates `go.mod` (removes `// indirect`) and `go.sum`. No code changes needed.

---

## Task 2 — Create `LegalPackageService`

**File to create:** `backend/internal/services/legal_package_service.go`

**Struct + constructor:**
```go
type LegalPackageService struct {
    db           *sql.DB
    storage      *storage.SupabaseStorage
    auditService *AuditService
}

func NewLegalPackageService(db *sql.DB, storageClient *storage.SupabaseStorage, auditService *AuditService) *LegalPackageService
```

**`GenerateLegalPackage(ctx, claimID, orgID string) ([]byte, string, error)`:**

1. **Load claim** — SQL joining `claims → properties → insurance_policies`, verify `p.organization_id = orgID`. Fields: claim number, property address, loss type, incident date, carrier name, policy number.

2. **Load audit report** — call `auditService.GetAuditReportByClaimID(ctx, claimID, orgID)`. Return 400 error if nil or PMBrainAnalysis is nil.

3. **Generate attorney briefing PDF** — use `fpdf.New("P", "mm", "A4", "")`. Replicate `buildAttorneyBriefing()` from the frontend:
   - Header: `LEGAL REFERRAL ONE-PAGER`
   - Section 1: Claim Snapshot
   - Section 2: Executive Summary (from PMBrainAnalysis)
   - Section 3: Financial Summary (contractor estimate, carrier offer, delta)
   - Section 4: Key Dispute Issues (top_delta_drivers + coverage_disputes)
   - Section 5: Requested Legal Outcome
   - Section 6: Attachments Index
   - Output to `bytes.Buffer`

4. **Load documents from DB:**
   ```sql
   SELECT id, document_type, file_url, file_name
   FROM documents
   WHERE claim_id = $1 AND status = 'confirmed'
   ORDER BY document_type, created_at DESC
   ```
   Also query `carrier_estimates` table for most recent confirmed estimate (`file_path`, `file_name`).

5. **Fetch files from Supabase Storage** — for each doc: `storage.GenerateDownloadURL(filePath)` → `http.Get()` → bytes. On individual failure: log warning and skip (don't fail whole ZIP).

6. **Assemble ZIP** using `archive/zip` (stdlib):

   | Folder | Document Types |
   |--------|---------------|
   | `1-Legal-Brief/Attorney-Briefing.pdf` | PDF from step 3 (always included) |
   | `2-Carrier-Documents/` | `carrier_estimate` docs + carrier_estimates table |
   | `3-ClaimCoach-Documents/` | `contractor_estimate` at root, `contractor_photo` in `photos/` |
   | `4-Policy-Documents/` | `policy_pdf` |
   | `5-Additional-Evidence/` | `proof_of_repair`, `other` |

   Skip empty folders (except `1-Legal-Brief/`).

7. **Return** `(zipBytes, filename, nil)` where filename = `ClaimCoach-Legal-Package-{claimNumber}-{YYYY-MM-DD}.zip`

---

## Task 3 — Create `LegalPackageHandler`

**File to create:** `backend/internal/handlers/legal_package_handler.go`

```go
type LegalPackageHandler struct {
    service *services.LegalPackageService
}

func NewLegalPackageHandler(service *services.LegalPackageService) *LegalPackageHandler

func (h *LegalPackageHandler) Download(c *gin.Context)
```

Handler logic:
- Extract `user.OrganizationID` and `claimID` from context
- Call `service.GenerateLegalPackage()`
- On error: return 400 (audit required), 404 (not found), or 500
- On success: set `Content-Disposition`, `Content-Type: application/zip`, `Content-Length` headers, write bytes with `c.Data(200, "application/zip", zipBytes)`

---

## Task 4 — Register route in `router.go`

**File to modify:** `backend/internal/api/router.go`

After `auditService` instantiation (line ~87), add:
```go
legalPackageService := services.NewLegalPackageService(db, storageClient, auditService)
legalPackageHandler := handlers.NewLegalPackageHandler(legalPackageService)
```

Inside the protected `api` group, after audit routes:
```go
// Legal Package routes
api.GET("/claims/:id/legal-package/download", legalPackageHandler.Download)
```

---

## Task 5 — Add `downloadLegalPackage` to `frontend/src/lib/api.ts`

**File to modify:** `frontend/src/lib/api.ts`

Add after `generateOwnerPitch`:
```typescript
export const downloadLegalPackage = async (claimId: string): Promise<void> => {
  const response = await api.get(`/api/claims/${claimId}/legal-package/download`, {
    responseType: 'blob',
  })

  const contentDisposition = response.headers['content-disposition'] as string | undefined
  let filename = `ClaimCoach-Legal-Package-${claimId}.zip`
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/)
    if (match?.[1]) filename = match[1]
  }

  const url = URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

---

## Task 6 — Add ZIP button to Phase 4 in `Step6AdjudicationEngine.tsx`

**File to modify:** `frontend/src/components/Step6AdjudicationEngine.tsx`

**6a.** Add `downloadLegalPackage` to the existing import from `../lib/api`.

**6b.** Add state variables:
```typescript
const [isDownloadingZip, setIsDownloadingZip] = useState(false)
const [zipDownloadError, setZipDownloadError] = useState<string | null>(null)
```

**6c.** Insert between the attorney briefing card close tag and the yellow instruction banner (Phase 4 block):
```tsx
{/* ZIP Download Button */}
{zipDownloadError && (
  <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
    {zipDownloadError}
  </div>
)}
<button
  onClick={async () => {
    setIsDownloadingZip(true)
    setZipDownloadError(null)
    try {
      await downloadLegalPackage(claim.id)
    } catch (err: any) {
      setZipDownloadError(
        err?.response?.data?.error || err?.message || 'Failed to generate ZIP. Please try again.'
      )
    } finally {
      setIsDownloadingZip(false)
    }
  }}
  disabled={isDownloadingZip}
  style={{
    width: '100%', padding: '14px 24px',
    background: isDownloadingZip ? '#374151' : '#111827',
    color: '#fff', border: 'none', borderRadius: 8,
    fontWeight: 700, cursor: isDownloadingZip ? 'not-allowed' : 'pointer',
    fontSize: 15, opacity: isDownloadingZip ? 0.7 : 1, marginBottom: 12,
  }}
>
  {isDownloadingZip ? '⏳ Generating ZIP…' : '⬇ Download Case Files (ZIP)'}
</button>
```

**Final Phase 4 layout:**
1. Attorney Briefing text box + Copy button (unchanged)
2. ⬇ Download Case Files (ZIP) button ← NEW
3. Yellow instruction banner (unchanged)
4. ✓ I Have Sent This to My Attorney button (unchanged)
