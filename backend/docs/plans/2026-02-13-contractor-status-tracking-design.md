# Contractor Status Tracking Design

**Date**: 2026-02-13
**Status**: Approved
**Author**: Design Session with User

## Problem Statement

Property managers send magic links to contractors but have no visibility into whether the contractor has completed their assessment. They need simple status tracking to know:
1. When they're waiting on the contractor
2. When the contractor has completed their work

## Solution: Two-State Status System

### State 1: Waiting on Contractor
- **Trigger**: Magic link sent for claim + no scope sheet exists yet
- **Display**: Badge showing "Waiting on contractor" or similar status
- **Location**: Claim journey Step 2 (after "Send link to contractor")

### State 2: Completed
- **Trigger**: Scope sheet exists for the claim (query by `claim_id`)
- **Display**:
  - "Completed" badge or checkmark
  - Summary of scope sheet data (damage type, affected areas, urgency, photos count)
- **Location**: Claim journey Step 2

## Technical Architecture

### Backend Changes
**None required** - Existing data structure already supports this:
- Scope sheets link to claims via `claim_id` field
- Photos/documents already associated with correct claims
- Magic links already reference `claim_id`

### Frontend Changes

#### Data Query
In `ClaimStepper.tsx` Step 2, query for scope sheet:
```typescript
// Query if scope sheet exists for this claim
const { data: scopeSheet } = useQuery({
  queryKey: ['scope-sheet', claim.id],
  queryFn: async () => {
    const response = await api.get(`/api/claims/${claim.id}/scope-sheet`)
    return response.data.data
  }
})
```

#### Status Display Logic
```typescript
// Determine status
const hasMagicLink = claim.contractor_email !== null
const hasScopeSheet = scopeSheet !== null

// State 1: Waiting
if (hasMagicLink && !hasScopeSheet) {
  // Show "Waiting on contractor" badge
}

// State 2: Completed
if (hasScopeSheet) {
  // Show "Completed" badge
  // Display scope sheet summary
}
```

#### UI Components
- Status badge (yellow/amber for waiting, green for completed)
- Scope sheet summary card showing:
  - Damage type
  - Affected areas
  - Urgency level
  - Number of photos uploaded
  - Contractor notes (if any)

## Data Flow

1. Property manager creates claim → sends magic link
2. Frontend shows "Waiting on contractor" status
3. Contractor completes 10-step wizard → submits scope sheet (is_draft = false)
4. Scope sheet saved with `claim_id`
5. Frontend detects scope sheet exists → shows "Completed" status + data summary
6. Property manager sees contractor has finished and can review scope sheet details

## Design Principles

### Simplicity
- Only two states: waiting or completed
- No intermediate progress tracking (draft steps not shown to property manager)
- No timestamps or detailed status history

### Clarity
- Visual distinction between states (color-coded badges)
- Clear action items (when waiting) vs information display (when completed)

### Existing Infrastructure
- Leverage existing backend endpoints
- No new database fields required
- Minimal frontend additions to existing ClaimStepper

## Success Criteria

1. Property manager can immediately see if contractor has completed assessment
2. No confusion about claim status - clear waiting vs completed states
3. Scope sheet data automatically appears in correct claim when contractor submits
4. Implementation uses existing data relationships without backend changes

## Out of Scope

- Detailed progress tracking (Step 5/10, etc.)
- Draft state visibility for property managers
- Notification system when contractor completes
- Time tracking or SLA monitoring
- Contractor-side status display
