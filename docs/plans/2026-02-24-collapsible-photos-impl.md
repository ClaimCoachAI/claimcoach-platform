# Collapsible Contractor Photos Section — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat photo list in ClaimStepper with a collapsible accordion that shows a compact header bar and uses a download icon instead of a text button.

**Architecture:** Single self-contained change to `ClaimStepper.tsx` — add a `photosOpen` state, replace the `<div className="mt-4">` photos block with a collapsible accordion component inline. No new files, no backend changes.

**Tech Stack:** React, TypeScript, Tailwind CSS (already in use)

---

### Task 1: Replace the flat photos block with a collapsible accordion

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx` (around lines 794–816)

**Context:**

The current photos block (lines 794–816) looks like this:

```tsx
<div className="mt-4">
  <h4 className="text-sm font-medium text-gray-700 mb-2">
    Photos ({contractorPhotos.length})
  </h4>
  {contractorPhotos.length > 0 ? (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {contractorPhotos.map(photo => (
        <li key={photo.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-gray-900 truncate max-w-xs">{photo.file_name}</span>
          <button
            type="button"
            onClick={() => handlePhotoDownload(photo.id)}
            className="ml-4 shrink-0 text-blue-600 hover:text-blue-800 font-medium"
          >
            Download
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-gray-500">No photos uploaded.</p>
  )}
</div>
```

`useState` is already imported at line 1. The `contractorPhotos` array and `handlePhotoDownload` function are already defined in the component.

**Step 1: Add `photosOpen` state**

Find the block of existing `useState` declarations near the top of the `ClaimStepper` component function (around line 53–65). Add one new state after them:

```tsx
const [photosOpen, setPhotosOpen] = useState(false)
```

Note: we initialize to `false` always — the auto-open logic (open when ≤2 photos) will be handled in the render via a derived value so it stays reactive. Actually, use `useEffect` is overkill here — just use a derived open state: the controlled state tracks user intent, defaulting based on photo count when the data loads. Keep it simple: initialize to `false` and rely on the header click to toggle. The auto-open can be added as a `useEffect` that runs once when `contractorPhotos` loads:

```tsx
const [photosOpen, setPhotosOpen] = useState(false)

useEffect(() => {
  if (contractorPhotos.length > 0 && contractorPhotos.length <= 2) {
    setPhotosOpen(true)
  }
}, [contractorPhotos.length])
```

**Step 2: Replace the photos block**

Find the exact block starting with `<div className="mt-4">` (line 794) and ending with `</div>` (line 816) and replace it entirely with:

```tsx
<div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
  {/* Accordion header */}
  <button
    type="button"
    onClick={() => setPhotosOpen(prev => !prev)}
    className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors text-sm"
  >
    <span className="flex items-center gap-2 font-medium text-gray-700">
      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      Photos ({contractorPhotos.length})
    </span>
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${photosOpen ? 'rotate-90' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>

  {/* Accordion body */}
  <div
    className={`transition-all duration-200 ease-in-out overflow-hidden ${
      photosOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
    }`}
  >
    {contractorPhotos.length > 0 ? (
      <ul className="divide-y divide-gray-100 border-t border-gray-200">
        {contractorPhotos.map(photo => (
          <li key={photo.id} className="flex items-center justify-between px-4 py-2 text-sm bg-white">
            <span className="text-gray-700 truncate max-w-xs">{photo.file_name}</span>
            <button
              type="button"
              onClick={() => handlePhotoDownload(photo.id)}
              title={`Download ${photo.file_name}`}
              className="ml-4 shrink-0 p-1 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="px-4 py-3 text-sm text-gray-400 border-t border-gray-100">No photos uploaded.</p>
    )}
  </div>
</div>
```

**Step 3: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

**Step 4: Visual check**

With the dev server running (`npm run dev` or `bun run dev` in `frontend/`), navigate to a claim with a submitted scope sheet. Verify:
- A compact bar shows "📷 Photos (N)" with a `›` chevron
- Clicking expands the list with small download icons
- Chevron rotates to `⌄` when open
- Clicking again collapses it
- If the claim has ≤2 photos, the list auto-opens on page load
- Each download icon triggers the file download

**Step 5: Commit**

```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat(claim-stepper): collapsible photo accordion with download icon"
```

---

## Done

The photos section is now compact and scalable — a single header bar when collapsed, expanding to a slim list with icon-only download buttons when open.
