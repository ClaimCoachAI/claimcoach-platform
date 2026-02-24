# Contractor Submission on Claim Detail — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display the contractor's submitted scope sheet (areas, tags, dimensions, notes) and uploaded photos on the property manager's claim detail page.

**Architecture:** Two frontend-only changes — (1) minor tweaks to the existing `ScopeSheetSummary` component to show per-area notes and remove a stale footer, and (2) a new `ContractorSubmissionWrapper` component wired into `ClaimDetail.tsx` that fetches and displays the scope sheet alongside a filtered list of contractor photos.

**Tech Stack:** React, TypeScript, TanStack Query (`useQuery`), Tailwind CSS

---

### Task 1: Add per-area notes + remove stale footer from `ScopeSheetSummary`

**Files:**
- Modify: `frontend/src/components/ScopeSheetSummary.tsx`

**Context:**
`ScopeSheetSummary` renders each damage area's category, tags, and dimensions — but the `ScopeArea` type has a `notes: string` field that is never rendered. There is also a misleading footer paragraph that says "Complete scope sheet details are available in the documents section." Both need fixing.

The `ScopeArea` type (from `frontend/src/types/scopeSheet.ts`):
```typescript
export interface ScopeArea {
  id: string
  category: string
  category_key: string
  order: number
  tags: string[]
  dimensions: Record<string, number>
  photo_ids: string[]
  notes: string   // ← currently unused in ScopeSheetSummary
}
```

**Step 1: Open the file and locate the area render loop**

Open `frontend/src/components/ScopeSheetSummary.tsx`. The area loop starts around line 57. Each area renders category, optional tags, and optional dimension string. There is no `area.notes` render.

**Step 2: Add per-area notes rendering**

Inside the `areas.map(...)` return block, after the tags `div` (the `flex flex-wrap gap-1.5` block), add:

```tsx
{area.notes && (
  <p className="text-xs text-slate/70 pl-6 mt-1 italic">{area.notes}</p>
)}
```

Place it so the final area block looks like:
```tsx
return (
  <div key={area.id || idx} className="space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-base leading-none">{cat?.emoji ?? '📌'}</span>
      <span className="text-sm font-bold text-navy">{area.category}</span>
      {dimStr && (
        <span className="text-xs text-slate/60 ml-auto">{dimStr}</span>
      )}
    </div>
    {area.tags.length > 0 && (
      <div className="flex flex-wrap gap-1.5 pl-6">
        {area.tags.map(tag => (
          <span key={tag} className="px-2 py-0.5 rounded-md bg-teal/10 text-teal text-xs font-medium">
            {tag.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    )}
    {area.notes && (
      <p className="text-xs text-slate/70 pl-6 mt-1 italic">{area.notes}</p>
    )}
  </div>
)
```

**Step 3: Remove the stale footer paragraph**

Delete this block entirely (around lines 99–103):
```tsx
<div className="mt-4 pt-3 border-t border-slate/10">
  <p className="text-xs text-slate">
    Complete scope sheet details are available in the documents section.
  </p>
</div>
```

**Step 4: Verify the file renders correctly**

Run the dev server (`cd frontend && npm run dev` or `bun run dev`) and navigate to a claim that has a submitted scope sheet. Confirm:
- Areas with notes show the note text in italic below the tags
- The stale footer is gone

**Step 5: Commit**

```bash
git add frontend/src/components/ScopeSheetSummary.tsx
git commit -m "fix(scope-sheet): show per-area notes and remove stale footer"
```

---

### Task 2: Add `ContractorSubmissionWrapper` to `ClaimDetail.tsx`

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`

**Context:**
`ClaimDetail.tsx` already:
- Has a local `Document` interface (lines 13–20)
- Fetches `documents` array via `useQuery(['claim-documents', id], ...)`
- Has `AuditSectionWrapper` that fetches scope sheet using query key `['scope-sheet', claimId]`

We are adding a new `ContractorSubmissionWrapper` component that:
1. Fetches the scope sheet with the same query key (TanStack Query deduplicates — one network request)
2. Only renders when `scopeSheet.submitted_at` is set (i.e. contractor actually submitted)
3. Shows `ScopeSheetSummary` at the top
4. Shows a simple photo list below it (filtered from `documents` prop for `contractor_photo` type)

**Step 1: Add the import for `ScopeSheetSummary` and `ScopeSheet` type**

At the top of `ClaimDetail.tsx`, add these two imports alongside the existing imports:

```typescript
import ScopeSheetSummary from '../components/ScopeSheetSummary'
import type { ScopeSheet } from '../types/scopeSheet'
```

**Step 2: Write the `ContractorSubmissionWrapper` component**

Add this new component to `ClaimDetail.tsx` immediately after the `AuditSectionWrapper` function (around line 143, before the `interface AuditSectionProps` declaration). Insert:

```tsx
interface ContractorSubmissionWrapperProps {
  claimId: string
  documents: Document[]
}

function ContractorSubmissionWrapper({ claimId, documents }: ContractorSubmissionWrapperProps) {
  const { data: scopeSheet, isLoading } = useQuery<ScopeSheet | null>({
    queryKey: ['scope-sheet', claimId],
    queryFn: async () => {
      try {
        const response = await api.get(`/api/claims/${claimId}/scope-sheet`)
        return response.data.data
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
  })

  if (isLoading || !scopeSheet || !scopeSheet.submitted_at) {
    return null
  }

  const contractorPhotos = documents.filter(d => d.document_type === 'contractor_photo')

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-5 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Contractor Submission</h3>
      </div>
      <div className="px-6 py-5 space-y-6">
        <ScopeSheetSummary scopeSheet={scopeSheet} />

        {/* Contractor Photos */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Photos ({contractorPhotos.length})
          </h4>
          {contractorPhotos.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {contractorPhotos.map(photo => (
                <li key={photo.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-900 truncate max-w-xs">{photo.file_name}</span>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <span className="text-gray-500">{formatDate(photo.uploaded_at)}</span>
                    <button
                      onClick={() => handleDocumentDownload(photo.id)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No photos uploaded.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

Note: `handleDocumentDownload` and `formatDate` are already defined in `ClaimDetail.tsx` — they are in scope because this component is defined inside the same file.

**Step 3: Place the new section in the JSX**

In the main `ClaimDetail` component's JSX, find the Documents section ending and Magic Link History (around line 1706–1709):

```tsx
            </div>

            {/* Magic Link History */}
            {claim && <MagicLinkHistory claimId={claim.id} />}
```

Insert the new section between them:

```tsx
            </div>

            {/* Contractor Submission - scope sheet + photos */}
            {claim && documents && (
              <ContractorSubmissionWrapper
                claimId={claim.id}
                documents={documents}
              />
            )}

            {/* Magic Link History */}
            {claim && <MagicLinkHistory claimId={claim.id} />}
```

**Step 4: Verify in the browser**

With the dev server running, navigate to a claim that has a submitted scope sheet:
- Confirm the "Contractor Submission" section appears between Documents and Magic Link History
- Confirm scope sheet areas, tags, dimensions, and notes render correctly
- Confirm the photo list shows with correct file names and download buttons
- Navigate to a claim with no scope sheet — confirm the section is invisible

**Step 5: Commit**

```bash
git add frontend/src/pages/ClaimDetail.tsx
git commit -m "feat(claim-detail): show contractor scope sheet and photos on claim page"
```

---

## Done

The property manager can now see everything the contractor submitted — damage areas, tags, dimensions, per-area notes, general notes, and a downloadable list of photos — directly on the claim detail page. No backend changes were required.
