# Step 4 Submitted View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After submitting Step 4, show the submitted description in a read-only view with an "Edit & Resend" button, and remove the dashboard link from the ClaimCoach team email.

**Architecture:** Add an `isEditingDescription` boolean state to ClaimStepper. When Step 4 is already completed, render a read-only card instead of the form. The "Edit & Resend" button sets `isEditingDescription = true` to show the form again, pre-populated. Re-submission is idempotent — it updates the description and re-notifies without changing step progress since the step is already done.

**Tech Stack:** React + TypeScript (frontend), Go + SendGrid (backend)

---

### Task 1: Add `isEditingDescription` state and modify Step 4 render logic

**Files:**
- Modify: `frontend/src/components/ClaimStepper.tsx`

**Step 1: Add state variable**

Find the `step4Description` state declaration (around line 166):
```ts
const [step4Description, setStep4Description] = useState<string>(claim.description || '')
```
Add the new state directly below it:
```ts
const [isEditingDescription, setIsEditingDescription] = useState<boolean>(false)
```

**Step 2: Update `step4Mutation.onSuccess`**

In the `step4Mutation` `onSuccess` callback (around line 302), add `setIsEditingDescription(false)` after the toast:
```ts
onSuccess: () => {
  setIsEditingDescription(false)
  setToast({
    message: '✓ Claim submitted to ClaimCoach team',
    type: 'success',
  })
  queryClient.invalidateQueries({ queryKey: ['claim', claim.id] })
},
```

**Step 3: Update `step4Mutation.mutationFn` for idempotent re-submit**

Replace the mutation function body so it handles re-submission (step already completed) without changing step progress:
```ts
mutationFn: async (data: { description: string }) => {
  const alreadyCompleted = (claim.steps_completed || []).includes(4)
  const updatedStepsCompleted = alreadyCompleted
    ? claim.steps_completed
    : [...(claim.steps_completed || []), 4]

  await api.patch(`/api/claims/${claim.id}/step`, {
    ...(alreadyCompleted ? {} : { current_step: 5 }),
    steps_completed: updatedStepsCompleted,
    description: data.description,
  })

  await api.post(`/api/claims/${claim.id}/notify-claimcoach`)
  return data
},
```

**Step 4: Replace `case 4` render with mode-aware view**

Replace the entire `case 4` block (from `case 4:` to its closing `)`). The new version checks if the step is already done and not in edit mode — if so, render a read-only submitted view; otherwise render the existing form.

```tsx
case 4: {
  const isStep4Done = claim.steps_completed?.includes(4)
  const showReadOnly = isStep4Done && !isEditingDescription

  if (showReadOnly) {
    return (
      <div className="step-content">
        {/* Submitted confirmation banner */}
        <div className="filing-notice" style={{ borderLeftColor: '#10b981' }}>
          <div className="filing-notice-icon" style={{ background: '#10b981' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="filing-notice-body">
            <strong className="filing-notice-title">Submitted to ClaimCoach team</strong>
            <p className="filing-notice-text">
              Your claim details have been sent. Our team will file this on your behalf.
            </p>
          </div>
        </div>

        {/* Submitted description */}
        <div className="glass-card">
          <h4 className="review-heading" style={{ marginBottom: '12px' }}>Your Damage Description</h4>
          <p style={{
            color: '#374151',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            margin: 0,
            fontSize: '14px',
          }}>
            {claim.description || '—'}
          </p>
        </div>

        {/* Edit & Resend */}
        <button
          type="button"
          onClick={() => setIsEditingDescription(true)}
          style={{
            background: 'transparent',
            border: '1px solid #d1d5db',
            color: '#6b7280',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            alignSelf: 'flex-start',
          }}
        >
          Edit & Resend
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleStep4Submit} className="step-content step-form">
      {/* Review Card */}
      <div className="glass-card">
        <h4 className="review-heading">Claim Details Review</h4>
        <div className="review-grid">
          <div className="review-item">
            <span className="review-label">Loss Type</span>
            <span className="review-value">
              {claim.loss_type === 'water' ? '💧 Water Damage' : '🧊 Hail Damage'}
            </span>
          </div>
          <div className="review-item">
            <span className="review-label">Incident Date</span>
            <span className="review-value">
              {new Date(claim.incident_date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="review-item">
            <span className="review-label">Property</span>
            <span className="review-value">
              {claim.property?.nickname || claim.property?.legal_address || 'N/A'}
            </span>
          </div>
          <div className="review-item">
            <span className="review-label">Your Deductible</span>
            <span className="review-value">
              ${(claim.policy?.deductible_calculated || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          {!!claim.contractor_estimate_total && (
            <div className="review-item">
              <span className="review-label">Contractor Estimate</span>
              <span className="review-value">
                ${claim.contractor_estimate_total.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filing Notice Banner */}
      <div className="filing-notice">
        <div className="filing-notice-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="filing-notice-body">
          <strong className="filing-notice-title">ClaimCoach will file this claim on your behalf</strong>
          <p className="filing-notice-text">
            Our team submits your claim directly to the insurance carrier. The more detail you provide
            about the damage below — what was affected, how severe it is, and when it occurred —
            the stronger your case will be.
          </p>
        </div>
      </div>

      {/* Description Field */}
      <div className="form-field">
        <label>
          Damage Description <span className="required">*</span>
        </label>
        <textarea
          required
          minLength={20}
          maxLength={2000}
          value={step4Description}
          onChange={(e) => setStep4Description(e.target.value)}
          placeholder="Describe the damage in detail. What happened? What was affected? Any additional information that would help the ClaimCoach team understand your situation..."
          rows={6}
          className="description-textarea"
        />
        <div className="char-count">
          {step4Description.length} / 2000 characters
          {step4Description.length < 20 && (
            <span className="char-count-warning"> (minimum 20 required)</span>
          )}
        </div>
      </div>

      {step4Mutation.isError && (
        <div className="error">
          {(step4Mutation.error as any)?.response?.data?.error || 'Failed to submit claim'}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {isStep4Done && (
          <button
            type="button"
            onClick={() => setIsEditingDescription(false)}
            style={{
              background: 'transparent',
              border: '1px solid #d1d5db',
              color: '#6b7280',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={step4Mutation.isPending || step4Description.trim().length < 20}
        >
          {step4Mutation.isPending
            ? 'Submitting...'
            : isStep4Done
            ? 'Resend to ClaimCoach Team'
            : 'Submit to ClaimCoach Team'}
        </button>
      </div>
    </form>
  )
}
```

**Step 5: Verify in browser**
- Open a claim that has Step 4 completed
- Should see the submitted description and "Edit & Resend" button (no empty textarea)
- Click "Edit & Resend" — form appears pre-populated, button says "Resend to ClaimCoach Team", Cancel button visible
- Click Cancel — returns to read-only view
- Edit text and Resend — email fires, returns to read-only view with updated text, step stays DONE

**Step 6: Commit**
```bash
git add frontend/src/components/ClaimStepper.tsx
git commit -m "feat(step4): show submitted description in read-only view with edit & resend"
```

---

### Task 2: Remove dashboard button from ClaimCoach team email

**Files:**
- Modify: `backend/internal/services/sendgrid_email_service.go`

**Step 1: Remove the button from the HTML template**

In `SendClaimCoachNotification` (around line 263-265), find and remove this block:
```html
<p style="margin-top: 24px;">
    <a href="%s/claims/%s" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Claim in Dashboard</a>
</p>
```

Also remove the two corresponding `fmt.Sprintf` arguments at the bottom of the format call:
```go
s.appURL,
claim.ID,
```

**Step 2: Verify the template compiles**
```bash
cd backend && go build ./...
```
Expected: no errors.

**Step 3: Commit**
```bash
git add backend/internal/services/sendgrid_email_service.go
git commit -m "fix(email): remove dashboard link from ClaimCoach team notification"
```
