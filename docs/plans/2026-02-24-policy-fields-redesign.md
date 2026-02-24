# Insurance Policy Fields Redesign

**Date:** 2026-02-24
**Status:** Approved

## Problem

The current policy form has fields that don't match what users actually need:
- Coverage A/B/D limits are not relevant to the claim management workflow
- Deductible type (percentage/fixed) adds unnecessary complexity
- Missing carrier contact info (phone, email)
- Missing exclusions field (critical for claim coaching)
- "Effective/Expiration" date labels are less intuitive than "Start/End"

## New Field Set

| Field | Required | Notes |
|---|---|---|
| Carrier Name | ✓ | unchanged |
| Carrier Phone | — | new, optional |
| Carrier Email | — | new, optional |
| Policy Number | ✓ | unchanged |
| Policy Start Date | ✓ | renamed from Effective Date |
| Policy End Date | ✓ | renamed from Expiration Date |
| Deductible | ✓ | simplified to dollar amount only |
| Exclusions | ✓ | new, free text area |

## Removed Fields

- Coverage A Limit
- Coverage B Limit
- Coverage D Limit
- Deductible Type (percentage vs fixed)

## Display Mode Layout

1. **PDF row** (unchanged, at top)
2. **Carrier** — name large, phone + email beneath in small text (hidden if empty)
3. **Policy Number**
4. **Start Date / End Date** — side by side
5. **Deductible** — single `$` value
6. **Exclusions** — scrollable text block at bottom

## Files Changed

| File | Change |
|---|---|
| `backend/internal/database/migrations/000013_update_policy_fields.up.sql` | Add carrier_phone, carrier_email, exclusions; drop coverage limits and deductible_type |
| `backend/internal/database/migrations/000013_update_policy_fields.down.sql` | Reverse migration |
| `backend/internal/models/policy.go` | Update struct fields |
| `backend/internal/services/policy_service.go` | Update UpsertPolicyInput, remove coverage/deductible_type logic |
| `backend/internal/handlers/policy_handler.go` | No changes needed (service handles validation) |
| `frontend/src/components/PolicyCard.tsx` | New display layout + updated edit form |
