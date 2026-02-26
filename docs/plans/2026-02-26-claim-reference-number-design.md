# Claim Reference Number Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

When a property has multiple claims of the same type (e.g., two Hail Damage claims), the claim cards look identical. Users cannot distinguish between them at a glance.

## Solution

1. Auto-generate a short ClaimCoach reference ID (`CC-XXXX`) per organization at claim creation time.
2. Display the reference on the claim card as a small badge.
3. Once the user enters the carrier's claim number (`insurance_claim_number`), show that instead.

## Backend

### Auto-generation on claim creation
- Count existing claims for the organization: `SELECT COUNT(*) FROM claims WHERE organization_id = $1`
- Format: `CC-%04d` → e.g., `CC-0001`, `CC-0042`
- Set `claim_number` on INSERT (field already exists in the schema as nullable)
- MVP approach — acceptable slight race condition risk at current scale

### No migration needed
The `claim_number` column already exists in the `claims` table. It is currently nullable and unused; we simply populate it on creation going forward.

## Frontend

### ClaimCard badge
- New small reference pill in the top-right of the card header area
- Display logic:
  - `insurance_claim_number` set → show carrier number (e.g., `INS-ABC123`)
  - Otherwise → show `claim_number` (e.g., `CC-0001`)
- Styled as a muted secondary pill — visible but doesn't compete with the damage type title
- "Started X days ago" timestamp is retained

## Files Affected

| File | Change |
|------|--------|
| `backend/internal/services/claim_service.go` | Generate `CC-XXXX` on CreateClaim |
| `frontend/src/components/ClaimCard.tsx` | Add reference badge to card header |

## Out of Scope (MVP)
- Backfilling `claim_number` for existing claims
- Editable claim numbers
- Per-org number reset
