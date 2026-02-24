# Property Detail Tab Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-column PropertyDetail layout with a tab-based layout where Claims is the default tab and Policy & Details is a secondary tab.

**Architecture:** Two changes — (1) `PolicyCard.tsx` gets PDF props merged in so the standalone PDF card is eliminated, (2) `PropertyDetail.tsx` replaces the 2-column grid with a tab switcher and two full-width panels.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, existing `glass-card` utility classes, React Router, TanStack Query

---

### Task 1: Merge PDF into PolicyCard

**Files:**
- Modify: `frontend/src/components/PolicyCard.tsx`

**Context:** Currently `PropertyDetail.tsx` renders a standalone "Policy Document" card above `<PolicyCard>`. The goal is to move that PDF display/upload into `PolicyCard` itself so there's only one card.

**Step 1: Update the `PolicyCardProps` interface to accept PDF props**

In `PolicyCard.tsx`, find the interface at the top:
```typescript
interface PolicyCardProps {
  propertyId: string
  policy: Policy | null
  onSuccess: () => void
  onDelete: () => void
}
```

Replace with:
```typescript
interface PolicyCardProps {
  propertyId: string
  policy: Policy | null
  onSuccess: () => void
  onDelete: () => void
  pdfUrl?: string | null
  isUploadingPdf?: boolean
  uploadPdfError?: unknown
  onUploadPdf?: (file: File) => void
}
```

**Step 2: Destructure the new props in the function signature**

Find:
```typescript
export default function PolicyCard({
  propertyId,
  policy,
  onSuccess,
  onDelete,
}: PolicyCardProps) {
```

Replace with:
```typescript
export default function PolicyCard({
  propertyId,
  policy,
  onSuccess,
  onDelete,
  pdfUrl,
  isUploadingPdf,
  uploadPdfError,
  onUploadPdf,
}: PolicyCardProps) {
```

**Step 3: Add a PDF section inside the display mode, just below the `policy-card-header` div**

In the display mode block (`!isEditing && policy`), find the closing `</div>` of `policy-card-header` and insert the PDF row after it:

```tsx
{/* PDF Row */}
<div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid var(--color-sand-200)' }}>
  <label className="policy-label">Policy Document</label>
  {pdfUrl ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'white', border: '1px solid var(--color-sand-200)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ color: '#ef4444' }}>
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-sand-900)' }}>Policy.pdf</span>
      </div>
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--color-terracotta-600)', fontWeight: 500, textDecoration: 'none' }}>
        View →
      </a>
    </div>
  ) : onUploadPdf ? (
    <div>
      {uploadPdfError && (
        <p style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>
          Failed to upload PDF
        </p>
      )}
      <label style={{ display: 'inline-block', cursor: isUploadingPdf ? 'not-allowed' : 'pointer', opacity: isUploadingPdf ? 0.5 : 1 }}>
        <input
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          disabled={isUploadingPdf}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && onUploadPdf) {
              if (file.type !== 'application/pdf') { alert('Please select a PDF file'); return }
              if (file.size > 10 * 1024 * 1024) { alert('File size must be less than 10MB'); return }
              onUploadPdf(file)
            }
          }}
        />
        <span className="btn-cancel" style={{ fontSize: '13px', padding: '8px 16px' }}>
          {isUploadingPdf ? 'Uploading...' : 'Upload PDF'}
        </span>
      </label>
    </div>
  ) : (
    <p style={{ fontSize: '14px', color: 'var(--color-sand-500)' }}>No document uploaded</p>
  )}
</div>
```

**Step 4: Verify the component still renders correctly by checking no TypeScript errors**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `PolicyCard.tsx`

**Step 5: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add frontend/src/components/PolicyCard.tsx
git commit -m "feat(ui): merge PDF upload/view into PolicyCard"
```

---

### Task 2: Rewrite PropertyDetail layout with tabs

**Files:**
- Modify: `frontend/src/pages/PropertyDetail.tsx`

**Context:** The current page uses a `grid grid-cols-1 lg:grid-cols-5` layout. We're replacing it with a tab state variable and two conditional panels.

**Step 1: Add tab state**

After the existing `useState` calls near the top of the component, add:
```typescript
const [activeTab, setActiveTab] = useState<'claims' | 'policy'>('claims')
```

**Step 2: Pass PDF props through to PolicyCard — update the `uploadPDF` destructure**

The hook is already called:
```typescript
const { uploadPDF, isUploading, uploadError } = usePolicyPDFUpload(id || '')
```
No change needed here — these will be passed as props to `PolicyCard` in the new layout.

**Step 3: Replace the entire grid layout**

Find this block (starts at the `<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">` line and ends before `</div>` closing the space-y-8 div, but keeping the modals):

```tsx
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Property & Policy Info */}
          <div className="lg:col-span-2 space-y-6">
            ...
          </div>

          {/* Right Column - Claims History */}
          <div className="lg:col-span-3">
            ...
          </div>
        </div>
```

Replace the entire grid with:

```tsx
        {/* Tabs */}
        <div className="flex space-x-1 glass-card-strong rounded-2xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('claims')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'claims'
                ? 'bg-white shadow-sm text-navy'
                : 'text-slate hover:text-navy'
            }`}
          >
            Claims
            {claims && claims.length > 0 && (
              <span className={`ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                activeTab === 'claims' ? 'bg-teal text-white' : 'bg-slate/20 text-slate'
              }`}>
                {claims.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('policy')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'policy'
                ? 'bg-white shadow-sm text-navy'
                : 'text-slate hover:text-navy'
            }`}
          >
            Policy & Details
          </button>
        </div>

        {/* Claims Tab */}
        {activeTab === 'claims' && (
          <div className="animate-fade-in">
            {claims && claims.length > 0 ? (
              <div className="space-y-4">
                {claims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-12 text-center">
                <svg className="mx-auto h-16 w-16 text-slate/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h4 className="mt-4 text-lg font-display font-semibold text-navy">No claims yet</h4>
                <p className="mt-2 text-sm text-slate">Use the button above to create your first claim</p>
              </div>
            )}
          </div>
        )}

        {/* Policy & Details Tab */}
        {activeTab === 'policy' && (
          <div className="animate-fade-in space-y-4">
            {/* Property Details — compact inline row */}
            <div className="glass-card rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate uppercase tracking-wide mb-3">Property Details</h3>
              <div className="flex flex-wrap gap-6">
                <div>
                  <label className="block text-xs font-medium text-slate mb-0.5">Owner Entity</label>
                  <p className="text-sm text-navy font-medium">{property.owner_entity_name}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate mb-0.5">Created</label>
                  <p className="text-sm text-navy">{formatDate(property.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Insurance Policy (with PDF merged in) */}
            <PolicyCard
              propertyId={property.id}
              policy={policy || null}
              onSuccess={() => refetchPolicy()}
              onDelete={handleDeletePolicy}
              pdfUrl={policy?.policy_pdf_url}
              isUploadingPdf={isUploading}
              uploadPdfError={uploadError}
              onUploadPdf={(file) => uploadPDF(file)}
            />
          </div>
        )}
```

**Step 4: Remove the now-unused standalone PDF card block**

Find and delete this block in the old layout (it no longer exists after Step 3, but verify it's gone):
```tsx
              {/* Policy PDF Upload/View */}
              {policy && (
                <div className="glass-card rounded-2xl p-6 mb-6">
                  ...
                </div>
              )}
```

This will already be gone after Step 3 since we replaced the whole grid. Just confirm the file looks clean.

**Step 5: Type-check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

**Step 6: Visually verify in browser**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npm run dev
```

Check:
- Claims tab is active by default ✓
- Claim count badge shows ✓
- Policy & Details tab shows compact property row + merged policy card with PDF section ✓
- No standalone "Policy Document" card ✓
- Works on narrow viewport (mobile) ✓

**Step 7: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add frontend/src/pages/PropertyDetail.tsx
git commit -m "feat(ui): replace property detail grid with claims/policy tabs"
```

---

### Task 3: Push to GitHub

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code" && git push
```
