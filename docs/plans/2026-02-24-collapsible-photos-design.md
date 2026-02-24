# Collapsible Contractor Photos Section — Design

**Date:** 2026-02-24
**Status:** Approved

## Problem

The contractor photos list in ClaimStepper renders every photo as a full-height row with a large teal "Download" button. With many photos this becomes very tall and visually heavy.

## Solution

Replace the current photos block with a collapsible accordion row that:
- Shows a compact `📷 Photos (N)` header bar at all times
- Expands/collapses inline on click
- Uses a small `⬇` SVG icon instead of a text button per row
- Auto-opens when 1–2 photos, collapsed by default for 3+

## Visual Design

**Collapsed:**
```
📷 Photos (5)                                    ›
```

**Expanded:**
```
📷 Photos (5)                                    ⌄
──────────────────────────────────────────────────
  image_roof_front.jpg                          ⬇
  image_roof_back.jpg                           ⬇
  image_vents.jpg                               ⬇
```

## Behavior

- Chevron rotates 90° on expand (`transition-transform`)
- List uses `max-height` transition for smooth expand/collapse
- Filenames truncate with ellipsis if too long
- Download icon (`text-slate`, `hover:text-teal`) replaces text button
- Auto-open: `isOpen` initializes to `contractorPhotos.length <= 2`

## Styling

Matches existing app palette: teal/navy/slate, Tailwind, rounded border. No new dependencies.

## Scope

One self-contained change to the photos block in `ClaimStepper.tsx` (the `mt-4` div after `ScopeSheetSummary`). No backend changes.
