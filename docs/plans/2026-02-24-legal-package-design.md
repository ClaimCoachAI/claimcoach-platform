# Legal Package Feature — Design Document

**Date:** 2026-02-24
**Status:** Design approved, ready for implementation planning

---

## Overview

After the AI Audit step (Step 6) completes and reveals a significant carrier underpayment, the PM should be able to escalate the claim to a legal partner. The full flow is:

1. AI analysis shows a large delta (carrier underpaid)
2. PM is prompted to pursue legal action
3. PM enters legal partner info and owner contact
4. System emails homeowner an approval request with a clear summary of the situation
5. Homeowner approves (or declines) via a standalone web page
6. On approval, system auto-generates a ZIP (Xactimate-style PDF + contractor photos) and emails it to the lawyer
7. Lawyer reviews and decides whether to take the case

---

## Scope

This document covers all six components:

1. Discrepancy summary UI (collapse verbose list)
2. AI-triggered legal action prompt in ClaimStepper
3. Legal escalation form (inline in Step 6)
4. Homeowner approval page (standalone route)
5. Xactimate-style PDF generation (server-side Go)
6. ZIP assembly and email to legal partner

---

## Component 1 — Discrepancy Summary UI

### Current State

After analysis, `audit-discrepancies` renders every discrepancy item as a full card: item name, industry price, carrier price, delta badge, and justification paragraph. For claims with many discrepancies this is a long scroll.

### New State

The three-cell totals grid (Industry Estimate / Carrier Estimate / Delta Underpaid) is preserved unchanged — it already communicates the most important numbers at a glance.

Replace the discrepancy list with a single compact summary row:

```
[ N discrepancies found ]  [ Top gap: {item name} +${delta} ]  [ View Details ▾ ]
```

"View Details" is a collapsible toggle using the same accordion pattern already present for the photos section. The `discrepanciesOpen` boolean state defaults to `false`. When expanded, the existing item cards render beneath.

**State change:** Add `const [discrepanciesOpen, setDiscrepanciesOpen] = useState(false)` to ClaimStepper.

**Logic for "Top gap":** Sort `comparisonData.discrepancies` by `delta` descending, take `[0]`.

No new API calls. No backend changes for this component.

---

## Component 2 — AI-Triggered Legal Action Prompt

### Trigger Condition

Renders when all of the following are true:

- `hasAuditResult && comparisonData !== null`
- `comparisonData.summary.total_delta >= 10000` (attorneys get involved at $10k+)
- `!legalEscalationDismissed`
- `!showLegalEscalationForm`
- The claim does not already have `legal_escalation_status` set (no repeat prompt if already escalated)

**Rebuttal letter** is shown instead when delta is between $500 and $9,999.99. The two paths are mutually exclusive — never shown together.

### Visual Design

An amber-bordered callout card. Uses the `glass-card` base class with a `border-left: 3px solid #d97706` override. The amber color deliberately echoes the delta badge color already in use — the visual connection communicates "this callout is about that number."

Rendered **below** the discrepancy summary block and **above** the "Review Complete — Continue to Payments" button.

```
┌──────────────────────────────────────────────────────────────┐
│  You may be leaving $4,339.90 on the table                   │
│  The carrier underpaid by a significant amount relative to   │
│  industry-standard repair costs. You may have grounds to     │
│  escalate this claim with a legal partner.                   │
│                                                              │
│  [ Pursue Legal Action ]          [ Skip for Now ]           │
└──────────────────────────────────────────────────────────────┘
```

### State Management

Two new booleans added to ClaimStepper:

```ts
const [legalEscalationDismissed, setLegalEscalationDismissed] = useState(false)
const [showLegalEscalationForm, setShowLegalEscalationForm] = useState(false)
```

- **Skip for Now:** sets `legalEscalationDismissed = true`, prompt disappears, PM continues to payment step
- **Pursue Legal Action:** sets `showLegalEscalationForm = true`, prompt transitions to the escalation form

Both states are local/session-only. If the PM reloads, the prompt reappears (correct: they have not committed to anything). The prompt also does not reappear once `claim.legal_escalation_status` is non-null — the claim record is the durable source of truth.

---

## Component 3 — Legal Escalation Form

Renders inline in Step 6 when `showLegalEscalationForm === true`, replacing the prompt callout.

### Fields

```
Legal Partner Name    [ _________________________ ]
Legal Partner Email   [ _________________________ ]
Owner Name            [ auto-filled: {property.owner_entity_name} ]
Owner Email           [ _________________________ ]
```

Owner name pre-fills from `claim.property.owner_entity_name` (already on the Claim object in ClaimStepper). Owner email is blank — the PM must provide it.

### Submission

`POST /api/claims/:id/legal-escalation`

Request body:
```json
{
  "legal_partner_name": "Sarah Chen",
  "legal_partner_email": "schen@chenlaw.com",
  "owner_name": "John Doe",
  "owner_email": "john@example.com"
}
```

On success: form transitions to a confirmation state within Step 6:

```
Approval request sent to John Doe (john@example.com).
Once they approve, the legal package will be automatically sent to Sarah Chen.
```

The "Review Complete — Continue to Payments" button remains visible below this confirmation so the PM is not blocked from advancing.

### Cancel

Cancel button sets `showLegalEscalationForm = false` and `legalEscalationDismissed = false` — the prompt reappears so the PM can reconsider.

---

## Component 4 — Homeowner Approval Page

**URL:** `{frontend_url}/legal-approval/{token}`

A new standalone route in the React app, analogous to `/upload/:token` for the contractor upload page. Publicly accessible, no auth required, token-gated. Not rendered inside ClaimStepper.

### Data Fetched

`GET /api/legal-approval/:token` returns:

```json
{
  "property_address": "123 Main Street, Austin TX 78701",
  "loss_type": "Hail Damage",
  "incident_date": "2024-09-14",
  "carrier_estimate": 5240.80,
  "industry_estimate": 9580.70,
  "delta": 4339.90,
  "owner_name": "John Doe",
  "legal_partner_name": "Sarah Chen",
  "status": "pending"
}
```

If `status` is not `pending` (already responded or expired), the page shows a neutral message: "This link is no longer active."

### Page Layout

Four sections rendered in vertical order:

**Section A — What happened (plain English)**

> Your property at 123 Main Street, Austin TX sustained hail damage on September 14, 2024.

One sentence. No jargon.

**Section B/C — The financial picture (visual comparison)**

Two rows in a bordered card with subtle background:

```
Insurance carrier offered:    $5,240.80
Industry standard estimate:   $9,580.70
─────────────────────────────────────────
Potential underpayment:       $4,339.90  ← amber, bold
```

The delta row in amber (`#d97706`) — same color system as the main app. This is intentional: it reads as "this is the problem number."

**Section D — What happens if you approve**

A numbered list in plain English, no legal jargon:

1. Your property manager will send your full claim file to a legal partner for review.
2. The legal partner will assess whether they believe you have grounds for additional compensation.
3. If they take your case, they will negotiate with the insurance carrier on your behalf.
4. Legal fees are typically contingency-based — you pay nothing unless you recover additional funds.

**CTA Row**

```
[ Decline ]                    [ Approve — Send to Legal Partner ]
```

- "Approve" is a filled button (dark, prominent)
- "Decline" is a ghost/text button (visible but secondary)

Both are clearly labeled. The Decline path is not hidden — this is essential for the homeowner to trust the page.

**Post-Response State**

After either action, the page transitions to a simple, neutral confirmation:

> Thank you, John. Your decision has been recorded and your property manager has been notified.

No retry button. No navigation. The token is now consumed.

---

## Component 5 — Xactimate-Style PDF Generation

### Library

Add `github.com/go-pdf/fpdf` to `go.mod`. This library is pure Go with no CGO — it works on AWS Lambda without any native dependencies.

### New File

`backend/internal/services/legal_package_service.go`

Exports a `GeneratePDF(claim *models.Claim, auditReport *models.AuditReport, scopeSheet *models.ScopeSheet) ([]byte, error)` function.

### PDF Structure

**Page size:** US Letter (8.5" × 11"), 0.75" margins.

**Header block:**

```
PROPERTY DAMAGE ESTIMATE                  Prepared: February 24, 2026
──────────────────────────────────────────────────────────────────────
Property:   123 Main Street, Austin TX 78701
Claim No:   CCL-2024-0047
Loss Type:  Hail Damage
Incident:   September 14, 2024
Adjuster:   Mike Torres
```

Left-aligned label column (70pt wide), right-aligned value column. Thin horizontal rule below.

**Line Items Table** (from `generated_estimate.line_items`):

Column headers:
```
Description                    Qty    Unit    Unit Cost       Total
```

Items grouped by `category` field. Category name rendered as a bold section header row spanning full width (light gray background). Item rows alternate white / `#f9fafb`. Right-align numeric columns.

Footer rows (no category):
```
                                                Subtotal   $9,450.00
                                           O&P (10%)         $945.00
                                               TOTAL       $9,580.70
```

TOTAL row in bold.

**Discrepancy Comparison Table** (from `comparison_data`):

Section title: `COMPARISON — CARRIER VS. INDUSTRY STANDARD`

Columns: Description / Industry Estimate / Carrier Estimate / Underpayment

Summary row at bottom:
```
TOTAL UNDERPAYMENT                                            $4,339.90
```

Total Underpayment in bold amber (`#d97706` if the library supports color; black bold if not — clarity over aesthetics).

**Footer (every page):**

```
This estimate was prepared using current industry-standard pricing and is provided
for informational purposes in connection with an insurance claim dispute. Page N of M.
```

### No Branding

No logo. No ClaimCoach name. No property manager name. The document is intentionally neutral — it reads as an objective estimate, which is what lawyers need.

---

## Component 6 — ZIP Assembly and Email to Legal Partner

### Trigger

`POST /api/legal-approval/:token/respond` with `{ "action": "approve" }`.

### Service Method

`LegalEscalationService.ProcessApproval(ctx, token string) error`

Steps in order:

1. Fetch `legal_approval_requests` row, verify `status = 'pending'` and `expires_at > now()`
2. Begin DB transaction: set `status = 'approved'`, `responded_at = now()`
3. Fetch claim (with property), audit report, scope sheet
4. Fetch all `contractor_photo` documents for the claim from `documents` table
5. Generate PDF in memory via `GeneratePDF(...)` → `[]byte`
6. For each photo document: call `storage.GenerateDownloadURL(doc.FileURL)`, HTTP GET the bytes
7. Build ZIP in memory using Go's stdlib `archive/zip`:
   - `discrepancy-report.pdf`
   - `photos/001_{file_name}`, `photos/002_{file_name}`, etc. (zero-padded index preserves order)
8. Send ZIP via SendGrid to `claim.legal_partner_email` as an attachment
   - Subject: `Claim File — {property_address} ({loss_type})`
   - Body: brief plain-text cover note with property, delta, owner name
9. Send confirmation email to PM (`claim.created_by_user_id`'s email) — use existing `SendClaimCoachNotification` pattern
10. Update claim: `legal_escalation_status = 'sent_to_lawyer'`
11. Commit transaction

If any step from 5 onward fails, the DB transaction is rolled back. The approval request remains `pending` so the PM can retry.

### ZIP is Never Stored

The ZIP is generated in memory and sent via email. It is not written to Supabase Storage. This avoids storage costs, avoids presigned URL expiry concerns, and keeps the implementation simple.

---

## New API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/claims/:id/legal-escalation` | Required | Store legal partner + owner info, send owner approval email |
| `GET` | `/api/legal-approval/:token` | None (public) | Return claim summary for homeowner approval page |
| `POST` | `/api/legal-approval/:token/respond` | None (public) | Record approve/decline; trigger ZIP + email on approve |

---

## Database Migration — 000011

```sql
-- Add legal escalation fields to claims
ALTER TABLE claims
    ADD COLUMN legal_partner_name    VARCHAR(255),
    ADD COLUMN legal_partner_email   VARCHAR(255),
    ADD COLUMN legal_escalation_status VARCHAR(50)
        CHECK (legal_escalation_status IN (
            'pending_approval', 'approved', 'declined', 'sent_to_lawyer'
        ));

-- Homeowner approval requests
CREATE TABLE legal_approval_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token        VARCHAR(255) NOT NULL UNIQUE,
    owner_name   VARCHAR(255) NOT NULL,
    owner_email  VARCHAR(255) NOT NULL,
    status       VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
    expires_at   TIMESTAMP NOT NULL,
    responded_at TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_approval_token ON legal_approval_requests(token);
CREATE INDEX idx_legal_approval_claim  ON legal_approval_requests(claim_id);
CREATE INDEX idx_legal_approval_status ON legal_approval_requests(status);
```

---

## New Backend Files

| File | Purpose |
|------|---------|
| `backend/internal/services/legal_package_service.go` | PDF generation, ZIP assembly, email orchestration |
| `backend/internal/handlers/legal_package_handler.go` | HTTP handlers for 3 new endpoints |
| `backend/internal/models/legal_approval.go` | `LegalApprovalRequest` model |

---

## New Frontend Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/LegalApprovalPage.tsx` | Standalone homeowner approval page |
| `frontend/src/lib/legalApproval.ts` | API calls for the approval page |

**Modified files:**

| File | Change |
|------|--------|
| `frontend/src/components/ClaimStepper.tsx` | Collapse discrepancy list, add legal prompt + escalation form |
| `backend/internal/api/router.go` | Register 3 new routes |
| `backend/internal/services/email_service.go` | Add `SendOwnerApprovalEmail` and `SendLegalPartnerEmail` to interface |
| `backend/internal/services/sendgrid_email_service.go` | Implement the two new email methods |
| `backend/go.mod` | Add `github.com/go-pdf/fpdf` |

---

## New Email Types

### Owner Approval Request Email

**To:** homeowner/investor
**Subject:** `Action Required — Review Your Claim at {property_address}`

**Body structure:**
- Greeting by owner name
- One-paragraph plain-language summary of what happened and what the analysis found
- A large CTA button: "Review and Respond"
- Expiry notice: "This link expires in 7 days."

### PM Confirmation Email

**To:** PM (claim creator)
**Subject:** `Legal Package Sent — {property_address}`

**Body:** "{Owner name} approved the legal escalation. A full claim package has been sent to {legal partner name} at {legal partner email}."

### Legal Partner Email

**To:** lawyer
**Subject:** `Claim File — {property_address} ({loss_type})`

**Body (plain text):**
```
Please find attached a claim file for review.

Property: {address}
Loss Type: {loss_type}
Incident Date: {date}
Carrier Estimate: ${carrier}
Industry Estimate: ${industry}
Underpayment: ${delta}

This package was submitted by the property owner for potential legal representation.
The attached ZIP contains a detailed estimate comparison and contractor site photos.
```

No ClaimCoach branding. Neutral, professional, direct.

---

## Approach Rationale

**Server-side PDF (chosen)** — `go-pdf/fpdf` generates the PDF in Go on the backend. Works on Lambda (pure Go, no CGO), triggered automatically on homeowner approval without requiring the PM to be present.

**In-memory ZIP (chosen)** — Built and emailed in one pass. Not stored in Supabase. Avoids storage costs and URL expiry management.

**Client-side PDF (rejected)** — jsPDF or react-pdf could generate the PDF in the browser, but cannot be triggered server-side when the homeowner approves while the PM is logged out.

**Store PDF in Supabase, send link (rejected)** — Adds complexity: presigned URL expiry, storage lifecycle management, cleanup jobs. Unnecessary for this use case where email attachment is sufficient.

---

## Delta Thresholds — Escalation vs. Rebuttal

Two mutually exclusive paths based on delta size:

| Delta | Action shown |
|-------|-------------|
| < $500 | Neither — too small to act on |
| $500 – $9,999.99 | **Rebuttal letter only** — attorneys don't get involved at this level; PM negotiates directly with the carrier |
| ≥ $10,000 | **Legal action prompt only** — rebuttal letter is not shown; this is an attorney-level case |

These are never shown simultaneously. The $10,000 threshold should be an environment variable (`LEGAL_ESCALATION_THRESHOLD_DOLLARS=10000`) so it can be tuned without a deploy.

---

## Out of Scope for This Feature

- Owner e-signature (wet or digital) — the "approve" button is consent but not a formal e-signature. A future iteration can add DocuSign or a typed-name signature field.
- Storing the generated PDF in Supabase for later re-download by the PM.
- Sending the package via a shared link rather than email attachment.
- Multi-lawyer routing or org-level default legal partner.
- SMS approval option for the homeowner.
