# Step 3 — ClaimCoach Estimate Line Items Design

**Date:** 2026-03-04

## Goal

Show the ClaimCoach estimate line items as a collapsible section on the Step 3 verdict screen, so users can see what damages are accumulated before receiving the carrier offer.

## Approach

Frontend-only change to `Step3ViabilityAnalysis.tsx`. No backend changes needed — `auditReport.generated_estimate` is already returned by `getAuditReport` and contains the full `GeneratedEstimate` JSON string.

## Data

`auditReport.generated_estimate` (JSON string) parses to:

```typescript
interface GeneratedEstimate {
  line_items: LineItem[]
  subtotal: number
  overhead_profit: number
  total: number
}

interface LineItem {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  total: number
  category: string
}
```

## UI

- Placement: Below `<VerdictCard>` on the complete/verdict state only
- Collapsed by default with toggle button showing "ClaimCoach Estimate (N items)" + total
- Each line item: description (bold) + total (right-aligned), category as subtle label below
- Footer row: Subtotal, O&P, Total
- Silent-fail: section hidden if `generated_estimate` is null or unparseable
- Visual style matches the "Pricing Gaps" collapsible in Step6AdjudicationEngine.tsx

## Files Touched

- Modify: `frontend/src/components/Step3ViabilityAnalysis.tsx`
