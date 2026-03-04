# Step 3 Estimate Line Items Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collapsed "ClaimCoach Estimate (N items)" section below the verdict card in Step 3 showing each line item and its cost.

**Architecture:** Single file change to `Step3ViabilityAnalysis.tsx`. The `auditReport.generated_estimate` JSON string is already fetched at Step 3 — parse it alongside the existing `viability_analysis` parse, store in local state, render a collapsible section below `<VerdictCard>` in the complete state.

**Tech Stack:** React, TypeScript, inline styles (matches existing component patterns)

---

### Task 1: Add types + parse generated_estimate

**Files:**
- Modify: `frontend/src/components/Step3ViabilityAnalysis.tsx`

**Context:**
The component already parses `auditReport.viability_analysis` (line 446) using the same JSON.parse pattern we'll follow.
`auditReport` is typed as `any` coming from `getAuditReport` — the `generated_estimate` field is a JSON string containing `{ line_items: LineItem[], subtotal: number, overhead_profit: number, total: number }`.

**Step 1: Add the two interfaces after the existing `Phase` type (line 16)**

Add directly after line 16 (`type Phase = ...`):

```typescript
interface LineItem {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  total: number
  category: string
}

interface GeneratedEstimate {
  line_items: LineItem[]
  subtotal: number
  overhead_profit: number
  total: number
}
```

**Step 2: Add state for parsed estimate**

The component already has `const [analysis, setAnalysis] = useState<ViabilityAnalysis | null>(null)` near the top of the function body. Add directly below it:

```typescript
const [generatedEstimate, setGeneratedEstimate] = useState<GeneratedEstimate | null>(null)
const [estimateOpen, setEstimateOpen] = useState(false)
```

**Step 3: Parse generated_estimate inside the existing useEffect (line 443)**

The existing useEffect (lines 443–452) already parses `auditReport.viability_analysis`. Extend it to also parse `generated_estimate`:

```typescript
useEffect(() => {
  if (!auditReport?.viability_analysis) return
  try {
    const saved: ViabilityAnalysis = JSON.parse(auditReport.viability_analysis)
    setAnalysis(saved)
    setPhase('complete')
  } catch {
    // If parse fails, stay on idle so user can re-analyze
  }
  if (auditReport?.generated_estimate) {
    try {
      const est: GeneratedEstimate = JSON.parse(auditReport.generated_estimate)
      if (est.line_items?.length > 0) setGeneratedEstimate(est)
    } catch {
      // silent fail — section just won't render
    }
  }
}, [auditReport])
```

**Step 4: Run TypeScript check**

```bash
cd "frontend" && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors related to this change.

**Step 5: Commit**

```bash
git add frontend/src/components/Step3ViabilityAnalysis.tsx
git commit -m "feat: parse generated_estimate in Step 3 viability analysis"
```

---

### Task 2: Add EstimateLineItems collapsible sub-component + render in complete state

**Files:**
- Modify: `frontend/src/components/Step3ViabilityAnalysis.tsx`

**Context:**
The complete/result state is at lines 541–564. It renders `<VerdictCard>` followed by a save error div. We insert the collapsible between those two. The visual style must match the existing "Pricing Gaps" collapsible in Step6AdjudicationEngine.tsx.

**Step 1: Add the EstimateLineItems sub-component**

Add a new function component directly above the `Step3ViabilityAnalysis` export. Place it after the last existing sub-component (find `function VerdictCard` — add after its closing brace):

```typescript
function EstimateLineItems({
  estimate,
  open,
  onToggle,
}: {
  estimate: GeneratedEstimate
  open: boolean
  onToggle: () => void
}) {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

  return (
    <div style={{
      border: '1px solid rgba(148,163,184,0.2)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'rgba(241,245,249,0.5)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
          ClaimCoach Estimate ({estimate.line_items.length} items)
        </span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', fontFamily: "'Work Sans', sans-serif" }}>
          {fmt(estimate.total)} {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 12px' }}>
          {estimate.line_items.map((item, i) => (
            <div
              key={i}
              style={{
                padding: '10px 0',
                borderTop: '1px solid #f1f5f9',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                  {item.description}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', fontFamily: "'Work Sans', sans-serif" }}>
                  {fmt(item.total)}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.category}</div>
            </div>
          ))}

          {/* Footer totals */}
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
              <span>Subtotal</span>
              <span>{fmt(estimate.subtotal)}</span>
            </div>
            {estimate.overhead_profit > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span>Overhead &amp; Profit</span>
                <span>{fmt(estimate.overhead_profit)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
              <span>Total</span>
              <span style={{ fontFamily: "'Work Sans', sans-serif" }}>{fmt(estimate.total)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Render it in the complete state**

Find the complete state block (lines 541–564). It currently looks like:

```tsx
  if (phase === 'complete' && analysis) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <VerdictCard
          analysis={analysis}
          deductibleValue={deductibleValue}
          onContinue={() => saveMutation.mutate()}
          onReanalyze={() => { setPhase('idle'); setAnalysis(null) }}
          isPending={saveMutation.isPending}
          readOnly={step3Done}
        />
        {saveMutation.isError && (
```

Insert `<EstimateLineItems>` between `</VerdictCard>` and the `{saveMutation.isError` block:

```tsx
  if (phase === 'complete' && analysis) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <VerdictCard
          analysis={analysis}
          deductibleValue={deductibleValue}
          onContinue={() => saveMutation.mutate()}
          onReanalyze={() => { setPhase('idle'); setAnalysis(null) }}
          isPending={saveMutation.isPending}
          readOnly={step3Done}
        />
        {generatedEstimate && (
          <EstimateLineItems
            estimate={generatedEstimate}
            open={estimateOpen}
            onToggle={() => setEstimateOpen(o => !o)}
          />
        )}
        {saveMutation.isError && (
```

**Step 3: Run TypeScript check**

```bash
cd "frontend" && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

**Step 4: Run Vite build**

```bash
cd "frontend" && npx vite build 2>&1 | tail -10
```

Expected: clean build, no errors.

**Step 5: Commit**

```bash
git add frontend/src/components/Step3ViabilityAnalysis.tsx
git commit -m "feat: show ClaimCoach estimate line items in Step 3 verdict"
```

---

## Manual Smoke Test

1. Open a claim that has already completed Step 3
2. Navigate to Step 3 — the verdict card should appear as before
3. Below the verdict card, a row "ClaimCoach Estimate (N items) $X,XXX ▼" should be visible
4. Click it → expands to show each line item with description + cost + category
5. Subtotal / O&P / Total footer rows appear at the bottom
6. Click again → collapses
7. If `generated_estimate` is null on an old audit report, the section is simply absent — no errors
