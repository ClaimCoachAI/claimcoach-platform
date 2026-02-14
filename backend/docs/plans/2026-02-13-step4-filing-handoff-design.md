# Step 4: ClaimCoach Filing Handoff - Design Document

**Date:** 2026-02-13
**Status:** Approved
**Author:** Design Session with User

## Problem Statement

Property managers need to review and confirm claim details before ClaimCoach team files with insurance. Currently Step 4 collects adjuster info, but there's no handoff point where:
1. Property manager reviews what will be submitted
2. Required damage description is collected/confirmed
3. ClaimCoach team is notified to file the claim

## Solution: Split Filing Into Two Steps

Add new Step 4 for claim review/submission, move adjuster info collection to Step 5.

### New Journey Flow

1. **Step 1:** Incident Details
2. **Step 2:** Contact Contractor
3. **Step 3:** Compare to Deductible
4. **Step 4:** Submit to ClaimCoach *(NEW)* - Review + send to team
5. **Step 5:** Add Adjuster Info *(MOVED)* - After insurance assigns
6. **Step 6:** AI Audit *(RENUMBERED)*

## Step 4: Submit to ClaimCoach (New)

### Purpose
Property manager reviews claim details and submits to ClaimCoach team for filing with insurance company.

### UI Layout

```
┌─────────────────────────────────────────┐
│ 📋 Review Claim Details                 │
│                                         │
│ Before we submit to ClaimCoach team,   │
│ please review and confirm these details│
├─────────────────────────────────────────┤
│                                         │
│ Loss Type                               │
│ 💧 Water Damage                         │
│                                         │
│ Incident Date                           │
│ January 15, 2024                        │
│                                         │
│ Property                                │
│ 123 Main St                             │
│                                         │
│ Policy Deductible                       │
│ $2,500.00                               │
│                                         │
│ Contractor Estimate                     │
│ $8,500.00                               │
├─────────────────────────────────────────┤
│ Damage Description *                    │
│ ┌─────────────────────────────────────┐ │
│ │ [Large textarea - pre-filled if     │ │
│ │  entered in Step 1, required]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Submit to ClaimCoach Team] ←Button    │
└─────────────────────────────────────────┘
```

### UI Components

**Review Card (Read-Only):**
- Loss type with emoji (💧 Water / 🧊 Hail)
- Incident date (formatted)
- Property address (from claim.property)
- Policy deductible (from claim.policy)
- Contractor estimate (from Step 3, or "Pending" if not entered)

**Editable Fields:**
- **Damage Description** (required)
  - Pre-filled with `claim.description` if exists
  - Large textarea (minimum 20 characters)
  - Placeholder: "Describe the damage in detail - what happened, what's affected, extent of damage..."
  - Helper text: "Provide detailed information about the damage. This helps us file an accurate claim with your insurance company."

**Submit Button:**
- Text: "Submit to ClaimCoach Team"
- Primary action style
- Disabled until description is filled
- Loading state: "Submitting..."

### User Flow

1. Property manager navigates to Step 4
2. Reviews displayed claim information
3. Fills/edits damage description (required)
4. Clicks "Submit to ClaimCoach Team"
5. System:
   - Saves description to claim
   - Sends email notification to ClaimCoach team
   - Marks Step 4 complete
   - Shows success toast: "Claim submitted to ClaimCoach team ✓"
6. Property manager can proceed to Step 5 when adjuster is assigned

## Step 5: Add Adjuster Info (Moved from Step 4)

### Purpose
Enter adjuster details after ClaimCoach team files claim and insurance company assigns adjuster.

### UI
- **Identical to current Step 4** - just renumbered
- Fields:
  - Insurance Claim Number (required)
  - Adjuster Name (optional)
  - Adjuster Phone (optional)
  - Inspection Date & Time (optional)

### User Flow
1. ClaimCoach team files claim with insurance
2. Insurance assigns adjuster
3. Property manager returns to Step 5
4. Enters adjuster details
5. Clicks "Complete This Step"

## Technical Implementation

### Frontend Changes

**ClaimStepper.tsx:**
```typescript
case 4:
  // NEW: Review and submit to ClaimCoach
  return (
    <form onSubmit={handleStep4Submit} className="step-content">
      {/* Review Card */}
      <div className="review-card">
        <h3>Review Claim Details</h3>
        <p>Before we submit to ClaimCoach team, please review and confirm:</p>

        <div className="review-grid">
          <div className="review-item">
            <label>Loss Type</label>
            <span>{claim.loss_type === 'water' ? '💧 Water Damage' : '🧊 Hail Damage'}</span>
          </div>

          <div className="review-item">
            <label>Incident Date</label>
            <span>{formatDate(claim.incident_date)}</span>
          </div>

          <div className="review-item">
            <label>Property</label>
            <span>{claim.property?.legal_address || claim.property?.nickname}</span>
          </div>

          <div className="review-item">
            <label>Policy Deductible</label>
            <span>${claim.policy?.deductible_calculated?.toLocaleString()}</span>
          </div>

          <div className="review-item">
            <label>Contractor Estimate</label>
            <span>
              {claim.contractor_estimate_total
                ? `$${claim.contractor_estimate_total.toLocaleString()}`
                : 'Pending estimate'}
            </span>
          </div>
        </div>
      </div>

      {/* Editable Description */}
      <div className="form-field">
        <label>
          Damage Description <span className="required">*</span>
        </label>
        <textarea
          required
          minLength={20}
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the damage in detail - what happened, what's affected, extent of damage..."
        />
        <p className="helper-text">
          Provide detailed information about the damage. This helps us file an accurate claim.
        </p>
      </div>

      <button type="submit" disabled={step4Mutation.isPending || !description || description.length < 20}>
        {step4Mutation.isPending ? 'Submitting...' : 'Submit to ClaimCoach Team'}
      </button>
    </form>
  )

case 5:
  // MOVED: Adjuster info (was Step 4)
  return (
    <form onSubmit={handleStep5Submit} className="step-content step-form">
      {/* Existing adjuster form fields */}
    </form>
  )

case 6:
  // RENUMBERED: AI Audit (was Step 5)
  // ... existing Step 5 code
```

**Mutations:**
```typescript
const step4Mutation = useMutation({
  mutationFn: async (data: { description: string }) => {
    // Update claim with description and mark step complete
    await api.patch(`/api/claims/${claim.id}/step`, {
      current_step: 5,
      steps_completed: [...(claim.steps_completed || []), 4],
      description: data.description
    })

    // Notify ClaimCoach team
    await api.post(`/api/claims/${claim.id}/notify-claimcoach`)

    return data
  },
  onSuccess: () => {
    showToast('Claim submitted to ClaimCoach team ✓', 'success')
    queryClient.invalidateQueries(['claim', claim.id])
  },
  onError: (error) => {
    showToast('Failed to submit claim. Please try again.', 'error')
  }
})

const step5Mutation = useMutation({
  // Existing step4Mutation logic (adjuster info)
  mutationFn: async (data) => {
    await api.patch(`/api/claims/${claim.id}/step`, {
      current_step: 6,
      steps_completed: [...(claim.steps_completed || []), 5],
      insurance_claim_number: data.insurance_claim_number,
      adjuster_name: data.adjuster_name,
      adjuster_phone: data.adjuster_phone,
      inspection_datetime: data.inspection_datetime
    })
  }
})
```

### Backend Changes

**New Endpoint: POST /api/claims/:id/notify-claimcoach**

```go
// internal/handlers/claim_handler.go
func (h *ClaimHandler) NotifyClaimCoach(c *gin.Context) {
    claimID := c.Param("id")
    userID := c.GetString("user_id")
    orgID := c.GetString("organization_id")

    // Get full claim with relationships
    claim, err := h.claimService.GetClaim(claimID, orgID)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Claim not found"})
        return
    }

    // Send email to ClaimCoach team
    err = h.emailService.SendClaimCoachNotification(claim)
    if err != nil {
        log.Printf("Failed to send ClaimCoach notification: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to notify team"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"success": true})
}
```

**Email Service Method:**

```go
// internal/services/email_service.go
func (s *SendGridEmailService) SendClaimCoachNotification(claim *models.Claim) error {
    subject := fmt.Sprintf("New Claim Ready to File - %s", claim.Property.LegalAddress)

    body := fmt.Sprintf(`
    <h2>New Claim Submission</h2>

    <h3>Property Information</h3>
    <ul>
        <li><strong>Address:</strong> %s</li>
        <li><strong>Owner:</strong> %s</li>
    </ul>

    <h3>Claim Details</h3>
    <ul>
        <li><strong>Loss Type:</strong> %s</li>
        <li><strong>Incident Date:</strong> %s</li>
        <li><strong>Description:</strong> %s</li>
    </ul>

    <h3>Financial Summary</h3>
    <ul>
        <li><strong>Policy Deductible:</strong> $%.2f</li>
        <li><strong>Contractor Estimate:</strong> $%.2f</li>
        <li><strong>Amount Above Deductible:</strong> $%.2f</li>
    </ul>

    <h3>Insurance Information</h3>
    <ul>
        <li><strong>Carrier:</strong> %s</li>
        <li><strong>Policy Number:</strong> %s</li>
    </ul>

    <p><a href="%s/claims/%s">View Claim in Dashboard</a></p>
    `,
        claim.Property.LegalAddress,
        claim.Property.OwnerEntityName,
        claim.LossType,
        claim.IncidentDate.Format("January 2, 2006"),
        claim.Description,
        claim.Policy.DeductibleCalculated,
        *claim.ContractorEstimateTotal,
        *claim.ContractorEstimateTotal - claim.Policy.DeductibleCalculated,
        claim.Policy.CarrierName,
        *claim.Policy.PolicyNumber,
        s.appURL,
        claim.ID,
    )

    return s.sendEmail(s.claimCoachEmail, subject, body)
}
```

**Configuration:**
```go
// internal/config/config.go
type Config struct {
    // ... existing fields
    ClaimCoachEmail string `env:"CLAIMCOACH_EMAIL" envDefault:"claims@claimcoach.ai"`
}
```

**Router Update:**
```go
// internal/api/router.go
api.POST("/claims/:id/notify-claimcoach", claimHandler.NotifyClaimCoach)
```

### Database Changes

**None required** - All fields already exist:
- `description` field on claims table (already exists, just needs validation)
- Step tracking fields (`current_step`, `steps_completed`) already exist

## Validation & Error Handling

### Frontend Validation

**Description Field:**
- Required: Yes
- Minimum length: 20 characters
- Maximum length: 2000 characters
- Error message: "Please provide a detailed description of the damage (at least 20 characters)"

**Submit Button State:**
```typescript
disabled={
  step4Mutation.isPending ||
  !description ||
  description.trim().length < 20
}
```

### Backend Validation

**UpdateClaimStep endpoint:**
- Validate description exists and length >= 20 characters
- Return 400 error if invalid

### Error Scenarios

**Email Failure:**
- Log error on backend
- Return 500 error to frontend
- Frontend shows: "Failed to notify ClaimCoach team. Please try again or contact support."
- Allow user to retry submission

**Network Failure:**
- Frontend shows generic error
- User can retry
- Description is saved locally (form state preserved)

**Validation Failure:**
- Show inline error below description field
- Submit button remains disabled
- Clear error when user starts typing

## Edge Cases

1. **No contractor estimate entered yet:**
   - Display "Pending estimate" in review card
   - Allow submission anyway (ClaimCoach can file without estimate)

2. **Description pre-filled from Step 1:**
   - Show existing description in textarea
   - User can edit/expand before submitting
   - Highlight that this is editable with helper text

3. **User returns to edit Step 4:**
   - Allow editing description
   - **Do NOT re-send email** - check if step already completed
   - Just update description in database

4. **Missing property or policy data:**
   - Show "N/A" for missing fields
   - Still allow submission (ClaimCoach team will follow up)

5. **Step 5 accessed before Step 4 complete:**
   - Show message: "Complete Step 4 first to submit claim to ClaimCoach team"
   - Disable Step 5 form

## Success Criteria

✅ Property manager can review all key claim details in one place
✅ Description field is required before submission
✅ ClaimCoach team receives email with all necessary filing information
✅ Adjuster info collection happens after filing (Step 5)
✅ Clear visual feedback when claim is submitted
✅ Email failure doesn't lose user's description input

## Future Enhancements (Out of Scope)

- Two-way sync: ClaimCoach team updates claim status from their dashboard
- Attachment upload in Step 4 (photos, documents)
- Email preview before sending
- Notification preferences (email vs in-app)
- ClaimCoach team task queue/assignment system
- Automatic status updates when adjuster is assigned

## Implementation Notes

- Use existing email service (SendGrid already configured)
- Maintain glass-card UI aesthetic for review section
- Follow existing form validation patterns
- Use existing toast notification system for success/error messages
- Test with both SendGrid and mock email service
- Ensure email HTML renders well in common email clients
