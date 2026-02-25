# Step 6: Post-Adjudication Strategy Engine — Design Doc

**Date:** 2026-02-25
**Status:** Approved

---

## Problem

Step 6 "Review Insurance Offer" currently runs a generic line-item comparison and generates a one-size-fits-all rebuttal letter. This creates several issues:
- No clear recommended action — the contractor sees numbers but no verdict
- Rebuttal is always generated regardless of whether it makes sense
- Legal escalation is triggered by a fixed dollar threshold, not claim context
- All logic is embedded in ClaimStepper.tsx (500+ lines), making it unmaintainable

## Solution: PM Brain Strategy Engine

Replace the existing `CompareEstimates` / `GenerateRebuttal` flow with a unified "PM Brain" analysis that returns a structured verdict and drives the entire UI.

---

## Status Model

Four mutually exclusive outcomes:

| Status | Plain English | Action |
|--------|--------------|--------|
| `CLOSE` | Carrier paid fairly | No letter needed — mark resolved |
| `DISPUTE_OFFER` | Carrier underpaid — dispute warranted | Generate Dispute Letter |
| `LEGAL_REVIEW` | Gap too large or coverage denied — escalate | Legal escalation form |
| `NEED_DOCS` | Carrier PDF was unreadable or incomplete | Re-upload prompt |

**Terminology rule:** Never say "Supplement" in the UI. Say "Dispute the Offer" or "Request More Funds."

---

## PM Brain JSON Schema

```typescript
interface PMBrainAnalysis {
  status: 'CLOSE' | 'DISPUTE_OFFER' | 'LEGAL_REVIEW' | 'NEED_DOCS'
  plain_english_summary: string       // 2-3 sentence verdict for the PM
  total_contractor_estimate: number
  total_carrier_estimate: number
  total_delta: number                 // contractor - carrier (negative = carrier overpaid)
  top_delta_drivers: Array<{
    line_item: string
    contractor_price: number
    carrier_price: number
    delta: number
    reason: string                    // Why the AI flagged this item
  }>
  coverage_disputes: Array<{
    item: string
    status: 'denied' | 'partial'
    contractor_position: string       // What the contractor claims
  }>
  required_next_steps: string[]       // Actionable bullets for the PM
  legal_threshold_met: boolean
}
```

The `dispute_letter` is stored separately in `audit_reports.dispute_letter` — generated on-demand only when `status === 'DISPUTE_OFFER'`.

---

## Backend Architecture (Option B — Two-Phase)

### Phase 1: Verdict (fast, runs on "Run Analysis" click)
```
POST /api/claims/:id/audit/generate        → unchanged (industry estimate from scope sheet)
POST /api/claims/:id/audit/:auditId/pm-brain → NEW: PM Brain analysis, saves pm_brain_analysis
```

### Phase 2: Dispute Letter (on-demand, only for DISPUTE_OFFER)
```
POST /api/claims/:id/audit/:auditId/dispute-letter → NEW: generates + saves dispute_letter
```

### Routes to REMOVE
```
DELETE  POST /api/claims/:id/audit/:auditId/compare
DELETE  POST /api/claims/:id/audit/:auditId/rebuttal
DELETE  GET  /api/rebuttals/:id
```

### DB Changes (migration 000015)
```sql
ALTER TABLE audit_reports ADD COLUMN pm_brain_analysis TEXT;
ALTER TABLE audit_reports ADD COLUMN dispute_letter TEXT;
```

---

## Frontend Architecture (Option C — Status-Driven Adaptive Layout)

Extract all Step 6 logic from ClaimStepper.tsx into `Step6AdjudicationEngine.tsx`.

### Phases (internal to component)

```
idle → uploading → parsing → ready → analyzing → verdict
                                              └─> letter_generating (DISPUTE_OFFER only)
```

### Verdict Panels by Status

**CLOSE**
- Green summary card with `plain_english_summary`
- `required_next_steps` list
- "Mark Resolved — Continue to Payments →" button

**DISPUTE_OFFER**
- Amber summary card
- Dollar comparison: Contractor Estimate | Carrier Paid | Gap
- Collapsible table of `top_delta_drivers`
- Collapsible list of `coverage_disputes` (if any)
- `required_next_steps` list
- "Generate Dispute Letter" button → triggers Phase 2
- Dispute letter display (after generation): pre-formatted text + copy button
- "Continue to Payments →" button (enabled after viewing letter)

**LEGAL_REVIEW**
- Red warning card with `plain_english_summary`
- `required_next_steps` list
- Legal escalation form (partner name/email, owner name/email)
- "Send for Legal Review →" button

**NEED_DOCS**
- Yellow warning card explaining what was missing
- `required_next_steps` list
- "Upload a Different Document" button (resets to upload phase)

---

## What Gets Removed

### Backend (audit_service.go)
- `CompareEstimates` method (~85 lines)
- `buildComparisonPrompt` helper (~35 lines)
- `GenerateRebuttal` method (~77 lines)
- `GetRebuttal` method

### Backend (audit_handler.go)
- `CompareEstimates` handler
- `GenerateRebuttal` handler
- `GetRebuttal` handler

### Frontend (ClaimStepper.tsx)
- 14 phase blocks in case 6 (~500 lines)
- State: `carrierEstimateFile`, `isPollingCarrierEstimate`, `rebuttalText`, `auditLoadingStep`, `discrepanciesOpen`, `legalEscalationDismissed`, `showLegalEscalationForm`, `legalEscalationSubmitted`, `legalPartnerName`, `legalPartnerEmail`
- Mutations: `uploadCarrierEstimateMutation`, `generateAuditMutation`, `generateRebuttalMutation`, `legalEscalationMutation`

### Frontend (api.ts)
- `compareEstimates`, `generateRebuttal`, `getRebuttal`

---

## Design Decisions

1. **No backward compat**: Clean slate. Existing audit reports with `comparison_data` are abandoned.
2. **Dispute letter on-demand**: Letter is expensive (~3s). User sees verdict first, generates letter separately.
3. **Legal escalation stays**: LEGAL_REVIEW status surfaces the existing legal escalation form.
4. **NEED_DOCS resets to upload**: PM can re-upload a better PDF without losing the claim.
5. **No Rebuttals table**: Letter stored directly in `audit_reports.dispute_letter`. Simplifies schema.
