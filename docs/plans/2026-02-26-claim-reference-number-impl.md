# Claim Reference Number Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-generate a short `CC-XXXX` reference ID per organization on claim creation, and display it (or the carrier claim number once entered) as a badge on the ClaimCard.

**Architecture:** Backend counts existing claims for the org and formats `CC-%04d` before INSERT — the `claim_number` column already exists. Frontend adds a small reference pill to the ClaimCard header, showing `insurance_claim_number` when present, falling back to `claim_number`.

**Tech Stack:** Go (backend service), React/TypeScript (ClaimCard component), Tailwind CSS

---

### Task 1: Generate CC-XXXX on claim creation (backend)

**Files:**
- Modify: `backend/internal/services/claim_service.go:61-200`

**Step 1: Add the count query before the INSERT**

Inside `CreateClaim`, between the `stepsCompleted` block (line ~88) and the `claim := &models.Claim{...}` struct literal, add:

```go
// Generate ClaimCoach reference number (CC-XXXX, per-org sequential)
var claimCount int
countQuery := `SELECT COUNT(*) FROM claims WHERE organization_id = (
    SELECT organization_id FROM properties WHERE id = $1
)`
err = s.db.QueryRow(countQuery, input.PropertyID).Scan(&claimCount)
if err != nil {
    return nil, fmt.Errorf("failed to generate claim number: %w", err)
}
claimNumber := fmt.Sprintf("CC-%04d", claimCount+1)
```

**Step 2: Pass claimNumber instead of nil in the INSERT**

Find the line:
```go
nil, // claim_number
```

Replace with:
```go
claimNumber,
```

Also set it on the struct before INSERT so the returned model is consistent:
Add `ClaimNumber: &claimNumber,` to the `claim := &models.Claim{...}` block.

**Step 3: Build to verify no errors**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend"
go build ./...
```
Expected: no output (clean build)

**Step 4: Commit**

```bash
git add backend/internal/services/claim_service.go
git commit -m "feat: auto-generate CC-XXXX claim reference number on creation"
```

---

### Task 2: Display reference badge on ClaimCard (frontend)

**Files:**
- Modify: `frontend/src/components/ClaimCard.tsx`

**Step 1: Derive the display reference**

At the top of the component function body (after the existing `const timeAgo = ...` line), add:

```tsx
const referenceId = claim.insurance_claim_number || claim.claim_number || null
```

**Step 2: Add the badge to the card header**

The current header block (`div.flex.items-start.justify-between`) has the icon+title on the left and the delete button on the right. Insert the reference badge between the title `<div>` and the delete `<button>`:

```tsx
<div className="flex items-center gap-2 ml-auto mr-2">
  {referenceId && (
    <span className="text-xs font-mono font-medium text-slate bg-slate/10 px-2 py-0.5 rounded-full">
      {referenceId}
    </span>
  )}
</div>
```

So the full header becomes:
```tsx
<div className="flex items-start justify-between mb-4">
  <div className="flex items-center space-x-3">
    <span className="text-3xl">{icon}</span>
    <div>
      <h3 className="text-lg font-semibold text-navy">{damageLabel}</h3>
      <p className="text-sm text-slate">
        {claim.property?.legal_address || 'Property'}
      </p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    {referenceId && (
      <span className="text-xs font-mono font-medium text-slate bg-slate/10 px-2 py-0.5 rounded-full">
        {referenceId}
      </span>
    )}
    <button
      onClick={(e) => {
        e.stopPropagation()
        setShowDeleteConfirm(true)
      }}
      className="p-2 text-slate hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
      title="Delete claim"
    >
      ...existing SVG...
    </button>
  </div>
</div>
```

**Step 3: Check the Claim type has `claim_number`**

Verify `frontend/src/types/claim.ts` has `claim_number: string | null` — it does (already present). No change needed.

**Step 4: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend"
npx tsc --noEmit
```
Expected: no errors

**Step 5: Commit**

```bash
git add frontend/src/components/ClaimCard.tsx
git commit -m "feat: show claim reference badge (CC-XXXX) on claim card"
```

---

### Task 3: Verify end-to-end

**Step 1: Create a new claim via the UI**

- Go to any property → Create New Claim
- After creation, the card should show e.g. `CC-0001` (or the next number for your org) as a small pill in the header

**Step 2: Verify carrier number takes precedence**

- On a claim that has `insurance_claim_number` set (Step 5 data), confirm the pill shows the carrier number instead of `CC-XXXX`

**Step 3: Verify two claims of the same type are now distinguishable**

- Two "Hail Damage" claims on the same property should now show `CC-0001` and `CC-0002` (or whatever their org-sequential numbers are)
