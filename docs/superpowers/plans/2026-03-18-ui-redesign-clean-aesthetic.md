# UI Redesign: Clean Aesthetic Plan

> **Goal:** Make the full app match the clean, airy look of `ClaimHome` — white cards on teal/mint background, generous spacing, crisp typography. The current app feels zoomed-in and cluttered on other pages.

## Reference Design (What We Like)

From the live `ClaimHome` page:
- Light teal/mint page background (`var(--color-mint-light)` or similar)
- White content cards with subtle shadow/border, generous padding
- Clean nav: logo left, links center, avatar right
- Large bold Manrope headings
- Teal underline tab bar (already shipped)
- Tight hierarchy: big title → muted subtitle → content

## What's Wrong With Other Pages

The clunky/zoomed-in feel comes from:
1. `ClaimDetail.tsx` — uses dense Tailwind classes (`bg-gray-50`, `px-4 py-5 space-y-6`), no breathing room
2. Properties pages — same issue
3. Layout/nav — may feel cramped or off-scale
4. Font sizes may be too large or line-heights too tight globally
5. Cards use gray backgrounds instead of white-on-teal

---

## File Map

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/components/Layout.tsx` | Modify | Set page bg to mint/teal gradient, ensure nav matches screenshot |
| `frontend/src/index.css` | Modify | Audit and tighten global CSS variables — font scale, spacing |
| `frontend/src/pages/ClaimDetail.tsx` | Modify | Restyle to match ClaimHome card style (or confirm it's dead/unused) |
| `frontend/src/pages/PropertyDetail.tsx` | Modify | Apply same white-card-on-teal pattern |
| `frontend/src/pages/Claims.tsx` | Modify | Clean up list/grid view to match aesthetic |
| `frontend/src/components/ClaimStepper.tsx` | Modify | Ensure step cards match clean white style |
| `frontend/src/components/ProgressBar.tsx` | Modify | Verify styling matches screenshot |

---

## Chunk 1: Layout & Global Styles

### Task 1: Audit Layout.tsx and page background

- Read `Layout.tsx` — identify nav structure and page wrapper classes
- The screenshot shows a teal border/accent at top and bottom of the viewport
- Page bg should be a soft mint/teal (`#f0fafa` or `var(--color-mint-light)`)
- Nav: white bg, "CC ClaimCoach" in teal on left, center links, avatar circle right
- Ensure `max-width` container is wide enough (not zoomed-in feeling)

### Task 2: Global CSS variable audit (`index.css`)

- Check font scale — if base font is too large (18-20px), reduce to 15-16px
- Check container max-width — ensure it's at least 1200px wide
- Verify CSS custom properties match what ClaimHome uses: `--color-teal`, `--color-teal-dark`, `--color-mint-light`, `--color-navy`, `--color-slate`, `--glass-mint`

---

## Chunk 2: Page-by-Page Cleanup

### Task 3: Claims list page (`Claims.tsx`)

- Apply white card pattern for each claim card
- Ensure appropriate breathing room between items
- Match typography to ClaimHome style

### Task 4: Property pages

- `PropertyDetail.tsx` and `Properties.tsx`
- Apply same card/background treatment
- Remove any `bg-gray-50` / `bg-gray-100` backgrounds, replace with white cards on mint bg

### Task 5: Confirm `ClaimDetail.tsx` is dead

- Verify it's not routed anywhere (it's not — confirmed in this session)
- Either delete it or leave it — no styling work needed

---

## Chunk 3: Component Polish

### Task 6: ClaimStepper + ProgressBar visual consistency

- Both are used in ClaimHome Overview tab
- Ensure they use the same design tokens as the rest of the page
- Step cards should be white with subtle border, not gray-tinted

---

## Success Criteria

- [ ] All pages use white-card-on-mint-background pattern
- [ ] Nav matches screenshot (logo left, nav center, avatar right)
- [ ] No "zoomed-in" density — adequate padding, font scale feels right
- [ ] `npx tsc --noEmit` passes throughout
- [ ] ClaimHome still looks exactly like the screenshot

---

## Notes for Implementer

- **Do not change ClaimHome** — it's the reference. Match everything else to it.
- Use `frontend-design` skill for any new component design decisions
- The teal stripe at top/bottom of viewport in the screenshot may be from Layout's border or body background bleeding through — investigate Layout.tsx first
- `ClaimDetail.tsx` is unused (not imported in App.tsx) — ignore it
