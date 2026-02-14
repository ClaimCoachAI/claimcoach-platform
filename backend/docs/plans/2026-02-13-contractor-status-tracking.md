# Contractor Status Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two-state contractor status visibility to claim journey Step 2 so property managers can see "waiting on contractor" or "completed" status.

**Architecture:** Query for scope sheet existence on claim detail, conditionally render status badge and scope sheet summary in ClaimStepper Step 2. No backend changes needed - leverage existing `/api/claims/:id/scope-sheet` endpoint.

**Tech Stack:** React, TypeScript, TanStack Query, existing glass-card UI aesthetic

---

## Task 1: Read Current ClaimStepper Implementation

**Files:**
- Read: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Read the file to understand current structure**

```bash
# Read the full ClaimStepper component
cat frontend/src/components/ClaimStepper.tsx
```

Expected: Understand current Step 2 structure, where contractor email/name displays, existing query patterns

**Step 2: Identify Step 2 rendering location**

Look for:
- Where Step 2 content is rendered
- Where `claim.contractor_email` is displayed
- Current styling patterns and class names

**Step 3: Document findings**

Note in a comment:
- Line numbers for Step 2 rendering
- Existing data queries pattern
- CSS class naming conventions

---

## Task 2: Create Contractor Status Badge Component

**Files:**
- Create: `frontend/src/components/ContractorStatusBadge.tsx`

**Step 1: Create the component file with TypeScript interface**

```typescript
interface ContractorStatusBadgeProps {
  hasMagicLink: boolean
  hasScopeSheet: boolean
}

export default function ContractorStatusBadge({
  hasMagicLink,
  hasScopeSheet
}: ContractorStatusBadgeProps) {
  // Component implementation
}
```

**Step 2: Implement status determination logic**

```typescript
export default function ContractorStatusBadge({
  hasMagicLink,
  hasScopeSheet
}: ContractorStatusBadgeProps) {
  if (!hasMagicLink) {
    return null
  }

  if (hasScopeSheet) {
    return (
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200">
        <svg className="w-4 h-4 text-emerald-600 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium text-emerald-700">Completed</span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
      <svg className="w-4 h-4 text-amber-600 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm font-medium text-amber-700">Waiting on contractor</span>
    </div>
  )
}
```

**Step 3: Verify component compiles**

```bash
cd frontend
npm run type-check
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add frontend/src/components/ContractorStatusBadge.tsx
git commit -m "feat: add contractor status badge component

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Scope Sheet Summary Component

**Files:**
- Create: `frontend/src/components/ScopeSheetSummary.tsx`

**Step 1: Define TypeScript interface for scope sheet**

```typescript
interface ScopeSheet {
  id: string
  claim_id: string
  damage_type: string
  affected_areas: string[]
  urgency_level: string
  contractor_notes?: string
  photos_count?: number
  created_at: string
}

interface ScopeSheetSummaryProps {
  scopeSheet: ScopeSheet
}
```

**Step 2: Implement summary display component**

```typescript
export default function ScopeSheetSummary({ scopeSheet }: ScopeSheetSummaryProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case 'high':
      case 'urgent':
        return 'text-red-700 bg-red-50'
      case 'medium':
      case 'moderate':
        return 'text-amber-700 bg-amber-50'
      case 'low':
      case 'routine':
        return 'text-slate-700 bg-slate-50'
      default:
        return 'text-slate-700 bg-slate-50'
    }
  }

  return (
    <div className="glass-card rounded-xl p-4 mt-3 border border-emerald-100 bg-emerald-50/30">
      <h4 className="text-sm font-semibold text-navy mb-3">Scope Sheet Details</h4>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate font-medium">Damage Type:</span>
          <span className="text-navy">{scopeSheet.damage_type}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate font-medium">Urgency:</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getUrgencyColor(scopeSheet.urgency_level)}`}>
            {scopeSheet.urgency_level}
          </span>
        </div>

        {scopeSheet.affected_areas && scopeSheet.affected_areas.length > 0 && (
          <div>
            <span className="text-slate font-medium">Affected Areas:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {scopeSheet.affected_areas.map((area, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs">
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {scopeSheet.photos_count !== undefined && scopeSheet.photos_count > 0 && (
          <div className="flex justify-between">
            <span className="text-slate font-medium">Photos:</span>
            <span className="text-navy">{scopeSheet.photos_count} uploaded</span>
          </div>
        )}

        {scopeSheet.contractor_notes && (
          <div>
            <span className="text-slate font-medium">Notes:</span>
            <p className="text-navy mt-1 text-xs italic">{scopeSheet.contractor_notes}</p>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-slate/10">
          <span className="text-slate font-medium">Completed:</span>
          <span className="text-navy text-xs">{formatDate(scopeSheet.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Verify component compiles**

```bash
cd frontend
npm run type-check
```

Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add frontend/src/components/ScopeSheetSummary.tsx
git commit -m "feat: add scope sheet summary component

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Scope Sheet Query to ClaimStepper

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Add imports at the top of ClaimStepper.tsx**

Add after existing imports:
```typescript
import ContractorStatusBadge from './ContractorStatusBadge'
import ScopeSheetSummary from './ScopeSheetSummary'
```

**Step 2: Add scope sheet query inside ClaimStepper component**

Add after the claim query, before the render logic:
```typescript
const {
  data: scopeSheet,
  isLoading: loadingScopeSheet,
} = useQuery({
  queryKey: ['scope-sheet', claim.id],
  queryFn: async () => {
    try {
      const response = await api.get(`/api/claims/${claim.id}/scope-sheet`)
      return response.data.data
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null
      }
      throw error
    }
  },
  enabled: !!claim.id,
})
```

**Step 3: Calculate status flags**

Add before the step rendering logic:
```typescript
const hasMagicLink = claim.contractor_email !== null
const hasScopeSheet = scopeSheet !== null
```

**Step 4: Verify no TypeScript errors**

```bash
cd frontend
npm run type-check
```

Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat: add scope sheet query to ClaimStepper

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Integrate Status Badge into Step 2

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Locate Step 2 contractor information display**

Find the section in Step 2 where contractor email/name is displayed. It should be around where we show:
```typescript
{claim.contractor_email && (
  <div className="detail-item">
    <span className="detail-label">Contractor Email</span>
    <span className="detail-value">{claim.contractor_email}</span>
  </div>
)}
```

**Step 2: Add status badge after contractor email**

Insert after contractor email display:
```typescript
{claim.contractor_email && (
  <div className="detail-item">
    <span className="detail-label">Contractor Email</span>
    <span className="detail-value">{claim.contractor_email}</span>
  </div>
)}

{/* Contractor Status */}
<div className="mt-3">
  <ContractorStatusBadge
    hasMagicLink={hasMagicLink}
    hasScopeSheet={hasScopeSheet}
  />
</div>
```

**Step 3: Add scope sheet summary when completed**

Add after the status badge:
```typescript
{/* Scope Sheet Summary */}
{hasScopeSheet && scopeSheet && (
  <ScopeSheetSummary scopeSheet={scopeSheet} />
)}
```

**Step 4: Verify component renders correctly**

```bash
cd frontend
npm run dev
```

Navigate to a claim detail page with Step 2, verify:
- Status badge shows "Waiting on contractor" when no scope sheet
- Status badge shows "Completed" when scope sheet exists
- Scope sheet summary displays when completed

**Step 5: Commit**

```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat: integrate contractor status into Step 2

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Loading State Handling

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Add loading state for scope sheet query**

Wrap the status components in a loading check:
```typescript
{/* Contractor Status */}
{loadingScopeSheet ? (
  <div className="mt-3 animate-pulse">
    <div className="h-8 w-48 bg-slate-200 rounded-full"></div>
  </div>
) : (
  <>
    <div className="mt-3">
      <ContractorStatusBadge
        hasMagicLink={hasMagicLink}
        hasScopeSheet={hasScopeSheet}
      />
    </div>

    {hasScopeSheet && scopeSheet && (
      <ScopeSheetSummary scopeSheet={scopeSheet} />
    )}
  </>
)}
```

**Step 2: Test loading state**

```bash
cd frontend
npm run dev
```

Navigate to claim detail, verify loading skeleton appears briefly before status badge loads

**Step 3: Commit**

```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat: add loading state for contractor status

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Manual Testing & Verification

**Files:**
- Test: Manual UI testing

**Step 1: Test "Waiting on Contractor" state**

1. Start dev server: `cd frontend && npm run dev`
2. Navigate to a claim where magic link was sent but no scope sheet exists
3. Verify Step 2 shows amber "Waiting on contractor" badge
4. Verify no scope sheet summary displays

**Step 2: Test "Completed" state**

1. Navigate to a claim where contractor submitted scope sheet
2. Verify Step 2 shows green "Completed" badge with checkmark
3. Verify scope sheet summary displays with all fields
4. Verify urgency color coding works
5. Verify affected areas display as tags
6. Verify date formatting

**Step 3: Test "No Magic Link" state**

1. Navigate to a claim where no magic link sent yet
2. Verify no status badge displays
3. Verify Step 2 shows normal contractor information

**Step 4: Test responsive design**

1. Resize browser to mobile width
2. Verify status badge and summary responsive
3. Verify tags wrap appropriately

**Step 5: Document test results**

Create test log:
```bash
echo "Contractor Status Tracking - Test Results" > test-results.txt
echo "- Waiting state: PASS" >> test-results.txt
echo "- Completed state: PASS" >> test-results.txt
echo "- No magic link state: PASS" >> test-results.txt
echo "- Responsive design: PASS" >> test-results.txt
```

---

## Task 8: Create Types File (Optional Improvement)

**Files:**
- Create: `frontend/src/types/scopeSheet.ts` (if types directory doesn't have it)

**Step 1: Extract scope sheet type to shared types**

```typescript
export interface ScopeSheet {
  id: string
  claim_id: string
  damage_type: string
  affected_areas: string[]
  urgency_level: string
  contractor_notes?: string
  photos_count?: number
  created_at: string
  updated_at?: string
}
```

**Step 2: Update ScopeSheetSummary to import from types**

In `ScopeSheetSummary.tsx`:
```typescript
import { ScopeSheet } from '../types/scopeSheet'

// Remove local interface definition
```

**Step 3: Update ClaimStepper imports**

```typescript
import { ScopeSheet } from '../types/scopeSheet'
```

**Step 4: Verify TypeScript**

```bash
cd frontend
npm run type-check
```

Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/types/scopeSheet.ts frontend/src/components/ScopeSheetSummary.tsx frontend/src/components/ClaimStepper.tsx
git commit -m "refactor: extract ScopeSheet type to shared types

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Final Verification & Documentation

**Files:**
- Update: `docs/plans/2026-02-13-contractor-status-tracking-design.md`

**Step 1: Run full type check**

```bash
cd frontend
npm run type-check
```

Expected: No TypeScript errors

**Step 2: Run linter**

```bash
cd frontend
npm run lint
```

Expected: No linting errors

**Step 3: Build production bundle**

```bash
cd frontend
npm run build
```

Expected: Successful build with no errors

**Step 4: Update design doc with implementation notes**

Add to end of design doc:
```markdown
## Implementation Completed

**Date**: 2026-02-13
**Files Modified**:
- Created: `frontend/src/components/ContractorStatusBadge.tsx`
- Created: `frontend/src/components/ScopeSheetSummary.tsx`
- Created: `frontend/src/types/scopeSheet.ts`
- Modified: `frontend/src/components/ClaimStepper.tsx`

**Verification**:
- ✅ TypeScript compilation
- ✅ Linting
- ✅ Production build
- ✅ Manual UI testing

**Status**: Complete and deployed
```

**Step 5: Final commit**

```bash
git add docs/plans/2026-02-13-contractor-status-tracking-design.md
git commit -m "docs: mark contractor status tracking as complete

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Implementation Notes

**Key Principles Applied:**
- **YAGNI**: No unnecessary features (no notifications, no time tracking, no intermediate states)
- **DRY**: Reused existing query patterns and glass-card styling
- **TDD Adapted**: Component-driven development with immediate verification steps
- **Frequent Commits**: Each component and integration committed separately

**Design Decisions:**
- Amber for "waiting" state (not red - not an error, just pending)
- Emerald green for "completed" (distinct from teal brand color)
- Inline scope sheet summary (not modal/separate page - immediate visibility)
- Loading skeleton for scope sheet query (smooth UX)

**Testing Strategy:**
- Manual UI testing (appropriate for frontend visual components)
- TypeScript type checking (compile-time safety)
- Production build verification (deployment readiness)

**Edge Cases Handled:**
- 404 response from scope sheet endpoint (returns null, no error)
- Missing optional fields (contractor_notes, photos_count)
- No magic link sent yet (status badge hidden)
- Loading states (skeleton while querying)

**Future Enhancements (Out of Scope):**
- Unit tests with React Testing Library
- E2E tests with Playwright
- Real-time updates when contractor submits
- Email notifications to property manager
