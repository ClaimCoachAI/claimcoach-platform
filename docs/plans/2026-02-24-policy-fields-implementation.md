# Policy Fields Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Coverage A/B/D limits and deductible type with carrier contact info and exclusions on the insurance policy.

**Architecture:** Four sequential tasks — DB migration, Go model update, Go service update, React frontend update. Each task builds on the previous. Backend and frontend are fully independent after the migration.

**Tech Stack:** PostgreSQL (Supabase via golang-migrate), Go 1.21, Gin, React 18 + TypeScript + Tailwind

---

### Task 1: Database Migration

**Files:**
- Create: `backend/internal/database/migrations/000013_update_policy_fields.up.sql`
- Create: `backend/internal/database/migrations/000013_update_policy_fields.down.sql`

**Step 1: Create the up migration**

```sql
-- 000013_update_policy_fields.up.sql

-- Add new fields
ALTER TABLE insurance_policies
  ADD COLUMN carrier_phone TEXT,
  ADD COLUMN carrier_email TEXT,
  ADD COLUMN exclusions TEXT;

-- Drop removed fields
ALTER TABLE insurance_policies
  DROP COLUMN IF EXISTS coverage_a_limit,
  DROP COLUMN IF EXISTS coverage_b_limit,
  DROP COLUMN IF EXISTS coverage_d_limit,
  DROP COLUMN IF EXISTS deductible_type,
  DROP COLUMN IF EXISTS deductible_calculated;
```

**Step 2: Create the down migration**

```sql
-- 000013_update_policy_fields.down.sql

ALTER TABLE insurance_policies
  DROP COLUMN IF EXISTS carrier_phone,
  DROP COLUMN IF EXISTS carrier_email,
  DROP COLUMN IF EXISTS exclusions;

ALTER TABLE insurance_policies
  ADD COLUMN coverage_a_limit NUMERIC,
  ADD COLUMN coverage_b_limit NUMERIC,
  ADD COLUMN coverage_d_limit NUMERIC,
  ADD COLUMN deductible_type TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN deductible_calculated NUMERIC NOT NULL DEFAULT 0;
```

**Step 3: Run the migration**

```bash
migrate -path "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend/internal/database/migrations" \
  -database "$(grep DATABASE_URL /Users/benjaminlopez/Documents/ClaimCoachAI\ Code/backend/.env | cut -d= -f2-)" \
  up
```

Expected output: `13/u update_policy_fields`

**Step 4: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add backend/internal/database/migrations/000013_update_policy_fields.up.sql
git add backend/internal/database/migrations/000013_update_policy_fields.down.sql
git commit -m "feat(db): add carrier contact and exclusions, remove coverage limits"
```

---

### Task 2: Update Go Model

**Files:**
- Modify: `backend/internal/models/policy.go`

**Step 1: Replace the Policy struct**

The current struct has `CoverageALimit`, `CoverageBLimit`, `CoverageDLimit`, `DeductibleType`, `DeductibleCalculated`. Replace the entire file with:

```go
package models

import "time"

type Policy struct {
	ID             string     `json:"id" db:"id"`
	PropertyID     string     `json:"property_id" db:"property_id"`
	CarrierName    string     `json:"carrier_name" db:"carrier_name"`
	CarrierPhone   *string    `json:"carrier_phone" db:"carrier_phone"`
	CarrierEmail   *string    `json:"carrier_email" db:"carrier_email"`
	PolicyNumber   *string    `json:"policy_number" db:"policy_number"`
	DeductibleValue float64   `json:"deductible_value" db:"deductible_value"`
	Exclusions     *string    `json:"exclusions" db:"exclusions"`
	PolicyPdfUrl   *string    `json:"policy_pdf_url" db:"policy_pdf_url"`
	EffectiveDate  *time.Time `json:"effective_date" db:"effective_date"`
	ExpirationDate *time.Time `json:"expiration_date" db:"expiration_date"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}
```

**Step 2: Build to catch errors**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./... 2>&1
```

Expected: errors in `policy_service.go` referencing removed fields (that's expected — fix in Task 3).

**Step 3: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add backend/internal/models/policy.go
git commit -m "feat(model): update Policy struct with new fields"
```

---

### Task 3: Update Go Service

**Files:**
- Modify: `backend/internal/services/policy_service.go`

**Step 1: Replace `UpsertPolicyInput` struct and `calculateDeductible` method**

Find and replace the `UpsertPolicyInput` struct (lines ~27-37) with:

```go
type UpsertPolicyInput struct {
	CarrierName     string   `json:"carrier_name" binding:"required"`
	CarrierPhone    *string  `json:"carrier_phone"`
	CarrierEmail    *string  `json:"carrier_email"`
	PolicyNumber    *string  `json:"policy_number" binding:"required"`
	DeductibleValue float64  `json:"deductible_value" binding:"required,min=0"`
	Exclusions      *string  `json:"exclusions" binding:"required"`
	EffectiveDate   *models.Date `json:"effective_date" binding:"required"`
	ExpirationDate  *models.Date `json:"expiration_date" binding:"required"`
}
```

Delete the entire `calculateDeductible` method (lines ~39-48).

**Step 2: Replace the `UpsertPolicy` method body**

Find the `UpsertPolicy` function and replace its entire body with:

```go
func (s *PolicyService) UpsertPolicy(input UpsertPolicyInput, propertyID string, organizationID string) (*models.Policy, error) {
	_, err := s.propertyService.GetProperty(propertyID, organizationID)
	if err != nil {
		return nil, err
	}

	var existingID *string
	checkQuery := `SELECT id FROM insurance_policies WHERE property_id = $1`
	err = s.db.QueryRow(checkQuery, propertyID).Scan(&existingID)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to check existing policy: %w", err)
	}

	var policyID string
	if existingID != nil {
		policyID = *existingID
	} else {
		policyID = uuid.New().String()
	}

	now := time.Now()

	var effectiveDate, expirationDate *time.Time
	if input.EffectiveDate != nil {
		t := input.EffectiveDate.ToTime()
		effectiveDate = &t
	}
	if input.ExpirationDate != nil {
		t := input.ExpirationDate.ToTime()
		expirationDate = &t
	}

	query := `
		INSERT INTO insurance_policies (
			id, property_id, carrier_name, carrier_phone, carrier_email,
			policy_number, deductible_value, exclusions,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (property_id)
		DO UPDATE SET
			carrier_name = EXCLUDED.carrier_name,
			carrier_phone = EXCLUDED.carrier_phone,
			carrier_email = EXCLUDED.carrier_email,
			policy_number = EXCLUDED.policy_number,
			deductible_value = EXCLUDED.deductible_value,
			exclusions = EXCLUDED.exclusions,
			effective_date = EXCLUDED.effective_date,
			expiration_date = EXCLUDED.expiration_date,
			updated_at = EXCLUDED.updated_at
		RETURNING id, property_id, carrier_name, carrier_phone, carrier_email,
			policy_number, deductible_value, exclusions,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
	`

	var policy models.Policy
	err = s.db.QueryRow(
		query,
		policyID, propertyID,
		input.CarrierName, input.CarrierPhone, input.CarrierEmail,
		input.PolicyNumber, input.DeductibleValue, input.Exclusions,
		nil, // policy_pdf_url preserved separately
		effectiveDate, expirationDate,
		now, now,
	).Scan(
		&policy.ID, &policy.PropertyID,
		&policy.CarrierName, &policy.CarrierPhone, &policy.CarrierEmail,
		&policy.PolicyNumber, &policy.DeductibleValue, &policy.Exclusions,
		&policy.PolicyPdfUrl,
		&policy.EffectiveDate, &policy.ExpirationDate,
		&policy.CreatedAt, &policy.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert policy: %w", err)
	}

	updatePropertyQuery := `
		UPDATE properties SET status = 'active_monitored', updated_at = $1
		WHERE id = $2 AND status = 'draft'
	`
	_, err = s.db.Exec(updatePropertyQuery, time.Now(), propertyID)
	if err != nil {
		fmt.Printf("Warning: failed to update property status: %v\n", err)
	}

	return &policy, nil
}
```

**Step 3: Replace the `GetPolicy` method body**

Find and replace the SELECT query and Scan call in `GetPolicy`:

```go
	query := `
		SELECT id, property_id, carrier_name, carrier_phone, carrier_email,
			policy_number, deductible_value, exclusions,
			policy_pdf_url, effective_date, expiration_date,
			created_at, updated_at
		FROM insurance_policies
		WHERE property_id = $1
	`

	var policy models.Policy
	err = s.db.QueryRow(query, propertyID).Scan(
		&policy.ID, &policy.PropertyID,
		&policy.CarrierName, &policy.CarrierPhone, &policy.CarrierEmail,
		&policy.PolicyNumber, &policy.DeductibleValue, &policy.Exclusions,
		&policy.PolicyPdfUrl,
		&policy.EffectiveDate, &policy.ExpirationDate,
		&policy.CreatedAt, &policy.UpdatedAt,
	)
```

**Step 4: Build to verify clean**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/backend" && go build ./... 2>&1
```

Expected: no errors

**Step 5: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add backend/internal/services/policy_service.go
git commit -m "feat(service): update policy upsert/get for new field schema"
```

---

### Task 4: Update PolicyCard Frontend

**Files:**
- Modify: `frontend/src/components/PolicyCard.tsx`

**Context:** `PolicyCard.tsx` uses a large CSS-in-JS string (`policyCardStyles`) at the bottom. Inline styles are acceptable. The component has two modes: display and edit.

**Step 1: Update `formData` state and reset logic**

Find the `useState` for `formData` and replace with:

```typescript
const [formData, setFormData] = useState({
  carrier_name: policy?.carrier_name || '',
  carrier_phone: policy?.carrier_phone || '',
  carrier_email: policy?.carrier_email || '',
  policy_number: policy?.policy_number || '',
  deductible_value: policy?.deductible_value?.toString() || '',
  exclusions: policy?.exclusions || '',
  effective_date: policy?.effective_date || '',
  expiration_date: policy?.expiration_date || '',
})
```

Also update the `useEffect` that resets formData on policy change to match the same fields:

```typescript
useEffect(() => {
  if (policy) {
    setFormData({
      carrier_name: policy.carrier_name || '',
      carrier_phone: policy.carrier_phone || '',
      carrier_email: policy.carrier_email || '',
      policy_number: policy.policy_number || '',
      deductible_value: policy.deductible_value?.toString() || '',
      exclusions: policy.exclusions || '',
      effective_date: policy.effective_date || '',
      expiration_date: policy.expiration_date || '',
    })
  }
}, [policy])
```

**Step 2: Remove the `calculatedDeductible` state and its `useEffect`**

Delete:
```typescript
const [calculatedDeductible, setCalculatedDeductible] = useState<number | null>(null)
```
And delete the `useEffect` that calculates it (the one referencing `coverage_a_limit`, `deductible_value`, `deductible_type`).

**Step 3: Update the mutation payload**

In the `mutation.mutationFn`, replace the payload object with:

```typescript
const payload = {
  carrier_name: data.carrier_name,
  carrier_phone: data.carrier_phone || undefined,
  carrier_email: data.carrier_email || undefined,
  policy_number: data.policy_number || undefined,
  deductible_value: data.deductible_value ? parseFloat(data.deductible_value) : undefined,
  exclusions: data.exclusions || undefined,
  effective_date: data.effective_date || undefined,
  expiration_date: data.expiration_date || undefined,
}
```

**Step 4: Replace the display mode `policy-grid` section**

Find the `<div className="policy-grid">` block in display mode and replace its contents with:

```tsx
<div className="policy-grid">
  <div className="policy-section">
    <label className="policy-label">Carrier</label>
    <p className="policy-value-large">{policy.carrier_name}</p>
    {policy.carrier_phone && (
      <p className="policy-value" style={{ fontSize: '14px', marginTop: '4px' }}>📞 {policy.carrier_phone}</p>
    )}
    {policy.carrier_email && (
      <p className="policy-value" style={{ fontSize: '14px', marginTop: '2px' }}>✉️ {policy.carrier_email}</p>
    )}
  </div>

  {policy.policy_number && (
    <div className="policy-section">
      <label className="policy-label">Policy Number</label>
      <p className="policy-value-mono">{policy.policy_number}</p>
    </div>
  )}

  <div className="policy-section">
    <label className="policy-label">Start Date</label>
    <p className="policy-value">{formatDate(policy.effective_date?.toString())}</p>
  </div>

  <div className="policy-section">
    <label className="policy-label">End Date</label>
    <p className="policy-value">{formatDate(policy.expiration_date?.toString())}</p>
  </div>

  {policy.deductible_value !== undefined && (
    <div className="policy-section-full">
      <label className="policy-label">Deductible</label>
      <div className="deductible-display">
        <span className="deductible-primary">{formatCurrency(policy.deductible_value)}</span>
      </div>
    </div>
  )}

  {policy.exclusions && (
    <div className="policy-section-full">
      <label className="policy-label">Exclusions</label>
      <div style={{
        background: 'white',
        border: '1px solid var(--color-sand-200)',
        borderRadius: '12px',
        padding: '16px 20px',
        maxHeight: '200px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        fontSize: '14px',
        color: 'var(--color-sand-800)',
        lineHeight: '1.6',
      }}>
        {policy.exclusions}
      </div>
    </div>
  )}
</div>
```

**Step 5: Replace the edit form `policy-form-grid` section**

Find `<div className="policy-form-grid">` and replace its contents with:

```tsx
<div className="policy-form-grid">
  <div className="form-group">
    <label htmlFor="carrier_name" className="form-label">
      Insurance Carrier <span className="required">*</span>
    </label>
    <input type="text" id="carrier_name" name="carrier_name" required
      value={formData.carrier_name} onChange={handleChange}
      className="form-input" placeholder="e.g., State Farm, Travelers" />
  </div>

  <div className="form-group">
    <label htmlFor="policy_number" className="form-label">
      Policy Number <span className="required">*</span>
    </label>
    <input type="text" id="policy_number" name="policy_number" required
      value={formData.policy_number} onChange={handleChange}
      className="form-input" placeholder="Enter policy number" />
  </div>

  <div className="form-group">
    <label htmlFor="carrier_phone" className="form-label">Carrier Phone</label>
    <input type="tel" id="carrier_phone" name="carrier_phone"
      value={formData.carrier_phone} onChange={handleChange}
      className="form-input" placeholder="e.g., 555-123-4567" />
  </div>

  <div className="form-group">
    <label htmlFor="carrier_email" className="form-label">Carrier Email</label>
    <input type="email" id="carrier_email" name="carrier_email"
      value={formData.carrier_email} onChange={handleChange}
      className="form-input" placeholder="e.g., claims@carrier.com" />
  </div>

  <div className="form-group">
    <label htmlFor="effective_date" className="form-label">
      Policy Start Date <span className="required">*</span>
    </label>
    <input type="date" id="effective_date" name="effective_date" required
      value={formData.effective_date} onChange={handleChange}
      className="form-input" />
  </div>

  <div className="form-group">
    <label htmlFor="expiration_date" className="form-label">
      Policy End Date <span className="required">*</span>
    </label>
    <input type="date" id="expiration_date" name="expiration_date" required
      value={formData.expiration_date} onChange={handleChange}
      className="form-input" />
  </div>

  <div className="form-group">
    <label htmlFor="deductible_value" className="form-label">
      Deductible <span className="required">*</span>
    </label>
    <div className="form-input-group">
      <span className="input-prefix">$</span>
      <input type="number" id="deductible_value" name="deductible_value" required
        value={formData.deductible_value} onChange={handleChange}
        className="form-input with-prefix" placeholder="10000" min="0" />
    </div>
  </div>

  <div className="form-group-full">
    <label htmlFor="exclusions" className="form-label">
      Exclusions <span className="required">*</span>
    </label>
    <textarea id="exclusions" name="exclusions" required
      value={formData.exclusions}
      onChange={(e) => setFormData(prev => ({ ...prev, exclusions: e.target.value }))}
      className="form-input"
      placeholder="Enter policy exclusions..."
      rows={6}
      style={{ resize: 'vertical', fontFamily: 'inherit' }}
    />
  </div>
</div>
```

**Step 6: Update the handleCancel reset to match new fields**

Find `handleCancel` and update the setFormData call:

```typescript
const handleCancel = () => {
  if (policy) {
    setFormData({
      carrier_name: policy.carrier_name || '',
      carrier_phone: policy.carrier_phone || '',
      carrier_email: policy.carrier_email || '',
      policy_number: policy.policy_number || '',
      deductible_value: policy.deductible_value?.toString() || '',
      exclusions: policy.exclusions || '',
      effective_date: policy.effective_date || '',
      expiration_date: policy.expiration_date || '',
    })
  }
  setIsEditing(false)
}
```

**Step 7: Update the Policy type in `frontend/src/types/claim.ts`**

Find the `Policy` interface and replace its fields to match the new model:

```typescript
export interface Policy {
  id: string
  property_id: string
  carrier_name: string
  carrier_phone?: string | null
  carrier_email?: string | null
  policy_number?: string | null
  deductible_value: number
  exclusions?: string | null
  policy_pdf_url?: string | null
  effective_date?: string | null
  expiration_date?: string | null
  created_at: string
  updated_at: string
}
```

**Step 8: TypeScript check**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code/frontend" && npx tsc --noEmit 2>&1 | grep -v "Layout.tsx"
```

Expected: no errors

**Step 9: Commit**

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code"
git add frontend/src/components/PolicyCard.tsx frontend/src/types/claim.ts
git commit -m "feat(ui): update PolicyCard with new fields and remove coverage limits"
```

---

### Task 5: Push to GitHub

```bash
cd "/Users/benjaminlopez/Documents/ClaimCoachAI Code" && git push
```
