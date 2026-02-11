# ClaimCoach UI/UX Redesign - Guided Dashboard Experience
**Date:** February 11, 2026
**Version:** 1.0
**Status:** Ready for Implementation

---

## Overview

### Problem Statement
Users find the current UI confusing and don't know what to do next when managing claims. The interface doesn't guide them through the workflow, leading to frustration and errors.

### Design Goals
1. **Simple enough for a high schooler** - No insurance jargon, clear guidance
2. **Mobile-first** - Optimized for mobile, works great on desktop too
3. **Always know what's next** - Clear next action at all times
4. **Progressive disclosure** - Keep it simple, reveal details when needed
5. **Friendly & approachable** - Warm, rounded, welcoming (like Notion/Airtable)

### Design Approach
**Dashboard with Guided Cards (Option B)**
- Shows context (what's done, what's next, what's coming)
- Focuses attention on next action with a big card
- Flexible - can review past steps if needed
- Not as rigid as a wizard, not as overwhelming as showing everything

---

## User Flow Changes

### Simplified Claim Creation
**OLD:** 7 phases starting with property setup
**NEW:** Property setup happens once during onboarding. Claims are 6 steps:

1. **Report the Damage** - What happened and when?
2. **Get Contractor Photos** - Send magic link for uploads
3. **Check if Worth Filing** - Compare estimate to deductible
4. **File & Schedule** - File with insurance, schedule inspection
5. **Review Insurance Offer** - AI audit and comparison
6. **Get Paid & Close** - Track payments, close claim

### Damage Types (MVP)
- Water Damage 💧
- Hail Damage 🧊

---

## Screen Designs

### 1. Dashboard - All Claims Overview

**Layout:**
```
┌─────────────────────────────────┐
│ Your Properties                 │
│ [All Claims] ← Active tab       │
│                                 │
│ 🔍 Search claims...             │
│                                 │
│ ACTIVE CLAIMS (3)               │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🌊 Water Damage             │ │
│ │ 123 Main St                 │ │
│ │                             │ │
│ │ ⏳ Waiting for contractor   │ │
│ │    photos (Step 2 of 6)     │ │
│ │                             │ │
│ │ Started 2 days ago          │ │
│ │ [View Claim →]              │ │
│ └─────────────────────────────┘ │
│                                 │
│ CLOSED CLAIMS (12)              │
│ [View all →]                    │
│                                 │
│ [+ New Claim]                   │ ← Floating
└─────────────────────────────────┘
```

**Each Claim Card Shows:**
- Icon for damage type
- Property address
- Current status in plain English
- Which step (X of 6)
- Time since started
- Big "View Claim" button

**Smart Sorting:**
- Claims needing user action first
- Claims waiting on others second
- Completed claims collapsed at bottom

---

### 2. Create New Claim (Bottom Sheet/Modal)

```
┌─────────────────────────────────┐
│ Report Damage                   │
│                                 │
│ Property: Downtown Apartment    │ ← Pre-filled
│ 123 Main St                     │
│                                 │
│ What type of damage? *          │
│ [💧 Water Damage    ]           │ ← Big tiles
│ [🧊 Hail Damage     ]           │   with icons
│                                 │
│ When did it happen? *           │
│ [Date picker: Jan 15, 2026]    │
│                                 │
│ Brief description (optional)    │
│ [________________________]      │
│                                 │
│ [Cancel]    [Create Claim →]   │
└─────────────────────────────────┘
```

**Flow:**
1. Select damage type (2 options)
2. Pick date
3. Optional description
4. Create → Goes directly to Claim Home
5. Step 1 already complete (✅ Damage Reported)

---

### 3. Claim Home - Guided Dashboard

**Overall Structure:**
```
┌─────────────────────────────────┐
│ ← Back    Claim #1234           │ ← Sticky header
│ Water Damage • 123 Main St      │
├─────────────────────────────────┤
│ Progress: 3 of 6 steps done     │
│ ●━━●━━●━━○━━○━━○                │
├─────────────────────────────────┤
│                                 │
│ ✅ Damage Reported              │ ← Collapsed
│    Water damage • Jan 15        │   completed
│                                 │   steps
│ ✅ Photos Received              │
│    From: John's Roofing         │
│    15 photos • $8,400 estimate  │
│                                 │
│ ✅ Worth Filing                 │
│    $5,900 above deductible      │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🎯 NEXT STEP                │ │ ← Big "Next"
│ │                             │ │   card
│ │ File & Schedule             │ │
│ │                             │ │
│ │ File the claim with State   │ │
│ │ Farm and schedule their     │ │
│ │ inspection.                 │ │
│ │                             │ │
│ │ ℹ️ Learn more ↓             │ │
│ │                             │ │
│ │ Claim Number *              │ │
│ │ [____________________]      │ │
│ │                             │ │
│ │ [📋 File Claim]             │ │ ← Big button
│ └─────────────────────────────┘ │
│                                 │
│ ⏳ Coming up next...            │
│ • Review insurance offer        │
│ • Track payments                │
│                                 │
│ [View All Documents]            │
│ [View Timeline]                 │
└─────────────────────────────────┘
```

**Key Elements:**

1. **Progress Bar**
   - "X of 6 steps done" (human text)
   - Visual dots: ●━━●━━○
   - Current dot pulses gently
   - Mobile: Hide dots if space tight

2. **Completed Steps**
   - Collapsed by default
   - Show key info (date, amounts, names)
   - Tap to expand for details
   - Can edit if needed

3. **Next Step Card** (detailed below)

4. **Coming Up Preview**
   - Shows next 2-3 steps
   - Slightly faded (not actionable yet)
   - Helps users anticipate what's ahead

5. **Quick Actions**
   - View Documents (all uploads)
   - View Timeline (activity feed)

---

### 4. The "Next Step" Card - Star of the Show

**Anatomy:**
```
┌───────────────────────────────────────┐
│ 🎯 NEXT STEP                          │ ← Label
│                                       │
│ Get Photos from Contractor            │ ← Title
│                                       │
│ Send your contractor a link so they   │ ← Brief
│ can upload photos and their estimate. │   explanation
│                                       │   (1 sentence)
│ ℹ️ Learn more ↓                       │ ← Expandable
│                                       │
│ Contractor Email *                    │ ← Inline form
│ [____________________________]        │   (when needed)
│                                       │
│ Contractor Name                       │
│ [____________________________]        │
│                                       │
│     [📧 Send Link to Contractor]      │ ← Big button
│                                       │   (44px min)
└───────────────────────────────────────┘
```

**Visual Style:**
- Soft gradient background (warm blue to teal)
- Rounded corners (16px)
- Generous padding (20px)
- High-contrast button (rounded pill)
- Icon for visual anchor

**Behavior:**
- Always visible below header (sticky)
- One action at a time
- Smart forms inline when needed
- "Learn more" expands for details (2-3 sentences + tips)
- Success animation when completed

**"Learn More" Expanded Example:**
```
│ ℹ️ Learn more ▲                       │
│                                       │
│ Your contractor will receive an email │
│ with a secure link. They can upload   │
│ photos and their estimate without     │
│ creating an account. The link works   │
│ for 7 days.                           │
│                                       │
│ Tip: Make sure to give them a heads   │
│ up that the email is coming!          │
```

---

## Step-by-Step Details

### Step 1: Report the Damage ✅
**Completed during claim creation**

Shows as: "✅ Damage Reported - Water damage on Jan 15"

---

### Step 2: Get Contractor Photos

**Next Step Card:**
```
🎯 NEXT STEP
Get Photos from Contractor

Send your contractor a link so they can upload
photos and their estimate.

ℹ️ Learn more ↓

Contractor Email *
[____________________________]

Contractor Name
[____________________________]

    [📧 Send Link to Contractor]
```

**What Happens:**
1. User enters contractor email and name
2. Clicks "Send Link"
3. Loading state: "Sending..."
4. Success: "✅ Link sent! Email sent to john@roofing.com"
5. Card updates to: "⏳ Waiting for contractor to upload..."
6. When contractor uploads → Auto-advances to Step 3

**Learn More Text:**
> "Your contractor will receive an email with a secure link. They can upload photos and their estimate without creating an account. The link works for 7 days. Tip: Give them a heads up that the email is coming!"

---

### Step 3: Check if Worth Filing

**Next Step Card:**
```
🎯 NEXT STEP
Check if Worth Filing

See if repairs cost more than your deductible.

Your deductible:        $2,500
Contractor estimate:    $8,400
Difference:            +$5,900 ✅

This IS worth filing! The repairs cost $5,900
more than your deductible.

ℹ️ Learn more ↓

    [✅ Looks Good, Continue →]

    [✏️ Edit Estimate]
```

**Logic:**
- System automatically compares contractor estimate vs deductible
- Shows clear math
- **If ABOVE deductible:** Green checkmark, encourages filing
- **If BELOW deductible:** Yellow warning, explains why it might not be worth it, offers option to file anyway or close

**Learn More Text:**
> "If repairs cost less than your deductible, you'll pay out of pocket anyway, so filing a claim isn't worth it. But you can still file if you want - sometimes it makes sense for documentation purposes."

---

### Step 4: File & Schedule

**Next Step Card:**
```
🎯 NEXT STEP
File with Insurance

File the claim with State Farm and schedule
their inspection.

ℹ️ Learn more ↓

Claim Number (from insurance) *
[____________________________]

Adjuster Name
[____________________________]

Adjuster Phone
[____________________________]

Inspection Date & Time
[Jan 25, 2026] [2:00 PM]

    [📋 File Claim]
```

**What Happens:**
1. User files claim with insurance (offline - phone/portal)
2. Comes back and enters claim number + adjuster info
3. Enters inspection date/time
4. System sends calendar invite (optional)

**Learn More Text:**
> "Call your insurance company or use their online portal to file the claim. They'll give you a claim number and assign an adjuster. The adjuster will want to inspect the damage - schedule a time that works for you."

---

### Step 5: Review Insurance Offer

**Next Step Card:**
```
🎯 NEXT STEP
Review Insurance Offer

Upload the insurance company's estimate so
we can check if it's fair.

ℹ️ Learn more ↓

Upload Carrier Estimate (PDF)
[📎 Choose File] or [Drag & Drop]

    [🤖 Compare with AI]
```

**What Happens:**
1. User uploads carrier estimate PDF
2. "Processing..." (30-60 seconds)
3. AI parses PDF and compares to contractor estimate
4. Shows discrepancies in a comparison view
5. Option to generate rebuttal letter

**Comparison View (after AI analysis):**
```
┌─────────────────────────────────┐
│ Comparison Results              │
│                                 │
│ Contractor:     $8,400          │
│ Insurance:      $6,200          │
│ Difference:    -$2,200 ⚠️       │
│                                 │
│ 3 discrepancies found:          │
│                                 │
│ 1. Roof shingles                │
│    Contractor: $4,500           │
│    Insurance:  $3,200           │
│    Difference: $1,300           │
│                                 │
│ [View Full Report]              │
│ [Generate Rebuttal Letter]      │
└─────────────────────────────────┘
```

**Learn More Text:**
> "Insurance companies sometimes offer less than repairs actually cost. Our AI compares their estimate to your contractor's estimate and current market rates to find discrepancies. If we find issues, we'll help you write a rebuttal letter."

---

### Step 6: Get Paid & Close

**Next Step Card:**
```
🎯 NEXT STEP
Track Payments

Log payments from insurance as you receive them.

ℹ️ Learn more ↓

Payment 1: ACV (Actual Cash Value)
Amount:         [____________]
Date received:  [____________]
Check #:        [____________]

    [+ Log Payment]

─────────────────────────────

After repairs are complete:

Payment 2: RCV (Depreciation)
Status: Not received yet

    [Generate RCV Demand Letter]

─────────────────────────────

    [✅ Close Claim]
```

**What Happens:**
1. User logs ACV payment when received
2. After repairs done, generates RCV demand letter
3. Logs RCV payment when received
4. Closes claim

**Learn More Text:**
> "Insurance usually pays in two parts: ACV (Actual Cash Value) upfront to start repairs, then RCV (Recoverable Depreciation) after repairs are done. We'll help you request the second payment and make sure you get everything you're owed."

---

## Interaction Patterns

### Step Completion Flow

1. **User clicks action button**
   - Button shows spinner
   - Text changes to loading state

2. **Success (2 seconds)**
   - ✅ checkmark animation
   - Card turns soft green
   - Success message appears
   - Progress updates

3. **Transition (0.5 seconds)**
   - Success card slides up and shrinks
   - Joins completed section
   - New next step card slides in from bottom

4. **Ready for next action**

### Error Handling

**If Action Fails:**
- Card turns soft red/pink
- Shows friendly error message
- Keeps form filled so user can fix and retry
- Example: "Oops! Couldn't send email. Check the email address and try again."

### Progressive Disclosure

**"Learn More" Pattern:**
- Tap ℹ️ icon or "Learn more ↓" text
- Expands to show 2-3 more sentences
- Includes helpful tips
- Can collapse by tapping again

**Completed Steps:**
- Tap any completed step to expand
- Shows full details, documents, timestamp
- Can edit if needed
- Collapse by tapping again

---

## Visual Design System

### Colors (Friendly & Approachable)

**Primary:**
- Teal: `#3BA090` (buttons, highlights)
- Navy: `#2A4A70` (headings, text)

**Semantic:**
- Success Green: `#10B981` (completed, above deductible)
- Warning Yellow: `#F59E0B` (below deductible, attention needed)
- Error Red: `#EF4444` (failures, missing info)
- Info Blue: `#3B82F6` (learn more, tips)

**Neutrals:**
- Slate: `#64748B` (body text)
- Light Gray: `#F1F5F9` (backgrounds)
- White: `#FFFFFF`

**Gradients:**
- Next Step Card: Teal to Light Blue
- Success: Light Green to Green
- Error: Light Red to Red

### Typography

**Font Family:**
- Headings: Inter or System Sans (600-700 weight)
- Body: Inter or System Sans (400-500 weight)

**Sizes (Mobile-First):**
- H1 (Page Title): 24px / 1.5 rem
- H2 (Section): 20px / 1.25 rem
- H3 (Card Title): 18px / 1.125 rem
- Body: 16px / 1 rem
- Small: 14px / 0.875 rem

### Spacing & Layout

**Card Padding:**
- Mobile: 16px
- Desktop: 20px

**Border Radius:**
- Cards: 16px
- Buttons: 24px (pill shape)
- Inputs: 12px

**Touch Targets:**
- Minimum: 44x44px
- Buttons: 48px height minimum
- Spacing between tappable elements: 8px minimum

### Icons

**Style:** Outline style (like Heroicons)

**Usage:**
- 💧 Water damage
- 🧊 Hail damage
- 🎯 Next step indicator
- ✅ Completed
- ⏳ Waiting/pending
- ⬜ Not started
- ℹ️ Learn more / info
- 📧 Send email
- 📎 Upload file
- 📋 File claim
- 🤖 AI action

---

## Mobile-First Specifications

### Layout
- Single column
- Cards stack vertically
- Full width with 16px side margins
- Generous spacing (16-24px between cards)

### Navigation
- Bottom tab bar on mobile
- Sticky header with back button
- Floating action button (+ New Claim)

### Interactions
- Large touch targets (44px minimum)
- Swipe gestures:
  - Swipe left on claim card → Delete
  - Pull to refresh on dashboard
- Bottom sheets for modals/forms
- Native date/time pickers

### Performance
- Lazy load completed claims
- Optimize images from contractor
- Progressive loading (show skeleton)
- Offline support (service worker)

---

## Technical Considerations

### State Management
- Current step determined by:
  - Which steps are completed
  - Which conditions are met
  - Waiting on external actions (contractor upload, etc.)

### Auto-Advancement
- Step 2 → Step 3: When contractor uploads
- Other steps: Manual user action required

### Data Requirements

**Claim Object:**
```typescript
interface Claim {
  id: string
  property_id: string
  damage_type: 'water' | 'hail'
  incident_date: string
  description?: string
  current_step: 1 | 2 | 3 | 4 | 5 | 6
  steps_completed: number[]

  // Step 2
  contractor_email?: string
  contractor_name?: string
  contractor_photos_uploaded_at?: string
  contractor_estimate_amount?: number

  // Step 3
  deductible_comparison_result?: 'worth_filing' | 'not_worth_filing'

  // Step 4
  insurance_claim_number?: string
  adjuster_name?: string
  adjuster_phone?: string
  inspection_datetime?: string

  // Step 5
  carrier_estimate_pdf_url?: string
  ai_comparison_data?: object

  // Step 6
  payments: Payment[]

  status: 'active' | 'closed'
  created_at: string
  updated_at: string
}
```

### API Endpoints Needed

```
POST   /api/claims                    // Create claim
GET    /api/claims                    // List claims
GET    /api/claims/:id                // Get claim details
PATCH  /api/claims/:id/step           // Update current step
POST   /api/claims/:id/contractor     // Send contractor link
POST   /api/claims/:id/insurance      // Submit insurance info
POST   /api/claims/:id/carrier-estimate // Upload carrier PDF
GET    /api/claims/:id/comparison     // Get AI comparison
POST   /api/claims/:id/payments       // Log payment
PATCH  /api/claims/:id/close          // Close claim
```

---

## Success Metrics

### Usability
- Time to create first claim: < 2 minutes
- User confusion rate: < 5% (measured by support tickets)
- Step abandonment rate: < 10%

### Adoption
- Claims created per user per month: > 3
- Contractor link usage: > 80%
- AI comparison usage: > 70%

### Satisfaction
- User satisfaction (NPS): > 40
- "Easy to use" rating: > 4.5/5

---

## Future Enhancements (Out of Scope for MVP)

1. **Drag-and-drop step reordering** - For complex scenarios
2. **Multiple contractors per claim** - Get competing bids
3. **In-app chat with contractors** - Instead of just email
4. **Push notifications** - "Contractor uploaded photos!"
5. **More damage types** - Wind, fire, theft, etc.
6. **AI-powered photo analysis** - Auto-detect damage severity
7. **Integration with carrier portals** - Auto-pull claim status
8. **Collaborative editing** - Multiple team members on one claim
9. **Mobile app** - Native iOS/Android apps
10. **Voice input** - Describe damage via voice

---

## Implementation Notes

### Phase 1: Core Structure
- Dashboard with claim cards
- Create claim flow
- Claim home with guided cards

### Phase 2: Step Implementation
- Implement each step's unique UI
- Magic link for contractors
- Deductible comparison logic

### Phase 3: AI Integration
- Carrier PDF upload
- AI comparison
- Rebuttal generation

### Phase 4: Polish
- Animations and transitions
- Error states
- Loading states
- Empty states

---

## Appendix: Human Language for Each Step

### Step Names (Computer → Human)

| Technical Name | User-Facing Name | Why Description |
|---------------|------------------|-----------------|
| Phase 1: Onboarding | *(Separate - Property Setup)* | "Add your properties once, file claims anytime" |
| Phase 2: Incident Detection | Step 1: Report the Damage | "Tell us what happened and when" |
| Phase 3: Triage & Evidence | Step 2: Get Contractor Photos | "We need to know how much repairs will cost" |
| Phase 3: Deductible Gate | Step 3: Check if Worth Filing | "No point filing if repairs are cheaper than your deductible" |
| Phase 4: Field Logistics | Step 4: File & Schedule | "The insurance company needs to see the damage" |
| Phase 5: AI Audit | Step 5: Review Insurance Offer | "Insurance companies sometimes lowball. We'll help catch it" |
| Phase 6: Financial Recovery | Step 6: Get Paid & Close | "Insurance usually pays in 2 parts. We'll make sure you get everything" |
| Phase 7: Closure | *(Part of Step 6)* | "Wrap up and archive for records" |

---

**Document Status:** Ready for Implementation
**Next Steps:**
1. Create git worktree for isolated development
2. Create detailed implementation plan
3. Begin with Phase 1 (Core Structure)
