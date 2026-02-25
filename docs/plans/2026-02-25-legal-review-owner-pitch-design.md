# Legal Review Owner Pitch — Design

**Goal:** Replace the complex token-gated legal escalation backend with a simple "copy/paste" Owner Escalation Pitch that the PM pastes into their own email client.

**Architecture:** The LEGAL_REVIEW verdict panel becomes a 3-phase state machine mirroring the DISPUTE_OFFER → Dispute Letter pattern. AI-generated pitch stored in `audit_reports.owner_pitch`. All token/email infrastructure removed.

---

## What Gets Removed

**Backend:**
- `backend/internal/services/legal_package_service.go` — entire file deleted
- `backend/internal/handlers/legal_package_handler.go` — entire file deleted
- Router routes: `/api/legal-approval/:token`, `/api/legal-approval/:token/respond`, `/api/claims/:id/legal-escalation`
- DB: `legal_approval_requests` table dropped; `legal_partner_name`, `legal_partner_email`, `owner_email`, `legal_escalation_status` columns removed from `claims`

**Frontend:**
- `sendLegalEscalation` function in `api.ts`
- Email form JSX in LEGAL_REVIEW panel of `Step6AdjudicationEngine.tsx`
- `legal_partner_name`, `legal_partner_email`, `owner_email`, `legal_escalation_status` fields from `Claim` type in `claim.ts`

---

## What Gets Added

**Migration 000016:**
```sql
-- Up
ALTER TABLE audit_reports ADD COLUMN owner_pitch TEXT;
ALTER TABLE claims DROP COLUMN IF EXISTS legal_partner_name;
ALTER TABLE claims DROP COLUMN IF EXISTS legal_partner_email;
ALTER TABLE claims DROP COLUMN IF EXISTS owner_email;
ALTER TABLE claims DROP COLUMN IF EXISTS legal_escalation_status;
DROP TABLE IF EXISTS legal_approval_requests;

-- Down
CREATE TABLE legal_approval_requests (...);
ALTER TABLE claims ADD COLUMN legal_escalation_status VARCHAR(50);
ALTER TABLE claims ADD COLUMN owner_email VARCHAR(255);
ALTER TABLE claims ADD COLUMN legal_partner_email VARCHAR(255);
ALTER TABLE claims ADD COLUMN legal_partner_name VARCHAR(255);
ALTER TABLE audit_reports DROP COLUMN IF EXISTS owner_pitch;
```

**AuditService.GenerateOwnerPitch(ctx, auditReportID, userID, orgID string):**
- Fetches audit report (with ownership check)
- Parses `pm_brain_analysis` JSON for delta, top_delta_drivers, coverage_disputes
- Fetches policy snapshot from `insurance_policies` for carrier name and deductible
- Builds prompt instructing LLM to write as a professional PM to their building owner:
  - Plain-English explanation of the delta
  - Why the carrier's position is unreasonable (cite top 2-3 delta drivers)
  - Recommendation to authorize a public adjuster or attorney
  - Tone: competent and professional, NOT legal jargon
- Saves result to `audit_reports.owner_pitch`
- Returns the generated pitch text

**New route:** `POST /api/claims/:id/audit/:auditId/owner-pitch`

**New api.ts function:** `generateOwnerPitch(claimId, auditId): Promise<string>`

---

## LEGAL_REVIEW UI State Machine

Driven by `savedAuditReport.owner_pitch` on mount (restores Phase 2 on reload).

```
Phase 1 — pitch_idle
  Red danger banner + gap summary (contractor vs carrier vs delta)
  [Generate Escalation Pitch →] button

    ↓ mutation fires, loading spinner

Phase 2 — pitch_ready
  Red banner + gap summary
  Scrollable pitch text block (styled like dispute letter)
  [Copy to Clipboard] button
  ─────────────────────
  Confirmation prompt: "Once you've emailed this to your property owner:"
  [✓ I Have Sent This to the Property Owner] button

    ↓ click → calls updateClaimStep({ current_step: 7, steps_completed: [..., 6] })

Phase 3 — pitch_acknowledged
  Green confirmation banner: "Owner notified. You've done your part."
  [Step Complete — Continue to Payments →] button
```

The "acknowledged" state is in-memory only (like `legalEscalationSubmitted` was). The actual step advance happens via `updateClaimStep`, same as all other step completions.

---

## Prompt Design for GenerateOwnerPitch

```
You are drafting an email for a professional Property Manager to send to their
building owner regarding an insurance claim dispute.

Claim context:
- Property: {address}
- Loss type: {loss_type} on {incident_date}
- Insurance carrier: {carrier_name}
- Policy deductible: ${deductible}

PM Brain analysis:
- Contractor estimate: ${total_contractor_estimate}
- Carrier offer: ${total_carrier_estimate}
- Gap (underpayment): ${total_delta}
- Top delta drivers: {top_delta_drivers}
- Coverage disputes: {coverage_disputes}

Write a professional email FROM the Property Manager TO the building owner.
Requirements:
- Open by explaining the carrier made their final offer
- Explain the dollar gap in plain English (not legal jargon)
- Cite 2-3 specific line items or coverage disputes as reasons the offer is unreasonable
- Recommend they authorize engaging a public adjuster or real estate attorney
- Close by asking the owner to reply with their approval to proceed
- Tone: competent, direct, professional — like a trusted advisor, not a lawyer
- Length: 3-4 short paragraphs
- Do not include a subject line or greeting salutation placeholders
```
