# Phase 5: Deductible Comparison - Manual Testing Checklist

## Prerequisites

- Backend server running with database configured
- Frontend dev server running
- Test user account created
- Test property with policy created (deductible: $10,000)
- Test claim in `draft` status

## Test Cases

### Test 1: Worth Filing (Estimate > Deductible)
**Objective:** Verify green "WORTH FILING" banner when estimate exceeds deductible

**Steps:**
1. Navigate to claim detail page
2. Verify "Deductible Analysis" section appears
3. Verify policy deductible shows: $10,000
4. Enter contractor estimate: $15,000
5. Click "Calculate" button

**Expected Results:**
- ✅ Green banner appears with checkmark
- ✅ Shows "WORTH FILING" heading
- ✅ Displays "Contractor Estimate: $15,000"
- ✅ Displays "Policy Deductible: $10,000"
- ✅ Displays "Expected Payout: $5,000"
- ✅ Message: "The estimate exceeds your deductible..."
- ✅ Input field cleared after success

### Test 2: Not Worth Filing (Estimate < Deductible)
**Objective:** Verify red "NOT WORTH FILING" banner when estimate below deductible

**Steps:**
1. Same claim from Test 1
2. Enter contractor estimate: $8,000
3. Click "Calculate"

**Expected Results:**
- ✅ Red banner appears with warning icon
- ✅ Shows "NOT WORTH FILING" heading
- ✅ Displays "Contractor Estimate: $8,000"
- ✅ Displays "Policy Deductible: $10,000"
- ✅ Displays "Amount Below Deductible: $2,000"
- ✅ Message: "...Filing this claim would result in $0 payout"

### Test 3: Equal to Deductible (Edge Case)
**Objective:** Verify behavior when estimate equals deductible

**Steps:**
1. Enter contractor estimate: $10,000
2. Click "Calculate"

**Expected Results:**
- ✅ Red "NOT WORTH FILING" banner (delta = 0)
- ✅ Displays "Amount Below Deductible: $0"

### Test 4: Invalid Input Validation
**Objective:** Verify input validation works

**Steps:**
1. Enter negative number: -1000
2. Click "Calculate"
3. Clear field
4. Enter zero: 0
5. Click "Calculate"
6. Enter valid: 5000.50
7. Click "Calculate"

**Expected Results:**
- ✅ Negative: Alert shows "Please enter a valid amount"
- ✅ Zero: Alert shows "Please enter a valid amount"
- ✅ Decimal: Accepts and calculates correctly

### Test 5: Activity Logging
**Objective:** Verify activity is logged when estimate is entered

**Steps:**
1. After entering estimate in Test 1
2. Scroll to Activity Timeline section
3. Check for new activity

**Expected Results:**
- ✅ Activity shows "Contractor estimate entered: $15,000"
- ✅ Timestamp is recent
- ✅ Activity type indicates estimate entry

### Test 6: Persistence Across Page Refresh
**Objective:** Verify comparison result persists after refresh

**Steps:**
1. Enter estimate and calculate
2. Note the comparison result
3. Refresh the page (F5 or Cmd+R)
4. Check if comparison still shows

**Expected Results:**
- ✅ Comparison result still displays without re-entering
- ✅ Green/red banner shows correct recommendation
- ✅ All values match pre-refresh state

### Test 7: Status Visibility
**Objective:** Verify section only shows in appropriate statuses

**Steps:**
1. Claim in `draft` status - check section appears
2. Update claim to `filed` status
3. Refresh page - check section disappears
4. Update back to `assessing` status
5. Refresh page - check section reappears

**Expected Results:**
- ✅ Shows in `draft` status
- ✅ Shows in `assessing` status
- ✅ Hidden in `filed` status
- ✅ Hidden in other statuses

### Test 8: Loading States
**Objective:** Verify UI feedback during API calls

**Steps:**
1. Enter estimate
2. Click "Calculate"
3. Observe button during request

**Expected Results:**
- ✅ Button text changes to "Calculating..."
- ✅ Button is disabled during request
- ✅ Input field is disabled during request
- ✅ UI updates when response received

### Test 9: Error Handling
**Objective:** Verify error display on API failure

**Steps:**
1. Stop backend server
2. Enter estimate and click "Calculate"
3. Observe error display

**Expected Results:**
- ✅ Red error banner appears
- ✅ Message: "Failed to update estimate. Please try again."
- ✅ User can retry after backend restarts

### Test 10: Mobile Responsive
**Objective:** Verify layout works on small screens

**Steps:**
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Cmd+Shift+M)
3. Select iPhone SE or similar
4. Navigate to claim with estimate
5. Test input and buttons

**Expected Results:**
- ✅ Layout adapts to small screen
- ✅ Input field is usable
- ✅ Button is touch-friendly
- ✅ Banner text is readable
- ✅ No horizontal scroll

## Bug Tracking

If bugs found during testing, document here:

### Bug #1: [Title]
**Description:**
**Steps to reproduce:**
**Expected:**
**Actual:**
**Fix:**

---

## Sign-off

**Tested by:** ___________
**Date:** ___________
**All tests passed:** [ ] Yes [ ] No
**Notes:**
