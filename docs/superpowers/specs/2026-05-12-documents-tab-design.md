# Documents Tab — Design Spec

**Date:** 2026-05-12
**Status:** Approved

## Overview

Add a dedicated "Documents" tab to the claim detail page (`ClaimDetail.tsx`) so Public Adjusters can upload, view, download, and delete any documents associated with a claim throughout its lifecycle (PA contracts, letters of representation, carrier acknowledgements, and more).

This tab replaces the existing read-only Documents section in the Overview tab, becoming the single home for all document management.

---

## Backend Changes

### New Document Types (`backend/internal/models/document.go`)

Add three PA-specific document types:

| Constant | Value | Label |
|---|---|---|
| `DocumentTypePAContract` | `"pa_contract"` | PA Contract |
| `DocumentTypeLetterOfRepresentation` | `"letter_of_representation"` | Letter of Representation |
| `DocumentTypeCarrierAcknowledgement` | `"carrier_acknowledgement"` | Carrier Acknowledgement |

All three accept PDF only, 25MB max — same rules as existing `policy_pdf`.

Add to `ValidDocumentTypes`, `FileValidationRules`, and `getDocumentTypeLabel` in the frontend.

### New DELETE Endpoint

```
DELETE /api/claims/:id/documents/:documentId
```

- Registered in `backend/internal/api/router.go` (authenticated, same group as existing document routes)
- New `DeleteDocument(c *gin.Context)` handler in `backend/internal/handlers/document_handler.go`
- New `DeleteDocument(claimID, documentID, orgID string) error` method in `backend/internal/services/document_service.go`
- Service verifies the document belongs to the claim and org before deleting from Supabase Storage and the database row
- Returns 404 if not found, 500 on error, 200 on success

---

## Frontend API Helpers (`frontend/src/lib/api.ts`)

Three new exported functions:

```ts
// 3-step presigned upload: request URL → PUT to storage → confirm
uploadClaimDocument(claimId: string, file: File, documentType: string): Promise<void>

// Returns a temporary signed download URL
getClaimDocumentDownloadUrl(documentId: string): Promise<string>

// Deletes a document
deleteClaimDocument(claimId: string, documentId: string): Promise<void>
```

---

## New Component: `ClaimDocuments.tsx`

**Location:** `frontend/src/components/ClaimDocuments.tsx`
**Props:** `claimId: string`

### Data

- Fetches documents via `useQuery(['claim-documents', claimId], () => api.get('/api/claims/:id/documents'))`
- Invalidates the query after upload or delete

### Layout

```
┌─────────────────────────────────────────────┐
│  Documents                    [Upload Document] │
├─────────────────────────────────────────────┤
│  [Upload form — shown when button clicked]  │
│    File:  [Choose file...]                  │
│    Type:  [Dropdown ▼]                      │
│                              [Cancel] [Upload] │
├─────────────────────────────────────────────┤
│  Type        │ File Name │ Uploaded By │ Date │ Actions     │
│  [PA Contract] doc.pdf    Ben Lopez    May 12  Download Delete│
└─────────────────────────────────────────────┘
```

### Upload Form

- Toggled inline (no modal) by clicking "Upload Document"
- File picker + document type dropdown
- Document type options (maps to backend constants):
  - PA Contract
  - Letter of Representation
  - Carrier Acknowledgement
  - Contractor Estimate
  - Carrier Estimate
  - Policy PDF
  - Proof of Repair
  - Other
- On submit: calls `uploadClaimDocument()`, hides form, invalidates query
- Loading state on the Upload button during upload

### Document List

- Table: Type (colored badge) | File Name | Uploaded By | Date | Actions
- Download: calls `getClaimDocumentDownloadUrl()`, opens URL in new tab
- Delete: `window.confirm()` → `deleteClaimDocument()` → invalidate query
- Empty state: icon + "No documents uploaded yet"

---

## `ClaimDetail.tsx` Changes

1. **Add tab** — extend union type to `'overview' | 'photos' | 'report' | 'documents'` and add `documents: 'Documents'` to the labels map
2. **Mount component** — render `<ClaimDocuments claimId={id} />` when `activeTab === 'documents'`
3. **Remove Overview Documents section** — delete the "Documents Section" block (~lines 1548–1635) from the Overview tab
4. **Clean up dead state** — remove the `documents` useQuery, `loadingDocuments`, and `handleDocumentDownload` that were only used by the removed section (the new component owns its own data fetching)

---

## Success Criteria

- [ ] Documents tab appears alongside Overview, Photos, Damage Report
- [ ] Users can upload a file with a selected document type
- [ ] Uploaded document appears in the list immediately after upload
- [ ] Users can download any document
- [ ] Users can delete a document (with confirmation)
- [ ] Overview tab no longer shows a Documents section
- [ ] All three new PA document types are selectable on upload
- [ ] Existing document types (contractor estimate, carrier estimate, etc.) remain selectable

---

## Out of Scope

- Document preview / inline viewer
- Renaming documents after upload
- Permission-based visibility (e.g., PA-only vs. shared with homeowner)
- Bulk upload
