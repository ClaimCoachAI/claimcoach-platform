# Step 4: ClaimCoach Filing Handoff - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split Step 4 into review/submit step with ClaimCoach team email notification, move adjuster info to Step 5.

**Architecture:** Add new backend endpoint for ClaimCoach notification, update frontend ClaimStepper with new Step 4 UI (review + description + submit), renumber Step 5 (adjuster info), Step 6 (AI audit).

**Tech Stack:** Go (Gin), React (TypeScript), TanStack Query, SendGrid email service

---

## Task 1: Backend - Add ClaimCoach Email Configuration

**Files:**
- Modify: `internal/config/config.go`

**Step 1: Add ClaimCoachEmail field to Config struct**

In `internal/config/config.go`, add the new field after SendGridFromName:

```go
type Config struct {
	// ... existing fields
	SendGridFromName  string `env:"SENDGRID_FROM_NAME" envDefault:"ClaimCoach AI"`
	ClaimCoachEmail   string `env:"CLAIMCOACH_EMAIL" envDefault:"claims@claimcoach.ai"`
	// ... rest of fields
}
```

**Step 2: Verify config loads correctly**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/config/config.go
git commit -m "feat(config): add ClaimCoach email configuration

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Backend - Add Email Service Method

**Files:**
- Modify: `internal/services/email_service.go`

**Step 1: Add ClaimCoachEmail field to SendGridEmailService**

Add field to struct (after fromName):

```go
type SendGridEmailService struct {
	apiKey          string
	fromEmail       string
	fromName        string
	claimCoachEmail string
	appURL          string
}
```

**Step 2: Update NewSendGridEmailService constructor**

Add claimCoachEmail and appURL parameters:

```go
func NewSendGridEmailService(apiKey, fromEmail, fromName, claimCoachEmail, appURL string) *SendGridEmailService {
	return &SendGridEmailService{
		apiKey:          apiKey,
		fromEmail:       fromEmail,
		fromName:        fromName,
		claimCoachEmail: claimCoachEmail,
		appURL:          appURL,
	}
}
```

**Step 3: Add SendClaimCoachNotification method**

Add at end of file before any helper methods:

```go
func (s *SendGridEmailService) SendClaimCoachNotification(claim *models.Claim) error {
	if claim.Property == nil {
		return fmt.Errorf("claim property relationship not loaded")
	}
	if claim.Policy == nil {
		return fmt.Errorf("claim policy relationship not loaded")
	}

	subject := fmt.Sprintf("New Claim Ready to File - %s", claim.Property.LegalAddress)

	lossTypeDisplay := "Unknown"
	if claim.LossType == "water" {
		lossTypeDisplay = "💧 Water Damage"
	} else if claim.LossType == "hail" {
		lossTypeDisplay = "🧊 Hail Damage"
	}

	incidentDateFormatted := claim.IncidentDate.Format("January 2, 2006")

	description := "No description provided"
	if claim.Description != nil {
		description = *claim.Description
	}

	deductible := 0.0
	if claim.Policy.DeductibleCalculated != nil {
		deductible = *claim.Policy.DeductibleCalculated
	}

	estimateTotal := 0.0
	estimateDisplay := "Pending estimate"
	if claim.ContractorEstimateTotal != nil {
		estimateTotal = *claim.ContractorEstimateTotal
		estimateDisplay = fmt.Sprintf("$%.2f", estimateTotal)
	}

	amountAboveDeductible := 0.0
	if estimateTotal > 0 {
		amountAboveDeductible = estimateTotal - deductible
		if amountAboveDeductible < 0 {
			amountAboveDeductible = 0
		}
	}

	carrierName := "Not specified"
	if claim.Policy.CarrierName != nil {
		carrierName = *claim.Policy.CarrierName
	}

	policyNumber := "Not specified"
	if claim.Policy.PolicyNumber != nil {
		policyNumber = *claim.Policy.PolicyNumber
	}

	ownerEntity := "Not specified"
	if claim.Property.OwnerEntityName != nil {
		ownerEntity = *claim.Property.OwnerEntityName
	}

	body := fmt.Sprintf(`
	<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		<h2 style="color: #1e3a8a;">New Claim Submission</h2>

		<h3 style="color: #475569; margin-top: 24px;">Property Information</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Address:</strong> %s</li>
			<li><strong>Owner:</strong> %s</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Claim Details</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Loss Type:</strong> %s</li>
			<li><strong>Incident Date:</strong> %s</li>
			<li><strong>Description:</strong> %s</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Financial Summary</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Policy Deductible:</strong> $%.2f</li>
			<li><strong>Contractor Estimate:</strong> %s</li>
			<li><strong>Amount Above Deductible:</strong> $%.2f</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Insurance Information</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Carrier:</strong> %s</li>
			<li><strong>Policy Number:</strong> %s</li>
		</ul>

		<p style="margin-top: 24px;">
			<a href="%s/claims/%s" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Claim in Dashboard</a>
		</p>
	</div>
	`,
		claim.Property.LegalAddress,
		ownerEntity,
		lossTypeDisplay,
		incidentDateFormatted,
		description,
		deductible,
		estimateDisplay,
		amountAboveDeductible,
		carrierName,
		policyNumber,
		s.appURL,
		claim.ID,
	)

	return s.sendEmail(s.claimCoachEmail, subject, body)
}
```

**Step 4: Verify build succeeds**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/services/email_service.go
git commit -m "feat(email): add ClaimCoach notification email method

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Backend - Update Router to Pass Config to Email Service

**Files:**
- Modify: `internal/api/router.go`

**Step 1: Update SendGrid email service initialization**

Find the SendGrid initialization block (around line 73-78) and update:

```go
// Conditionally use SendGrid or Mock email service based on API key
var emailService services.EmailService
if cfg.SendGridAPIKey != "" {
	emailService = services.NewSendGridEmailService(
		cfg.SendGridAPIKey,
		cfg.SendGridFromEmail,
		cfg.SendGridFromName,
		cfg.ClaimCoachEmail,
		cfg.FrontendURL,
	)
	log.Println("✓ Using SendGrid email service")
} else {
	emailService = services.NewMockEmailService()
	log.Println("⚠ Using Mock email service (emails logged to console)")
}
```

**Step 2: Verify build succeeds**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/api/router.go
git commit -m "feat(router): pass config to email service for ClaimCoach notifications

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Backend - Add NotifyClaimCoach Handler

**Files:**
- Modify: `internal/handlers/claim_handler.go`

**Step 1: Add NotifyClaimCoach handler method**

Add after GetActivities handler:

```go
func (h *ClaimHandler) NotifyClaimCoach(c *gin.Context) {
	claimID := c.Param("id")
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
		log.Printf("Failed to send ClaimCoach notification for claim %s: %v", claimID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to notify ClaimCoach team"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
```

**Step 2: Add emailService field to ClaimHandler**

Add field to ClaimHandler struct:

```go
type ClaimHandler struct {
	claimService *services.ClaimService
	emailService services.EmailService
}
```

**Step 3: Update NewClaimHandler constructor**

Update constructor to accept emailService:

```go
func NewClaimHandler(claimService *services.ClaimService, emailService services.EmailService) *ClaimHandler {
	return &ClaimHandler{
		claimService: claimService,
		emailService: emailService,
	}
}
```

**Step 4: Verify build succeeds**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/handlers/claim_handler.go
git commit -m "feat(handlers): add NotifyClaimCoach handler for Step 4 submission

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Backend - Register NotifyClaimCoach Route

**Files:**
- Modify: `internal/api/router.go`

**Step 1: Pass emailService to ClaimHandler**

Find the claimHandler initialization (around line 153) and update:

```go
// Claim routes
claimHandler := handlers.NewClaimHandler(claimService, emailService)
```

**Step 2: Add notify-claimcoach route**

Add after the claim routes (around line 162):

```go
api.POST("/claims/:id/notify-claimcoach", claimHandler.NotifyClaimCoach)
```

**Step 3: Verify build succeeds**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds

**Step 4: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/api/router.go
git commit -m "feat(routes): register NotifyClaimCoach endpoint

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend - Update ClaimStepper Step 4 UI

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Add state for description field**

Add near other state declarations at top of component:

```typescript
const [step4Description, setStep4Description] = useState<string>(claim.description || '')
```

**Step 2: Add Step 4 mutation**

Add after other mutations:

```typescript
const step4Mutation = useMutation({
  mutationFn: async (data: { description: string }) => {
    // Update claim with description and mark step complete
    const updatedStepsCompleted = [...(claim.steps_completed || []), 4]
    await api.patch(`/api/claims/${claim.id}/step`, {
      current_step: 5,
      steps_completed: updatedStepsCompleted,
      description: data.description
    })

    // Notify ClaimCoach team
    await api.post(`/api/claims/${claim.id}/notify-claimcoach`)

    return data
  },
  onSuccess: () => {
    toast.success('Claim submitted to ClaimCoach team ✓')
    queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
  },
  onError: (error: any) => {
    console.error('Step 4 submission error:', error)
    toast.error('Failed to submit claim. Please try again.')
  }
})
```

**Step 3: Add handleStep4Submit handler**

Add after other step handlers:

```typescript
const handleStep4Submit = (e: React.FormEvent) => {
  e.preventDefault()
  if (step4Description.trim().length < 20) {
    toast.error('Please provide a detailed description (at least 20 characters)')
    return
  }
  step4Mutation.mutate({ description: step4Description.trim() })
}
```

**Step 4: Replace Step 4 case content**

Replace the entire `case 4:` section with:

```typescript
case 4:
  // NEW: Review and submit to ClaimCoach
  return (
    <form onSubmit={handleStep4Submit} className="step-content">
      {/* Review Card */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <h3 className="text-xl font-display font-bold text-navy mb-2">📋 Review Claim Details</h3>
        <p className="text-slate mb-6">Before we submit to ClaimCoach team, please review and confirm these details:</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Loss Type
            </label>
            <p className="text-navy font-medium">
              {claim.loss_type === 'water' ? '💧 Water Damage' : '🧊 Hail Damage'}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Incident Date
            </label>
            <p className="text-navy font-medium">
              {new Date(claim.incident_date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Property
            </label>
            <p className="text-navy font-medium">
              {claim.property?.legal_address || claim.property?.nickname || 'N/A'}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Policy Deductible
            </label>
            <p className="text-navy font-medium">
              {claim.policy?.deductible_calculated
                ? `$${claim.policy.deductible_calculated.toLocaleString()}`
                : 'N/A'}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate/70 uppercase tracking-wider block mb-1">
              Contractor Estimate
            </label>
            <p className="text-navy font-medium">
              {claim.contractor_estimate_total
                ? `$${claim.contractor_estimate_total.toLocaleString()}`
                : 'Pending estimate'}
            </p>
          </div>
        </div>
      </div>

      {/* Editable Description */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-navy mb-2">
          Damage Description <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          minLength={20}
          maxLength={2000}
          rows={6}
          value={step4Description}
          onChange={(e) => setStep4Description(e.target.value)}
          placeholder="Describe the damage in detail - what happened, what's affected, extent of damage..."
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-ocean focus:outline-none transition-colors resize-y"
        />
        <p className="text-xs text-slate mt-2">
          Provide detailed information about the damage. This helps us file an accurate claim with your insurance company.
          {step4Description.length > 0 && ` (${step4Description.length} characters)`}
        </p>
      </div>

      <button
        type="submit"
        disabled={step4Mutation.isPending || !step4Description || step4Description.trim().length < 20}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {step4Mutation.isPending ? 'Submitting...' : 'Submit to ClaimCoach Team'}
      </button>
    </form>
  )
```

**Step 5: Verify no TypeScript errors**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend && npm run type-check`
Expected: No type errors

**Step 6: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend
git add src/components/ClaimStepper.tsx
git commit -m "feat(claim-stepper): add Step 4 review and submit UI

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Frontend - Renumber Step 5 (Adjuster Info)

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Update Step 5 case to handle adjuster info**

Replace `case 5:` section with:

```typescript
case 5:
  // MOVED: Adjuster info (was Step 4)
  return (
    <form onSubmit={handleAdjusterSubmit} className="step-content step-form">
      <h3 className="step-title">📞 Add Adjuster Information</h3>
      <p className="step-description">
        After ClaimCoach files your claim, the insurance company will assign an adjuster. Enter their details here.
      </p>

      <div className="form-group">
        <label htmlFor="insurance_claim_number" className="form-label">
          Insurance Claim Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="insurance_claim_number"
          required
          value={insuranceClaimNumber}
          onChange={(e) => setInsuranceClaimNumber(e.target.value)}
          placeholder="Enter claim number from insurance"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="adjuster_name" className="form-label">
          Adjuster Name
        </label>
        <input
          type="text"
          id="adjuster_name"
          value={adjusterName}
          onChange={(e) => setAdjusterName(e.target.value)}
          placeholder="Enter adjuster's name"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="adjuster_phone" className="form-label">
          Adjuster Phone
        </label>
        <input
          type="tel"
          id="adjuster_phone"
          value={adjusterPhone}
          onChange={(e) => setAdjusterPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="inspection_datetime" className="form-label">
          Inspection Date & Time
        </label>
        <input
          type="datetime-local"
          id="inspection_datetime"
          value={inspectionDatetime}
          onChange={(e) => setInspectionDatetime(e.target.value)}
          className="form-input"
        />
      </div>

      <button
        type="submit"
        disabled={adjusterMutation.isPending || !insuranceClaimNumber}
        className="btn-primary w-full disabled:opacity-50"
      >
        {adjusterMutation.isPending ? 'Saving...' : 'Complete This Step'}
      </button>
    </form>
  )
```

**Step 2: Update adjusterMutation to use Step 5 numbering**

Find the adjusterMutation (should be named something like step4Mutation currently) and update:

```typescript
const adjusterMutation = useMutation({
  mutationFn: async (data: {
    insurance_claim_number: string
    adjuster_name: string
    adjuster_phone: string
    inspection_datetime: string
  }) => {
    const updatedStepsCompleted = [...(claim.steps_completed || []), 5]
    await api.patch(`/api/claims/${claim.id}/step`, {
      current_step: 6,
      steps_completed: updatedStepsCompleted,
      insurance_claim_number: data.insurance_claim_number,
      adjuster_name: data.adjuster_name || null,
      adjuster_phone: data.adjuster_phone || null,
      inspection_datetime: data.inspection_datetime || null
    })
  },
  onSuccess: () => {
    toast.success('Adjuster information saved ✓')
    queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
  },
  onError: (error: any) => {
    console.error('Adjuster info error:', error)
    toast.error('Failed to save adjuster information. Please try again.')
  }
})
```

**Step 3: Update handleAdjusterSubmit**

Update handler to use new state variables:

```typescript
const handleAdjusterSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  if (!insuranceClaimNumber.trim()) {
    toast.error('Insurance claim number is required')
    return
  }
  adjusterMutation.mutate({
    insurance_claim_number: insuranceClaimNumber.trim(),
    adjuster_name: adjusterName.trim(),
    adjuster_phone: adjusterPhone.trim(),
    inspection_datetime: inspectionDatetime
  })
}
```

**Step 4: Verify no TypeScript errors**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend && npm run type-check`
Expected: No type errors

**Step 5: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend
git add src/components/ClaimStepper.tsx
git commit -m "feat(claim-stepper): move adjuster info to Step 5

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend - Renumber Step 6 (AI Audit)

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Update Step 6 case**

Replace `case 5:` with `case 6:` and keep existing AI audit content:

```typescript
case 6:
  // RENUMBERED: AI Audit (was Step 5)
  return (
    <div className="step-content">
      {/* Keep existing Step 5 AI Audit content exactly as is */}
      {/* Just change the case number */}
    </div>
  )
```

**Step 2: Verify no TypeScript errors**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend && npm run type-check`
Expected: No type errors

**Step 3: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend
git add src/components/ClaimStepper.tsx
git commit -m "feat(claim-stepper): renumber AI audit to Step 6

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Frontend - Update Step Navigation Labels

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Update getStepLabel function**

Find the getStepLabel function and update:

```typescript
const getStepLabel = (stepNum: number): string => {
  switch (stepNum) {
    case 1: return 'Incident Details'
    case 2: return 'Contact Contractor'
    case 3: return 'Compare to Deductible'
    case 4: return 'Submit to ClaimCoach'
    case 5: return 'Add Adjuster Info'
    case 6: return 'AI Audit'
    default: return `Step ${stepNum}`
  }
}
```

**Step 2: Update getTotalSteps constant**

Find where total steps is defined and update to 6:

```typescript
const TOTAL_STEPS = 6
```

**Step 3: Verify no TypeScript errors**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend && npm run type-check`
Expected: No type errors

**Step 4: Test in browser**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend && npm run dev`
Navigate to a claim and verify:
- Step 4 shows "Submit to ClaimCoach" with review card and description field
- Step 5 shows "Add Adjuster Info" with adjuster fields
- Step 6 shows AI Audit
- All steps render without errors

**Step 5: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend
git add src/components/ClaimStepper.tsx
git commit -m "feat(claim-stepper): update step labels for new journey flow

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Backend - Update MockEmailService

**Files:**
- Modify: `internal/services/email_service.go`

**Step 1: Add SendClaimCoachNotification to MockEmailService**

Add method after other MockEmailService methods:

```go
func (m *MockEmailService) SendClaimCoachNotification(claim *models.Claim) error {
	log.Printf("📧 [MOCK EMAIL] ClaimCoach Notification")
	log.Printf("   To: claimcoach-team@example.com")

	lossType := "Unknown"
	if claim.LossType == "water" {
		lossType = "💧 Water Damage"
	} else if claim.LossType == "hail" {
		lossType = "🧊 Hail Damage"
	}

	description := "No description"
	if claim.Description != nil {
		description = *claim.Description
	}

	propertyAddress := "N/A"
	if claim.Property != nil {
		propertyAddress = claim.Property.LegalAddress
	}

	log.Printf("   Subject: New Claim Ready to File - %s", propertyAddress)
	log.Printf("   Loss Type: %s", lossType)
	log.Printf("   Incident Date: %s", claim.IncidentDate.Format("January 2, 2006"))
	log.Printf("   Description: %s", description)

	return nil
}
```

**Step 2: Verify build succeeds**

Run: `cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend && go build ./cmd/api`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add internal/services/email_service.go
git commit -m "feat(email): add ClaimCoach notification to mock service

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Integration Testing

**Files:**
- None (manual testing)

**Step 1: Start backend**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
go run ./cmd/api
```

Expected: Server starts without errors

**Step 2: Start frontend**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/frontend
npm run dev
```

Expected: Dev server starts

**Step 3: Test Step 4 submission flow**

1. Navigate to a claim
2. Complete Steps 1-3
3. Navigate to Step 4
4. Verify review card shows:
   - Loss type with emoji
   - Incident date formatted
   - Property address
   - Policy deductible amount
   - Contractor estimate or "Pending"
5. Try submitting without description
   - Expected: Button disabled
6. Enter description < 20 characters
   - Expected: Button disabled
7. Enter valid description (20+ chars)
   - Expected: Button enabled
8. Click "Submit to ClaimCoach Team"
   - Expected: Success toast appears
   - Expected: Backend logs mock email
   - Expected: Redirected to Step 5 or step marked complete

**Step 4: Test Step 5 adjuster info**

1. Navigate to Step 5
2. Verify form shows adjuster fields
3. Try submitting without claim number
   - Expected: Validation error
4. Enter insurance claim number
5. Optionally fill adjuster name, phone, inspection date
6. Click "Complete This Step"
   - Expected: Success toast
   - Expected: Step marked complete

**Step 5: Verify Step 6 AI Audit**

1. Navigate to Step 6
2. Verify existing AI audit UI renders
3. Expected: No errors or broken UI

**Step 6: Document any issues**

If any issues found, note them for fixes.

---

## Task 12: Add Environment Variable Documentation

**Files:**
- Modify: `README.md` or `.env.example`

**Step 1: Add CLAIMCOACH_EMAIL to .env.example**

Add after SendGrid variables:

```bash
# ClaimCoach Team
CLAIMCOACH_EMAIL=claims@claimcoach.ai
```

**Step 2: Update README with new step flow**

Find claim journey documentation and update to reflect new 6-step flow.

**Step 3: Commit**

```bash
cd /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend
git add .env.example
git commit -m "docs: add ClaimCoach email configuration

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

✅ Backend endpoint POST /api/claims/:id/notify-claimcoach exists and sends email
✅ Frontend Step 4 displays review card with all claim details
✅ Description field is required with minimum 20 characters
✅ Submission creates activity, sends email, marks step complete
✅ Step 5 handles adjuster info collection
✅ Step 6 shows AI audit (renumbered from Step 5)
✅ Step labels updated in navigation
✅ Mock email service logs ClaimCoach notifications
✅ No TypeScript errors or build failures
✅ Integration test passes for complete flow

## Notes

- Follow TDD principles: test each component/function as it's built
- Commit frequently with clear, descriptive messages
- Use existing toast notification system for user feedback
- Maintain glass-card UI aesthetic for review section
- Validate on both frontend and backend
- Handle missing/null values gracefully in email template
- Email failure should not lose user's description input (form state preserved)
