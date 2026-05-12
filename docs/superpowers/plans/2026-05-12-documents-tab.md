# Documents Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Documents tab to the claim detail page where PAs can upload, view, download, and delete all documents for a claim.

**Architecture:** New `ClaimDocuments.tsx` component (self-contained, owns its own data fetching) mounts when the `documents` tab is active in `ClaimDetail.tsx`. Backend adds three new PA-specific document types and a DELETE endpoint. Three new API helpers in `api.ts` wrap the existing presigned-URL upload pattern.

**Tech Stack:** Go/Gin (backend), React/TypeScript, TanStack Query v5, Supabase Storage

**Spec:** `docs/superpowers/specs/2026-05-12-documents-tab-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/internal/models/document.go` | Modify | Add 3 new document type constants + FileValidationRules entries |
| `backend/internal/services/document_service.go` | Modify | Add `DeleteDocument` method |
| `backend/internal/handlers/document_handler.go` | Modify | Add `DeleteDocument` handler |
| `backend/internal/api/router.go` | Modify | Register DELETE route |
| `frontend/src/lib/api.ts` | Modify | Add `uploadClaimDocument`, `getClaimDocumentDownloadUrl`, `deleteClaimDocument` |
| `frontend/src/components/ClaimDocuments.tsx` | Create | Full Documents tab component |
| `frontend/src/pages/ClaimDetail.tsx` | Modify | Add tab, mount component, remove old section, make `ContractorSubmissionWrapper` self-contained, clean up dead state |

---

## Chunk 1: Backend — New Document Types + DELETE Endpoint

### Task 1: Add new document type constants and validation rules

**Files:**
- Modify: `backend/internal/models/document.go`

- [ ] **Step 1: Add constants**

  Open `backend/internal/models/document.go`. After the existing `DocumentTypeOther` constant, add:

  ```go
  DocumentTypePAContract               = "pa_contract"
  DocumentTypeLetterOfRepresentation   = "letter_of_representation"
  DocumentTypeCarrierAcknowledgement   = "carrier_acknowledgement"
  ```

- [ ] **Step 2: Add to FileValidationRules**

  In the `FileValidationRules` map, add three entries (PDF only, 25MB — same as `DocumentTypePolicyPDF`):

  ```go
  DocumentTypePAContract: {
      MaxSizeBytes: 25 * 1024 * 1024,
      MimeTypes:    []string{"application/pdf"},
  },
  DocumentTypeLetterOfRepresentation: {
      MaxSizeBytes: 25 * 1024 * 1024,
      MimeTypes:    []string{"application/pdf"},
  },
  DocumentTypeCarrierAcknowledgement: {
      MaxSizeBytes: 25 * 1024 * 1024,
      MimeTypes:    []string{"application/pdf"},
  },
  ```

- [ ] **Step 3: Add to ValidDocumentTypes slice**

  Append to the `ValidDocumentTypes` var:

  ```go
  DocumentTypePAContract,
  DocumentTypeLetterOfRepresentation,
  DocumentTypeCarrierAcknowledgement,
  ```

- [ ] **Step 4: Run existing model tests**

  ```bash
  cd backend && go test ./internal/models/... -v
  ```

  Expected: all pass (or no test file — that's fine too).

- [ ] **Step 5: Commit**

  ```bash
  git add backend/internal/models/document.go
  git commit -m "feat: add PA-specific document types (pa_contract, letter_of_representation, carrier_acknowledgement)"
  ```

---

### Task 2: Add DeleteDocument service method

**Files:**
- Modify: `backend/internal/services/document_service.go`

- [ ] **Step 1: Write the failing test**

  Open `backend/internal/handlers/claim_handler_test.go` — note the `setupTestDB` and `cleanupTables` helpers there. There's no dedicated document service test file yet; add the test to the existing document handler test file (or create a new one following the same pattern). Add this test to `backend/internal/handlers/document_handler_test.go` (create the file if it doesn't exist):

  ```go
  package handlers

  import (
      "net/http"
      "net/http/httptest"
      "strings"
      "testing"

      "github.com/claimcoach/backend/internal/models"
      "github.com/claimcoach/backend/internal/services"
      "github.com/claimcoach/backend/internal/storage"
      "github.com/gin-gonic/gin"
      "github.com/stretchr/testify/assert"
  )

  func newDocumentHandler(t *testing.T) (*DocumentHandler, func()) {
      db := setupTestDB(t)
      storageClient, err := storage.NewSupabaseStorage("http://localhost", "fake-key")
      assert.NoError(t, err)
      propertySvc := services.NewPropertyService(db)
      policySvc := services.NewPolicyService(db, storageClient, propertySvc)
      claimSvc := services.NewClaimService(db, propertySvc, policySvc)
      docSvc := services.NewDocumentService(db, storageClient, claimSvc)
      h := NewDocumentHandler(docSvc)
      return h, func() { db.Close() }
  }

  func newDocumentTestRouter(h *DocumentHandler) *gin.Engine {
      gin.SetMode(gin.TestMode)
      r := gin.New()
      r.Use(func(c *gin.Context) {
          auth := c.GetHeader("Authorization")
          if auth == "" {
              c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
              c.Abort()
              return
          }
          parts := strings.Split(auth, " ")
          if len(parts) != 2 || parts[0] != "Bearer" {
              c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
              c.Abort()
              return
          }
          userID := parts[1]
          realDB := h.service.GetDB()
          var user models.User
          err := realDB.QueryRow(`
              SELECT id, organization_id, email, name, role, created_at, updated_at
              FROM users WHERE id = $1
          `, userID).Scan(
              &user.ID, &user.OrganizationID, &user.Email,
              &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
          )
          if err != nil {
              c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
              c.Abort()
              return
          }
          c.Set("user", user)
          c.Next()
      })
      r.DELETE("/api/claims/:id/documents/:documentId", h.DeleteDocument)
      return r
  }

  func TestDeleteDocument_NoAuth(t *testing.T) {
      h, cleanup := newDocumentHandler(t)
      defer cleanup()
      r := newDocumentTestRouter(h)

      req, _ := http.NewRequest("DELETE", "/api/claims/some-claim/documents/some-doc", nil)
      w := httptest.NewRecorder()
      r.ServeHTTP(w, req)

      assert.Equal(t, http.StatusUnauthorized, w.Code)
  }

  func TestDeleteDocument_NotFound(t *testing.T) {
      h, cleanup := newDocumentHandler(t)
      defer cleanup()

      // Create org, user, property, policy, claim (no document)
      // Uses helpers from claim_handler_test.go (same package)
      db := h.service.GetDB()
      orgID, userID, _ := createAuthenticatedUser(t, db)
      propID := createTestProperty(t, db, orgID)
      policyID := createTestPolicy(t, db, propID, 1000.0)
      claimID := createTestClaim(t, db, propID, policyID, orgID, userID)

      r := newDocumentTestRouter(h)
      req, _ := http.NewRequest("DELETE", "/api/claims/"+claimID+"/documents/nonexistent-doc", nil)
      req.Header.Set("Authorization", "Bearer "+userID)
      w := httptest.NewRecorder()
      r.ServeHTTP(w, req)

      assert.Equal(t, http.StatusNotFound, w.Code)
  }
  ```

  > **Note:** `createAuthenticatedUser`, `createTestProperty`, `createTestPolicy`, `createTestClaim` are helpers defined in `claim_handler_test.go` in the same `package handlers` — accessible here automatically. `createAuthenticatedUser` returns `(orgID, userID, token string)`.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestDeleteDocument -v
  ```

  Expected: compile error — `DeleteDocument` method does not exist yet, `h.service.GetDB()` does not exist yet.

- [ ] **Step 3: Add `GetDB()` accessor to DocumentService**

  In `backend/internal/services/document_service.go`, add:

  ```go
  // GetDB exposes the database connection (used in tests)
  func (s *DocumentService) GetDB() *sql.DB {
      return s.db
  }
  ```

- [ ] **Step 4: Add `DeleteDocument` service method**

  In `backend/internal/services/document_service.go`, add:

  ```go
  // DeleteDocument deletes a document from storage and the database.
  // Returns an error if the document is not found or doesn't belong to the org.
  func (s *DocumentService) DeleteDocument(claimID, documentID, organizationID string) error {
      // Verify claim ownership
      _, err := s.claimService.GetClaim(claimID, organizationID)
      if err != nil {
          return err
      }

      // Fetch the document to get the file path for storage deletion
      var fileURL string
      query := `
          SELECT file_url FROM documents
          WHERE id = $1 AND claim_id = $2 AND status = 'confirmed'
      `
      err = s.db.QueryRow(query, documentID, claimID).Scan(&fileURL)
      if err == sql.ErrNoRows {
          return fmt.Errorf("document not found")
      }
      if err != nil {
          return fmt.Errorf("failed to fetch document: %w", err)
      }

      // Delete from Supabase Storage
      if err := s.storage.DeleteFile(fileURL); err != nil {
          // Log but don't block DB deletion — storage may already be gone
          log.Printf("Warning: failed to delete document from storage: %v", err)
      }

      // Delete the database row
      _, err = s.db.Exec(`DELETE FROM documents WHERE id = $1 AND claim_id = $2`, documentID, claimID)
      if err != nil {
          return fmt.Errorf("failed to delete document record: %w", err)
      }

      return nil
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestDeleteDocument -v
  ```

  Expected: `TestDeleteDocument_NoAuth` PASS, `TestDeleteDocument_NotFound` PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/internal/services/document_service.go backend/internal/handlers/document_handler_test.go
  git commit -m "feat: add DeleteDocument service method + handler tests"
  ```

---

### Task 3: Add DeleteDocument handler and route

**Files:**
- Modify: `backend/internal/handlers/document_handler.go`
- Modify: `backend/internal/api/router.go`

- [ ] **Step 1: Add handler method**

  In `backend/internal/handlers/document_handler.go`, add after `GetDocument`:

  ```go
  // DeleteDocument deletes a document
  // DELETE /api/claims/:id/documents/:documentId
  func (h *DocumentHandler) DeleteDocument(c *gin.Context) {
      user := c.MustGet("user").(models.User)
      claimID := c.Param("id")
      documentID := c.Param("documentId")

      err := h.service.DeleteDocument(claimID, documentID, user.OrganizationID)
      if err != nil {
          if err.Error() == "document not found" {
              c.JSON(http.StatusNotFound, gin.H{
                  "success": false,
                  "error":   "Document not found",
              })
              return
          }
          if err.Error() == "claim not found" {
              c.JSON(http.StatusNotFound, gin.H{
                  "success": false,
                  "error":   "Claim not found",
              })
              return
          }
          c.JSON(http.StatusInternalServerError, gin.H{
              "success": false,
              "error":   "Failed to delete document: " + err.Error(),
          })
          return
      }

      c.JSON(http.StatusOK, gin.H{"success": true})
  }
  ```

- [ ] **Step 2: Register the route**

  In `backend/internal/api/router.go`, after line `api.GET("/documents/:id", documentHandler.GetDocument)`, add:

  ```go
  api.DELETE("/claims/:id/documents/:documentId", documentHandler.DeleteDocument)
  ```

- [ ] **Step 3: Run handler tests**

  ```bash
  cd backend && go test ./internal/handlers/... -run TestDeleteDocument -v
  ```

  Expected: all pass.

- [ ] **Step 4: Build check**

  ```bash
  cd backend && go build ./...
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/internal/handlers/document_handler.go backend/internal/api/router.go
  git commit -m "feat: add DELETE /api/claims/:id/documents/:documentId endpoint"
  ```

---

## Chunk 2: Frontend API Helpers

### Task 4: Add uploadClaimDocument, getClaimDocumentDownloadUrl, deleteClaimDocument

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the three helpers**

  At the end of `frontend/src/lib/api.ts`, append:

  ```ts
  // ── Claim Documents ──────────────────────────────────────────────────────────

  export async function uploadClaimDocument(
    claimId: string,
    file: File,
    documentType: string
  ): Promise<void> {
    // Step 1: Request presigned upload URL
    const urlResponse = await api.post(`/api/claims/${claimId}/documents/upload-url`, {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/pdf',
      document_type: documentType,
    })
    const { upload_url, document_id } = urlResponse.data.data

    // Step 2: PUT file directly to Supabase storage
    const putResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/pdf' },
      body: file,
    })
    if (!putResponse.ok) {
      throw new Error('Failed to upload document to storage')
    }

    // Step 3: Confirm upload
    await api.post(`/api/claims/${claimId}/documents/${document_id}/confirm`)
  }

  export async function getClaimDocumentDownloadUrl(documentId: string): Promise<string> {
    const response = await api.get(`/api/documents/${documentId}`)
    return response.data.data.download_url as string
  }

  export async function deleteClaimDocument(claimId: string, documentId: string): Promise<void> {
    await api.delete(`/api/claims/${claimId}/documents/${documentId}`)
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no new errors related to `api.ts`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/lib/api.ts
  git commit -m "feat: add uploadClaimDocument, getClaimDocumentDownloadUrl, deleteClaimDocument API helpers"
  ```

---

## Chunk 3: ClaimDocuments Component

### Task 5: Create ClaimDocuments.tsx

**Files:**
- Create: `frontend/src/components/ClaimDocuments.tsx`

- [ ] **Step 1: Create the component**

  Create `frontend/src/components/ClaimDocuments.tsx`:

  ```tsx
  import { useState } from 'react'
  import { useQuery, useQueryClient } from '@tanstack/react-query'
  import api, { uploadClaimDocument, getClaimDocumentDownloadUrl, deleteClaimDocument } from '../lib/api'

  interface Document {
    id: string
    claim_id: string
    uploaded_by_user_id: string | null
    document_type: string
    file_url: string
    file_name: string
    file_size_bytes: number
    mime_type: string
    status: string
    created_at: string
  }

  const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    pa_contract: 'PA Contract',
    letter_of_representation: 'Letter of Representation',
    carrier_acknowledgement: 'Carrier Acknowledgement',
    contractor_estimate: 'Contractor Estimate',
    carrier_estimate: 'Carrier Estimate',
    policy_pdf: 'Policy PDF',
    proof_of_repair: 'Proof of Repair',
    other: 'Other',
  }

  const UPLOAD_TYPE_OPTIONS = [
    { value: 'pa_contract', label: 'PA Contract' },
    { value: 'letter_of_representation', label: 'Letter of Representation' },
    { value: 'carrier_acknowledgement', label: 'Carrier Acknowledgement' },
    { value: 'contractor_estimate', label: 'Contractor Estimate' },
    { value: 'carrier_estimate', label: 'Carrier Estimate' },
    { value: 'policy_pdf', label: 'Policy PDF' },
    { value: 'proof_of_repair', label: 'Proof of Repair' },
    { value: 'other', label: 'Other' },
  ]

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  interface ClaimDocumentsProps {
    claimId: string
  }

  export default function ClaimDocuments({ claimId }: ClaimDocumentsProps) {
    const queryClient = useQueryClient()
    const [showUploadForm, setShowUploadForm] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [documentType, setDocumentType] = useState('pa_contract')
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)

    const { data: documents, isLoading } = useQuery({
      queryKey: ['claim-documents', claimId],
      queryFn: async () => {
        const response = await api.get(`/api/claims/${claimId}/documents`)
        return response.data.data as Document[]
      },
    })

    const handleUpload = async () => {
      if (!selectedFile) return
      setUploading(true)
      setUploadError(null)
      try {
        await uploadClaimDocument(claimId, selectedFile, documentType)
        await queryClient.invalidateQueries({ queryKey: ['claim-documents', claimId] })
        setShowUploadForm(false)
        setSelectedFile(null)
        setDocumentType('pa_contract')
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    }

    const handleDownload = async (documentId: string) => {
      try {
        const url = await getClaimDocumentDownloadUrl(documentId)
        window.open(url, '_blank')
      } catch {
        alert('Failed to generate download link. Please try again.')
      }
    }

    const handleDelete = async (documentId: string, fileName: string) => {
      if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return
      try {
        await deleteClaimDocument(claimId, documentId)
        await queryClient.invalidateQueries({ queryKey: ['claim-documents', claimId] })
      } catch {
        alert('Failed to delete document. Please try again.')
      }
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Documents</h2>
          {!showUploadForm && (
            <button
              onClick={() => setShowUploadForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Upload Document
            </button>
          )}
        </div>

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/heic"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {UPLOAD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {uploadError && (
                <p className="text-sm text-red-600">{uploadError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowUploadForm(false)
                    setSelectedFile(null)
                    setUploadError(null)
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document List */}
        <div className="bg-white shadow rounded-lg">
          {isLoading ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading documents...</div>
          ) : documents && documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">{doc.file_name}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{doc.uploaded_by_user_id ?? '—'}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.created_at)}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm space-x-3">
                        <button
                          onClick={() => handleDownload(doc.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.file_name)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No documents uploaded yet</h3>
              <p className="mt-1 text-sm text-gray-500">Upload your first document using the button above.</p>
            </div>
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors from `ClaimDocuments.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/ClaimDocuments.tsx
  git commit -m "feat: add ClaimDocuments component with upload, download, delete"
  ```

---

## Chunk 4: ClaimDetail Wiring

### Task 6: Add Documents tab + mount ClaimDocuments

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`

- [ ] **Step 1: Extend the tab union type**

  Find this line (~line 855):
  ```ts
  const [activeTab, setActiveTab] = useState<'overview' | 'photos' | 'report'>('overview')
  ```
  Change to:
  ```ts
  const [activeTab, setActiveTab] = useState<'overview' | 'photos' | 'report' | 'documents'>('overview')
  ```

- [ ] **Step 2: Add the tab to the tab bar**

  Find the `(['overview', 'photos', 'report'] as const).map(...)` call (~line 1408). Change to:
  ```tsx
  {(['overview', 'photos', 'report', 'documents'] as const).map((tab) => {
    const labels: Record<typeof tab, string> = {
      overview: 'Overview',
      photos: 'Photos',
      report: 'Damage Report',
      documents: 'Documents',
    }
  ```

- [ ] **Step 3: Import ClaimDocuments**

  Add the import near the top of `ClaimDetail.tsx` with the other component imports:
  ```ts
  import ClaimDocuments from '../components/ClaimDocuments'
  ```

- [ ] **Step 4: Mount the component**

  After the existing `{activeTab === 'report' && ...}` block, add:
  ```tsx
  {/* Documents tab */}
  {activeTab === 'documents' && id && (
    <div className="px-4 py-6 sm:px-6">
      <ClaimDocuments claimId={id} />
    </div>
  )}
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no new errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/ClaimDetail.tsx
  git commit -m "feat: add Documents tab to claim detail page"
  ```

---

### Task 7: Make ContractorSubmissionWrapper self-contained

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`

- [ ] **Step 1: Read ContractorSubmissionWrapper**

  In `ClaimDetail.tsx`, find the `ContractorSubmissionWrapper` component definition (~line 135). Read it carefully to understand how it uses `documents` and `onDownload`.

- [ ] **Step 2: Update props interface and function signature**

  Find `ContractorSubmissionWrapperProps` (~line 135). Change the interface from:
  ```ts
  interface ContractorSubmissionWrapperProps {
    claimId: string
    documents: Document[]
    onDownload: (documentId: string) => void
  }
  ```
  To:
  ```ts
  interface ContractorSubmissionWrapperProps {
    claimId: string
  }
  ```

  Then find the function definition line (e.g. `function ContractorSubmissionWrapper({ claimId, documents, onDownload }: ContractorSubmissionWrapperProps)`) and update the destructuring to:
  ```ts
  function ContractorSubmissionWrapper({ claimId }: ContractorSubmissionWrapperProps)
  ```

- [ ] **Step 3: Add internal data fetching to ContractorSubmissionWrapper**

  Inside the `ContractorSubmissionWrapper` function body, add a `useQuery` call to fetch documents and replace usage of the removed props:

  ```ts
  const { data: documents = [] } = useQuery({
    queryKey: ['claim-documents', claimId],
    queryFn: async () => {
      const response = await api.get(`/api/claims/${claimId}/documents`)
      return response.data.data as Document[]
    },
  })

  const handleDocumentDownload = async (documentId: string) => {
    try {
      const url = await getClaimDocumentDownloadUrl(documentId)
      window.open(url, '_blank')
    } catch {
      alert('Failed to generate download link.')
    }
  }
  ```

  Add necessary imports at the top of the file if not already present:
  ```ts
  import { useQuery } from '@tanstack/react-query'
  import { getClaimDocumentDownloadUrl } from '../lib/api'
  ```

  Replace all uses of the `onDownload` prop inside `ContractorSubmissionWrapper` with `handleDocumentDownload`.

- [ ] **Step 4: Update the call site**

  Find where `ContractorSubmissionWrapper` is rendered (~line 1637). Change from:
  ```tsx
  <ContractorSubmissionWrapper
    claimId={claim.id}
    documents={documents}
    onDownload={handleDocumentDownload}
  />
  ```
  To:
  ```tsx
  <ContractorSubmissionWrapper claimId={claim.id} />
  ```

  Also remove the render guard condition `{claim && documents && !loadingDocuments && (` — replace with just `{claim && (`.

- [ ] **Step 5: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors related to `ContractorSubmissionWrapper`.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/ClaimDetail.tsx
  git commit -m "refactor: make ContractorSubmissionWrapper self-contained (fetch own documents)"
  ```

---

### Task 8: Remove old Documents section from Overview + clean up dead state

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`

- [ ] **Step 1: Delete the Documents Section block from Overview**

  In `ClaimDetail.tsx`, find and delete the entire `{/* Documents Section */}` block (~lines 1548–1634). This is the `<div className="bg-white shadow rounded-lg">` block with heading "Documents", the loading state, the table, and the empty state.

- [ ] **Step 2: Remove dead state — documents useQuery**

  Find and delete the `useQuery` block that starts with:
  ```ts
  // Fetch documents
  ```
  (~line 913–932). This is the query with `queryKey: ['claim-documents', id]` that was used by the removed section.

- [ ] **Step 3: Remove loadingDocuments**

  Find and remove `const { data: documents, isLoading: loadingDocuments, ... }` destructuring that came from that query. Search for `loadingDocuments` to confirm no remaining usages.

- [ ] **Step 4: Remove handleDocumentDownload**

  Find and delete the `handleDocumentDownload` function (~line 964). Search for any remaining usages to confirm none.

- [ ] **Step 5: Remove the old Document interface if now unused**

  Run:
  ```bash
  grep -n ': Document\b\|Document\[\]\|as Document' frontend/src/pages/ClaimDetail.tsx
  ```
  If the only matches are the interface declaration itself (line ~17), delete the interface. If other usages remain, leave it.

- [ ] **Step 6: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/ClaimDetail.tsx
  git commit -m "refactor: remove old Documents section from Overview tab and clean up dead state"
  ```

---

### Task 9: Final verification

- [ ] **Step 1: Build the frontend**

  ```bash
  cd frontend && npm run build 2>&1 | tail -20
  ```

  Expected: build succeeds with no errors.

- [ ] **Step 2: Build the backend**

  ```bash
  cd backend && go build ./... 2>&1
  ```

  Expected: no errors.

- [ ] **Step 3: Run all backend tests**

  ```bash
  cd backend && go test ./... -v 2>&1 | tail -30
  ```

  Expected: all pass (some may be skipped if test DB is unavailable — that's fine).

- [ ] **Step 4: Manual smoke test checklist**

  Open the app and navigate to a claim detail page:

  - [ ] Four tabs visible: Overview, Photos, Damage Report, Documents
  - [ ] Documents tab shows the document list (or empty state)
  - [ ] "Upload Document" button appears; clicking it shows the inline form
  - [ ] File picker and type dropdown work; "Upload" button uploads successfully
  - [ ] Uploaded document appears in the list immediately
  - [ ] "Download" opens the file in a new tab
  - [ ] "Delete" prompts for confirmation, then removes the document
  - [ ] Overview tab no longer shows a Documents section
  - [ ] Assessment Submission section in Overview still renders correctly

- [ ] **Step 5: Final commit (if any cleanup needed)**

  ```bash
  git add -A && git commit -m "chore: documents tab final cleanup"
  ```
