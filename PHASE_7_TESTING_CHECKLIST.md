# Phase 7: Field Logistics & Payments - Testing Checklist

## Pre-Flight Checks

### Environment Setup
- [ ] SendGrid API key configured in `.env` (or using Mock email service)
- [ ] Database migration `000007` applied successfully
- [ ] Backend server starts without errors
- [ ] Frontend dev server starts without errors
- [ ] No console errors on page load

### Verification Commands
```bash
# Backend
cd backend
go run cmd/server/main.go

# Check logs for:
# ✓ Using SendGrid email service (or ⚠ Using Mock email service)

# Frontend
cd frontend
npm run dev

# Access http://localhost:5173
```

---

## Backend API Testing

### Meeting Endpoints
- [ ] **POST** `/api/claims/:id/meetings` - Schedule meeting
  - Creates meeting record
  - Updates claim status to `field_scheduled`
  - Sends email notification (check logs if Mock)
  - Returns meeting object

- [ ] **GET** `/api/claims/:id/meetings` - List meetings
  - Returns array of meetings for claim
  - Respects organization ownership

- [ ] **GET** `/api/meetings/:id` - Get meeting details
  - Returns full meeting object
  - Includes all fields (adjuster info, outcome, etc.)

- [ ] **PATCH** `/api/meetings/:id/complete` - Complete meeting
  - Sets status to `completed`
  - Records `completed_at` timestamp
  - Stores outcome summary
  - Updates claim status to `audit_pending`

- [ ] **PATCH** `/api/meetings/:id/cancel` - Cancel meeting
  - Sets status to `cancelled`
  - Records cancellation reason
  - Logs activity

### Payment Endpoints
- [ ] **POST** `/api/claims/:id/payments` - Create expected payment
  - Creates payment with status `expected`
  - Accepts ACV or RCV type
  - Stores expected amount

- [ ] **GET** `/api/claims/:id/payments` - List payments
  - Returns all payments for claim
  - Includes status, amounts, dates

- [ ] **PATCH** `/api/payments/:id/received` - Record payment received
  - Updates status to `received`
  - Records amount, check number, date
  - Stores receiving user ID

- [ ] **PATCH** `/api/payments/:id/reconcile` - Reconcile payment
  - Compares expected vs received amounts
  - Sets status to `reconciled` if match
  - Sets status to `disputed` if mismatch (within $0.01 tolerance)
  - Auto-generates dispute reason

- [ ] **PATCH** `/api/payments/:id/dispute` - Manual dispute
  - Sets status to `disputed`
  - Records dispute reason
  - Logs activity

- [ ] **GET** `/api/claims/:id/payment-summary` - Get payment summary
  - Returns calculated totals for ACV and RCV
  - Shows deltas (received - expected)
  - Indicates reconciliation status
  - Flags disputes

- [ ] **GET** `/api/claims/:id/closure-status` - Check closure readiness
  - Returns `CanClose` boolean
  - Lists blocking reasons
  - Shows payment status breakdown

### RCV Demand Endpoints
- [ ] **POST** `/api/claims/:id/rcv-demand/generate` - Generate letter
  - Requires outstanding RCV balance
  - Calls LLM API (Perplexity)
  - Generates professional demand letter
  - Saves to database
  - Logs API usage
  - Returns letter content

- [ ] **GET** `/api/claims/:id/rcv-demand` - List demand letters
  - Returns all letters for claim
  - Includes sent status

- [ ] **GET** `/api/rcv-demand/:id` - Get letter details
  - Returns full letter content
  - Includes payment context

- [ ] **PATCH** `/api/rcv-demand/:id/mark-sent` - Mark as sent
  - Records `sent_at` timestamp
  - Stores recipient email
  - Logs activity

---

## Frontend UI Testing

### MeetingsSection Component

#### Initial State
- [ ] Component renders without errors
- [ ] "Schedule Meeting" button visible
- [ ] Empty state shows when no meetings

#### Schedule Meeting Flow
- [ ] Click "Schedule Meeting" opens modal
- [ ] All form fields render correctly:
  - Meeting type dropdown (3 options)
  - Date picker (manual input)
  - Time picker (manual input)
  - Location text input
  - Duration (default 60 minutes)
  - Adjuster info fields (optional)
  - Notes textarea
- [ ] Form validation works
  - Required fields enforced
  - Date/time must be valid
- [ ] Submit creates meeting
- [ ] Modal closes on success
- [ ] Meeting appears in list
- [ ] Status badge shows "Scheduled"

#### Meeting Card Display
- [ ] Meeting type displayed correctly
- [ ] Date/time formatted properly
- [ ] Location shown
- [ ] Adjuster info displayed (if provided)
- [ ] Status badge color-coded
- [ ] Action buttons visible for scheduled meetings

#### Complete Meeting Flow
- [ ] Click "Complete" opens modal
- [ ] Meeting details pre-populated
- [ ] Outcome summary required
- [ ] Submit marks meeting complete
- [ ] Status updates to "Completed"
- [ ] Outcome summary displayed in card
- [ ] Action buttons removed

#### Cancel Meeting Flow
- [ ] Click "Cancel" opens modal
- [ ] Cancellation reason required
- [ ] Submit cancels meeting
- [ ] Status updates to "Cancelled"
- [ ] Cancellation reason displayed in red box
- [ ] Action buttons removed

---

### PaymentsSection Component

#### Payment Summary Dashboard
- [ ] Summary card renders with progress bars
- [ ] ACV section shows:
  - Progress bar (received / expected)
  - Received amount
  - Expected amount
  - Delta (green if positive, red if negative)
- [ ] RCV section shows same breakdown
- [ ] Status badges show correctly:
  - "Fully Reconciled" (green)
  - "Has Disputes" (red)

#### Create Expected Payment
- [ ] Click "Record Payment" opens modal
- [ ] Payment type dropdown (ACV/RCV)
- [ ] Amount input with $ prefix
- [ ] Notes textarea
- [ ] Submit creates payment
- [ ] Payment appears in timeline
- [ ] Status shows "Expected" (yellow)

#### Record Payment Received
- [ ] "Record Received" button on expected payments
- [ ] Modal pre-fills expected amount
- [ ] Form fields:
  - Amount received (editable)
  - Check number (optional)
  - Received date (defaults to today)
  - Notes
- [ ] Submit updates payment
- [ ] Status changes to "Received" (blue)
- [ ] "Reconcile" and "Dispute" buttons appear

#### Reconcile Payment
- [ ] Click "Reconcile" on received payment
- [ ] Auto-compares expected vs received
- [ ] If match (within $0.01):
  - Status changes to "Reconciled" (green)
  - Buttons disappear
- [ ] If mismatch:
  - Status changes to "Disputed" (red)
  - Auto-generated dispute reason shown

#### Dispute Payment
- [ ] Click "Dispute" opens modal
- [ ] Dispute reason required
- [ ] Submit marks payment disputed
- [ ] Status changes to "Disputed" (red)
- [ ] Dispute reason displayed in red box

#### Payment Timeline
- [ ] Payments ordered by creation date (newest first)
- [ ] Each payment card shows:
  - Type badge (ACV/RCV)
  - Status badge
  - Expected amount
  - Received amount
  - Check number
  - Received date
  - Notes
  - Dispute reason (if disputed)
- [ ] Action buttons context-aware

---

### RCVDemandSection Component

#### Initial State
- [ ] Component renders without errors
- [ ] Status banner shows RCV outstanding or "All received"
- [ ] Generate button visible only when:
  - RCV outstanding > $0
  - ACV received > $0
- [ ] Empty state shows when no letters

#### Generate Demand Letter
- [ ] Click "Generate Demand Letter"
- [ ] Button shows loading spinner
- [ ] LLM generates letter (takes ~5-10 seconds)
- [ ] Letter appears in list
- [ ] Payment context summary displayed:
  - ACV Received
  - RCV Expected
  - RCV Outstanding (red)
- [ ] Letter content displayed in scrollable box
- [ ] Action buttons visible

#### Letter Actions
- [ ] **Copy** button copies content to clipboard
  - Shows alert "Copied to clipboard!"
- [ ] **Download** button downloads as .txt file
  - Filename: `rcv-demand-letter-{id}.txt`
- [ ] **Mark as Sent** button opens modal
  - Email input required
  - Submit records sent timestamp
  - Button disappears
  - "Sent" badge appears (green)
  - Sent to email displayed

#### Multiple Letters
- [ ] Can generate multiple letters
- [ ] All letters display in chronological order
- [ ] Each letter independent
- [ ] Only unsent letters show "Mark as Sent"

---

### ClaimDetail Integration

#### Component Visibility by Status

| Status | Meetings | Payments | RCV Demand |
|--------|----------|----------|------------|
| draft | ❌ | ❌ | ❌ |
| assessing | ❌ | ❌ | ❌ |
| filed | ❌ | ✅ | ✅ |
| field_scheduled | ✅ | ✅ | ✅ |
| audit_pending | ❌ | ✅ | ✅ |
| negotiating | ❌ | ✅ | ✅ |
| settled | ❌ | ✅ | ✅ |
| closed | ❌ | ✅ | ✅ |

- [ ] Components render in correct status
- [ ] Components don't render in wrong status
- [ ] Page layout not broken
- [ ] Scroll works correctly
- [ ] No z-index issues with modals

---

## End-to-End Workflow Testing

### Complete Phase 7 Flow

1. **Setup**
   - [ ] Create property
   - [ ] Create claim (status: filed)
   - [ ] Verify Phase 7 components NOT showing yet

2. **Update to field_scheduled**
   - [ ] Change claim status to "field_scheduled"
   - [ ] MeetingsSection now visible
   - [ ] PaymentsSection visible
   - [ ] RCVDemandSection visible

3. **Schedule Meeting**
   - [ ] Click "Schedule Meeting"
   - [ ] Fill all fields:
     - Type: Adjuster Inspection
     - Date: Tomorrow
     - Time: 10:00 AM
     - Location: Property address
     - Adjuster: John Smith, john@insurance.com
     - Notes: "Initial damage assessment"
   - [ ] Submit
   - [ ] Meeting appears with "Scheduled" badge
   - [ ] Check email logs (Mock shows in console)

4. **Create Expected Payments**
   - [ ] Click "Record Payment"
   - [ ] Type: ACV
   - [ ] Amount: $50,000
   - [ ] Notes: "Expected ACV from carrier"
   - [ ] Submit
   - [ ] Payment shows status "Expected"
   - [ ] Repeat for RCV: $20,000

5. **Complete Meeting**
   - [ ] Click "Complete" on meeting
   - [ ] Outcome: "Adjuster confirmed all damages. Estimate matches contractor bid."
   - [ ] Submit
   - [ ] Status changes to "Completed"
   - [ ] Claim status might update to "audit_pending"

6. **Record ACV Received**
   - [ ] Click "Record Received" on ACV payment
   - [ ] Amount: $50,000 (matches expected)
   - [ ] Check #: 123456
   - [ ] Date: Today
   - [ ] Submit
   - [ ] Status changes to "Received"
   - [ ] Summary updates: ACV bar at 100%

7. **Reconcile ACV**
   - [ ] Click "Reconcile" on ACV payment
   - [ ] Status changes to "Reconciled"
   - [ ] Summary shows "Fully Reconciled" badge

8. **Record Partial RCV**
   - [ ] Click "Record Received" on RCV payment
   - [ ] Amount: $15,000 (less than expected $20,000)
   - [ ] Check #: 789012
   - [ ] Submit
   - [ ] Status: "Received"

9. **Generate RCV Demand Letter**
   - [ ] RCVDemandSection shows "$5,000 outstanding"
   - [ ] Click "Generate Demand Letter"
   - [ ] Wait for LLM response
   - [ ] Letter appears with professional content
   - [ ] Payment summary shows correct amounts
   - [ ] Copy letter to clipboard (test)
   - [ ] Download letter (test)

10. **Mark Letter as Sent**
    - [ ] Click "Mark as Sent"
    - [ ] Email: john@insurance.com
    - [ ] Submit
    - [ ] "Sent" badge appears
    - [ ] Button disappears

11. **Complete RCV Payment**
    - [ ] Create new expected payment: RCV $5,000
    - [ ] Record received: $5,000
    - [ ] Reconcile payment
    - [ ] Summary shows all green:
      - ACV: 100%
      - RCV: 100%
      - "Fully Reconciled" badge
      - No disputes

12. **Check Closure Status**
    - [ ] Use API or add UI element
    - [ ] Should show `CanClose: true`
    - [ ] No blocking reasons
    - [ ] All conditions met

---

## Error Handling & Edge Cases

### Validation
- [ ] Empty required fields show errors
- [ ] Invalid dates rejected
- [ ] Negative amounts rejected
- [ ] Duplicate submissions prevented

### Network Errors
- [ ] Failed API calls show error messages
- [ ] Loading states show during requests
- [ ] Can retry failed operations
- [ ] No data corruption on failures

### Concurrent Access
- [ ] Multiple users can view same claim
- [ ] Real-time updates via React Query
- [ ] No race conditions

### Permission/Ownership
- [ ] Can only see own organization's data
- [ ] 401 errors redirect to login
- [ ] 403/404 errors handled gracefully

---

## Performance Testing

- [ ] Page loads in < 2 seconds
- [ ] API responses < 500ms
- [ ] LLM generation < 15 seconds
- [ ] No memory leaks
- [ ] Smooth scrolling with many records

---

## Mobile Responsiveness

- [ ] All components render on mobile (375px width)
- [ ] Modals fit on screen
- [ ] Touch targets >= 44px
- [ ] Forms usable on mobile
- [ ] Tables scroll horizontally if needed

---

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## Accessibility

- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader friendly
- [ ] Color contrast sufficient
- [ ] No reliance on color alone

---

## Test with SendGrid (Production Email)

### Setup
1. Get SendGrid API key from https://sendgrid.com
2. Add to `.env`:
   ```
   SENDGRID_API_KEY=SG.xxxxx
   SENDGRID_FROM_EMAIL=noreply@claimcoach.ai
   SENDGRID_FROM_NAME=ClaimCoach AI
   ```
3. Restart backend

### Verification
- [ ] Server log shows "✓ Using SendGrid email service"
- [ ] Schedule meeting with real email
- [ ] Check inbox for meeting notification
- [ ] Email well-formatted, no errors

---

## Completion Criteria

Phase 7 is **PRODUCTION READY** when:
- ✅ All backend endpoints functional
- ✅ All frontend components render correctly
- ✅ End-to-end workflow completes successfully
- ✅ No console errors
- ✅ Email notifications working (Mock or SendGrid)
- ✅ Database migration applied
- ✅ Tests passing (integration test)
- ✅ Mobile responsive
- ✅ No breaking changes to existing features

---

## Known Limitations (V2 Features)

- ❌ Calendar integration (manual date/time entry for now)
- ❌ Check image upload (field exists, not implemented)
- ❌ PDF generation for demand letters (download as .txt)
- ❌ Representative assignment (field exists, not UI)
- ❌ Meeting reminders/notifications
- ❌ Payment receipt uploads
- ❌ Automated RCV tracking alerts

---

## Quick Test Script

```bash
# Terminal 1: Backend
cd backend
go run cmd/server/main.go

# Terminal 2: Frontend
cd frontend
npm run dev

# Browser
open http://localhost:5173

# Test Flow (5 minutes):
1. Login
2. Go to a claim
3. Schedule a meeting → Check works
4. Record a payment → Check works
5. Generate RCV demand → Check works

# Success = No errors, all features working
```
