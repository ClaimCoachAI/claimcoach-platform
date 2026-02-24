# Property Detail Page — Tab Layout Redesign

**Date:** 2026-02-24
**Status:** Approved

## Problem

The PropertyDetail page has too many stacked cards on the left column:
1. Property Details card
2. Policy Document card (standalone PDF upload/view)
3. Insurance Policy card (full policy info)

This is cluttered, especially on mobile. The main goal is managing claims, but claims are buried in a secondary column.

## Solution: Tab Layout (Option C)

Replace the two-column grid with a single-column tab layout.

### Header (unchanged)
- Property name + status badge + address (left)
- "New Claim" button (right)

### Tabs
Two pill-style tabs below the header:
- **Claims (N)** — default active, shows count badge
- **Policy & Details**

### Claims Tab
- Full-width stack of `ClaimCard` components
- Empty state with prompt when no claims exist

### Policy & Details Tab
Single card with two compact sections:
1. **Property** — Owner Entity + Created date inline (one row)
2. **Insurance Policy** — carrier/policy number, coverage limits, deductible, dates
   - PDF link or upload button lives **inside this card** at the top (no separate card)
   - Edit/Delete actions remain inside this tab

### Mobile
- Tabs full-width, content stacks single column
- No grid breakpoints needed

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/PropertyDetail.tsx` | Remove 2-column grid, add tab state, reorganize into two panels |
| `frontend/src/components/PolicyCard.tsx` | Accept `pdfUrl` + upload handler as props, render PDF inline at top of card |

## What Stays the Same
- All data fetching logic in `PropertyDetail.tsx`
- `ClaimCard` component (no changes)
- Delete policy confirmation modal
- `ReportIncidentModal`
