# UI Spec: Step Card Redesign + Background + Tab Bar

**Date:** 2026-03-18
**Goal:** Make prod match the reference design — near-white background, flat underline tabs, step icons integrated inside cards.

---

## Change 1: Body Background (`frontend/src/index.css`)

**Current:**
```css
background: linear-gradient(135deg, #edfaf8 0%, #f5fffe 50%, #e8f8f8 100%);
```

**New:**
```css
background: linear-gradient(135deg, #f8fffe 0%, #ffffff 50%, #f5fffe 100%);
```

Near-pure white with a barely-there teal tint. Cards (glass-bg: `rgba(255,255,255,0.9)`) will still read as white-on-background without competing with the mint tint.

---

## Change 2: Tab Bar Container (`frontend/src/pages/ClaimHome.tsx`)

The tab bar already uses correct inline styles (underline on active, `background: none` per button). Add `background: white` to the container div to prevent any background bleed causing pill-like appearance:

**Current container:**
```jsx
<div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
```

**New container:**
```jsx
<div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '24px', background: 'white' }}>
```

No other changes to ClaimHome.tsx.

---

## Change 3: Step Card Layout (`frontend/src/components/ClaimStepper.tsx`)

Restructure the inline `<style>` block. The JS, state, and JSX structure are **not changed** — only CSS.

### Layout change

**Current:** Two-column grid (`80px icon column | card column`) with icon outside card and vertical timeline connector between rows.

**New:** Single-column block. The `.step-header` card contains the icon on its left side.

### CSS rules to change

**`.step-item`** — remove grid, use simple block with bottom margin:
```css
.step-item {
  display: block;
  margin-bottom: 12px;
  position: relative;
}
```

**`.step-timeline`** — hide (column no longer exists):
```css
.step-timeline {
  display: none;
}
```

**`.step-timeline::after`** — remove connector line (no longer needed):
```css
.step-item:last-child .step-timeline::after { display: none; }
/* Remove the ::after entirely from .step-timeline */
```

**`.step-main`** — remove top padding (no longer offset from icon column):
```css
.step-main {
  padding-top: 0;
}
```

**`.step-header`** — becomes flex row with icon, text, chevron:
```css
.step-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1.5px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  transition: all 0.3s ease;
}
```

**`.step-icon`** — shrink to fit inside card:
```css
.step-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Current step card** — teal border outline:
```css
.step-item.current .step-header {
  border: 2px solid var(--color-teal, #14B8A6);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.08), 0 4px 16px rgba(20, 184, 166, 0.1);
  background: rgba(255, 255, 255, 1);
}
```

**Completed step card** — subtle success tone:
```css
.step-item.completed .step-header {
  border: 1.5px solid rgba(20, 184, 166, 0.2);
  background: rgba(255, 255, 255, 0.95);
}
```

**Upcoming step card** — muted:
```css
.step-item.upcoming .step-header {
  border: 1.5px solid rgba(148, 163, 184, 0.12);
  background: rgba(255, 255, 255, 0.7);
}
```

**Hover state:**
```css
.step-item.accessible .step-header:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
```

**`.step-icon.current`** — smaller, inside card:
```css
.step-icon.current {
  background: rgba(20, 184, 166, 0.08);
  border: 2px solid #0d9488;
  font-size: 20px;
}
```

---

## Success Criteria

- [ ] Body background is near-white (barely visible tint)
- [ ] Tab bar renders flat underline style (no pill appearance)
- [ ] Step icons appear inside cards, not in a separate left column
- [ ] Current step card has visible teal border outline
- [ ] Completed step card has subtle teal border
- [ ] Upcoming step cards are muted/slightly transparent
- [ ] No timeline connector line visible between cards
- [ ] `npx tsc --noEmit` passes
- [ ] ClaimHome.tsx logic untouched (no JS changes)
- [ ] ClaimStepper.tsx logic untouched (no JS changes)
