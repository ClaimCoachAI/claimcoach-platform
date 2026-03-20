# UI Spec: Step Card Redesign + Background + Tab Bar

**Date:** 2026-03-18
**Goal:** Make prod match the reference design — near-white background, flat underline tabs, step icons integrated inside cards.

---

## Change 1: Body Background (`frontend/src/index.css`)

**Current (line 62):**
```css
background: linear-gradient(135deg, #edfaf8 0%, #f5fffe 50%, #e8f8f8 100%);
```

**New:**
```css
background: linear-gradient(135deg, #f8fffe 0%, #ffffff 50%, #f5fffe 100%);
```

Near-pure white with a barely-there teal tint.

---

## Change 2: Tab Bar Container (`frontend/src/pages/ClaimHome.tsx`)

Add `background: 'white'` to the tab bar container div to prevent any bleed from behind causing pill-like appearance.

**Current (line 127):**
```jsx
<div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
```

**New:**
```jsx
<div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '24px', background: 'white' }}>
```

No other changes to ClaimHome.tsx.

---

## Change 3: Step Card Redesign (`frontend/src/components/ClaimStepper.tsx`)

Two parts: a small JSX restructure and CSS updates.

### Part A — JSX change (lines ~3287–3335)

Move `.step-icon` from inside `.step-timeline` to be the first child of `.step-header`. Remove the `.step-timeline` wrapper div entirely.

**Current JSX structure:**
```jsx
<div className={`step-item ${status} accessible ${isExpanded ? 'expanded' : ''}`}>
  <div className="step-timeline">
    <div className={`step-icon ${status}`}>
      {/* icon */}
    </div>
  </div>
  <div className="step-main">
    <div className="step-header" onClick={...} role="button" tabIndex={0}>
      <div className="step-info">...</div>
      <div className="expand-btn">...</div>
    </div>
    {renderStepContent(stepNum)}
  </div>
</div>
```

**New JSX structure:**
```jsx
<div className={`step-item ${status} accessible ${isExpanded ? 'expanded' : ''}`}>
  <div className="step-main">
    <div className="step-header" onClick={...} role="button" tabIndex={0}>
      <div className={`step-icon ${status}`}>
        {/* icon — same content as before */}
      </div>
      <div className="step-info">...</div>
      <div className="expand-btn">...</div>
    </div>
    {renderStepContent(stepNum)}
  </div>
</div>
```

The `.step-timeline` div is removed. The icon content (checkmark SVG / step.icon / stepNum) is unchanged.

### Part B — CSS changes (inline `<style>` block)

**`.step-item`** — remove grid, use simple block:
```css
.step-item {
  display: block;
  margin-bottom: 12px;
  position: relative;
}
```

**`.step-item:last-child .step-timeline::after`** — delete this rule entirely.

**`.step-timeline`** — delete this rule entirely (element removed from JSX).

**`.step-timeline::after`** — delete this rule entirely.

**`.step-item.upcoming .step-timeline::after`** — delete this rule entirely.

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

**`.step-icon.completed`** — keep teal gradient, adjust for smaller size:
```css
.step-icon.completed {
  background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
  box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
  color: white;
  font-weight: 700;
}
```

**`.step-icon.current`** — light teal bg inside card:
```css
.step-icon.current {
  background: rgba(13, 148, 136, 0.08);
  border: 2px solid #0d9488;
  color: #0d9488;
  font-size: 20px;
}
```

**`.step-icon.upcoming`** — keep muted style:
```css
.step-icon.upcoming {
  background: rgba(148, 163, 184, 0.15);
  color: #64748b;
  font-family: 'Work Sans', sans-serif;
  font-weight: 700;
  font-size: 18px;
  border: 2px solid rgba(148, 163, 184, 0.2);
}
```

**`.step-main`** — remove top padding:
```css
.step-main {
  padding-top: 0;
}
```

**`.step-header`** — flex row with icon, text, chevron; white background:
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

**`.step-item.current .step-header`** — full teal border outline:
```css
.step-item.current .step-header {
  background: rgba(255, 255, 255, 1);
  border: 2px solid #0d9488;
  box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.08), 0 4px 16px rgba(13, 148, 136, 0.1);
}
```

**`.step-item.completed .step-header`** — subtle teal tint:
```css
.step-item.completed .step-header {
  background: rgba(240, 253, 250, 0.8);
  border: 1.5px solid rgba(13, 148, 136, 0.2);
}
```

**`.step-item.upcoming .step-header`** — muted:
```css
.step-item.upcoming .step-header {
  background: rgba(255, 255, 255, 0.7);
  border: 1.5px solid rgba(148, 163, 184, 0.12);
}
```

**`.step-item.accessible .step-header:hover`** — hover:
```css
.step-item.accessible .step-header:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
```

**Responsive `@media (max-width: 768px)` block** — remove the grid overrides for `.step-item` and the `.step-timeline::after` override; keep only `.step-icon` size and `.step-title` adjustments:

Delete these lines from the responsive block:
```css
/* DELETE: */
.step-item {
  grid-template-columns: 64px 1fr;
  gap: 16px;
}
/* DELETE: */
.step-timeline::after {
  top: 48px;
}
```

Keep these (just update icon size):
```css
.step-icon {
  width: 36px;
  height: 36px;
  font-size: 16px;
}
.step-title {
  font-size: 16px;
}
```

---

## Success Criteria

- [ ] Body background is near-white with barely visible tint
- [ ] Tab bar renders flat underline style (no pill appearance) on both desktop and mobile
- [ ] Step icons appear inside white cards on the left side
- [ ] Current step card has visible teal border + subtle teal glow
- [ ] Completed step card has subtle teal border and mint-tinted background
- [ ] Upcoming step cards are muted/slightly transparent
- [ ] No timeline connector line visible between cards
- [ ] Layout is correct on both desktop and mobile (no grid re-imposed by responsive rules)
- [ ] `npx tsc --noEmit` passes
- [ ] ClaimStepper state/logic untouched (only JSX structure of step-item + CSS changed)
