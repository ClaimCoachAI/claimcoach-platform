# Phase 5: Deductible Comparison - Design Document

**Date:** 2026-02-05
**Status:** Approved for Implementation
**Complexity:** ⭐⭐ Medium
**Time Estimate:** 1-2 days

---

## Goal

Add a smart deductible comparison gate that helps property managers decide if a claim is worth filing by comparing contractor estimate against policy deductible.

## Value Proposition

**HIGH VALUE** - Prevents wasting time and money on claims that won't pay out. If estimate is below deductible, filing the claim costs time/effort with zero payout.

---

## Architecture & Data Flow

### Database Changes

**New Field on `claims` table:**
```sql
ALTER TABLE claims
ADD COLUMN contractor_estimate_total DECIMAL(10,2);
```

- Nullable field
- Only populated when property manager manually enters contractor estimate
- Stores total cost from contractor's estimate

### Comparison Logic

```
IF contractor_estimate_total > policy.deductible_calculated:
  → "Worth Filing" (estimate exceeds deductible)
  → Expected payout = estimate - deductible
ELSE:
  → "Not Worth Filing" (estimate below or equal to deductible)
  → Would receive $0 payout
```

### Key Calculations

- **Deductible**: From `policy.deductible_calculated` (already computed)
- **Estimate**: From user input (contractor_estimate_total)
- **Delta**: `contractor_estimate_total - deductible_calculated`
  - Positive delta = Potential payout amount
  - Negative/zero delta = Claim not worth filing

### Workflow Integration

**Location:** Claim Detail/Workspace page (ClaimDetail.tsx)

**When to Show:**
- Claim status is `draft` or `assessing`
- Policy exists on the claim
- Hide after claim is `filed`, `closed`, or `settled`

**Activity Logging:**
- Log when estimate is entered
- Activity type: `estimate_entered`
- Metadata includes: estimate_total, deductible, recommendation

---

## Backend Implementation

### API Endpoint

```
PATCH /api/claims/:id/estimate
Authorization: Bearer {JWT token}

Request Body:
{
  "contractor_estimate_total": 15000.00
}

Response 200 OK:
{
  "claim": {
    "id": "claim-uuid",
    "contractor_estimate_total": 15000.00,
    ...
  },
  "comparison": {
    "deductible": 10000.00,
    "estimate": 15000.00,
    "delta": 5000.00,
    "recommendation": "worth_filing"  // or "not_worth_filing"
  }
}

Error Responses:
- 401: Unauthorized
- 403: Forbidden (different organization)
- 404: Claim not found
- 400: Invalid input (negative number, etc.)
```

### Service Layer (claim_service.go)

**New Method:**
```go
func (s *ClaimService) UpdateEstimate(
    claimID string,
    estimateTotal float64,
    userID string,
    orgID string
) (*Claim, *ComparisonResult, error)
```

**Steps:**
1. Validate claim ownership (organization_id check)
2. Fetch claim with policy (JOIN query)
3. Validate estimate > 0
4. Update claim.contractor_estimate_total
5. Calculate comparison result
6. Log activity (estimate_entered)
7. Return claim + comparison

**Comparison Result Struct:**
```go
type ComparisonResult struct {
    Deductible     float64 `json:"deductible"`
    Estimate       float64 `json:"estimate"`
    Delta          float64 `json:"delta"`
    Recommendation string  `json:"recommendation"` // "worth_filing" | "not_worth_filing"
}
```

**Activity Metadata:**
```json
{
  "estimate_total": 15000.00,
  "deductible": 10000.00,
  "delta": 5000.00,
  "recommendation": "worth_filing"
}
```

---

## Frontend Implementation

### UI Design

**Deductible Analysis Card** (in ClaimDetail.tsx)

```
┌─────────────────────────────────────────┐
│ 📊 Deductible Analysis                  │
├─────────────────────────────────────────┤
│ Policy Deductible: $10,000              │
│                                         │
│ Contractor Estimate Total:              │
│ [$ _________] [Calculate]               │
└─────────────────────────────────────────┘
```

**After calculation - Worth Filing (Green):**
```
┌─────────────────────────────────────────┐
│ 📊 Deductible Analysis                  │
├─────────────────────────────────────────┤
│ Policy Deductible: $10,000              │
│ Contractor Estimate: $15,000            │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ✅ WORTH FILING                     │ │
│ │ Estimate exceeds deductible         │ │
│ │ Expected payout: $5,000             │ │
│ │                                     │ │
│ │ [Proceed to File Claim]             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**After calculation - Not Worth Filing (Red):**
```
┌─────────────────────────────────────────┐
│ 📊 Deductible Analysis                  │
├─────────────────────────────────────────┤
│ Policy Deductible: $10,000              │
│ Contractor Estimate: $8,000             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️  NOT WORTH FILING                │ │
│ │ Loss is $2,000 below deductible     │ │
│ │ Filing would result in $0 payout    │ │
│ │                                     │ │
│ │ [Close Claim - Not Filing]          │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Component Structure

**Location:** Add section to `ClaimDetail.tsx`

**Placement:** After documents section, before activity timeline

**React Query Mutation:**
```typescript
const updateEstimateMutation = useMutation({
  mutationFn: (estimateTotal: number) =>
    api.patch(`/api/claims/${claimId}/estimate`, {
      contractor_estimate_total: estimateTotal
    }),
  onSuccess: (response) => {
    setComparison(response.data.comparison)
    queryClient.invalidateQueries(['claim', claimId])
    queryClient.invalidateQueries(['activities', claimId])
  }
})
```

**State Management:**
```typescript
const [estimateInput, setEstimateInput] = useState('')
const [comparison, setComparison] = useState<ComparisonResult | null>(null)
```

### Visual Design

**Colors:**
- Worth Filing: `bg-green-50 border-green-200 text-green-800`
- Not Worth Filing: `bg-red-50 border-red-200 text-red-800`

**Input:**
- Currency formatting ($XX,XXX.XX)
- Number input with validation
- Disabled during mutation

**Buttons:**
- Green "Proceed to File" → Updates status to `filed`
- Red "Close Claim" → Updates status to `closed`
- Only shown after calculation

### Visibility Rules

**Show section when:**
- Claim status is `draft` OR `assessing`
- Policy exists (has deductible_calculated)

**Hide section when:**
- Claim status is `filed`, `closed`, `settled`, etc.
- No policy attached

---

## Testing Strategy

### Backend Tests

**Service Layer** (`claim_service_test.go`):
- `TestUpdateEstimate_Success` - Happy path
- `TestUpdateEstimate_UnauthorizedOrg` - Cannot update other org's claim
- `TestUpdateEstimate_InvalidAmount` - Negative/zero validation
- `TestUpdateEstimate_NegativeDelta` - Estimate below deductible
- `TestUpdateEstimate_PositiveDelta` - Estimate above deductible
- `TestUpdateEstimate_EqualDeductible` - Edge case (treat as not worth filing)
- `TestUpdateEstimate_ActivityLogged` - Verify activity created

**Handler Tests** (`claim_handler_test.go`):
- `TestPatchClaimEstimate_Success` - 200 response
- `TestPatchClaimEstimate_Unauthorized` - 401 without token
- `TestPatchClaimEstimate_WrongOrg` - 403 different org
- `TestPatchClaimEstimate_NotFound` - 404 invalid claim ID
- `TestPatchClaimEstimate_InvalidJSON` - 400 malformed request

### Frontend Tests

**Component Tests** (`ClaimDetail.test.tsx`):
- Renders deductible analysis section when status is `draft`
- Shows correct policy deductible
- Accepts estimate input
- Calculates and displays "worth filing" correctly
- Calculates and displays "not worth filing" correctly
- Hides section when status is `filed`
- Disables input during loading
- Shows error on failed mutation

### Edge Cases

1. **Estimate exactly equals deductible**
   - Treat as "not worth filing" ($0 payout)

2. **No policy on claim**
   - Don't show section (shouldn't happen, but handle gracefully)

3. **Very large numbers**
   - Test $1,000,000+ estimates
   - Ensure no overflow

4. **Decimal values**
   - Test $10,250.50 estimates
   - Proper rounding and display

5. **Status transitions**
   - Section disappears after filing
   - Estimate persists if user goes back to `assessing`

### Manual Testing Flow

1. Create test claim with policy (deductible: $10,000)
2. Ensure status is `draft`
3. Navigate to claim detail page
4. See deductible analysis section
5. Enter estimate: $8,000
6. Click "Calculate"
7. Verify red "Not Worth Filing" banner
8. Verify message: "Loss is $2,000 below deductible"
9. Update estimate to $15,000
10. Click "Calculate"
11. Verify green "Worth Filing" banner
12. Verify message: "Expected payout: $5,000"
13. Click "Proceed to File Claim"
14. Verify status updates to `filed`
15. Verify section disappears
16. Check activity log shows estimate entry

---

## Implementation Notes

### Migration Strategy

1. Add column via migration (nullable, no default)
2. Existing claims: estimate_total = NULL (not entered yet)
3. Backwards compatible

### Future Enhancements (Post-MVP)

1. **Auto-extraction from PDF** (Phase 6+)
   - Parse contractor estimate PDF
   - Extract total automatically
   - Fall back to manual if extraction fails

2. **Multiple estimates**
   - Store array of estimates
   - Compare lowest/average to deductible

3. **Historical data**
   - Track estimate changes over time
   - Show audit trail

4. **Alerts**
   - Email/SMS when estimate exceeds deductible
   - Notify when contractor uploads estimate

### Known Limitations (MVP)

- Manual entry only (no auto-extraction)
- Single estimate per claim
- Simple comparison (no range/variance)
- No partial claims consideration
- Assumes full replacement cost

---

## Success Criteria

**Feature is complete when:**

1. ✅ Property manager can enter contractor estimate
2. ✅ System calculates comparison instantly
3. ✅ Shows clear recommendation (worth filing or not)
4. ✅ Displays expected payout amount
5. ✅ Logs activity when estimate is entered
6. ✅ All tests pass (backend + frontend)
7. ✅ Works on mobile devices
8. ✅ Handles edge cases gracefully

**Business Value Delivered:**

- Property managers can make informed filing decisions
- Prevents wasting time on unprofitable claims
- Clear data-driven recommendations
- Audit trail of estimate entries

---

## Deployment Notes

- No configuration changes required
- Migration runs automatically
- No breaking changes
- Backwards compatible with existing claims

**Rollout:** Can deploy immediately after testing, no special considerations.
