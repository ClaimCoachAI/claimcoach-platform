# Phase 5: Deductible Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deductible comparison gate that compares contractor estimate vs policy deductible to help property managers decide if a claim is worth filing.

**Architecture:** Add `contractor_estimate_total` field to claims table, create PATCH endpoint for updating estimate, calculate comparison (estimate vs deductible), display results in ClaimDetail UI with green "worth filing" or red "not worth filing" recommendation.

**Tech Stack:** Go (backend), React + TypeScript (frontend), PostgreSQL (database), React Query (state management)

---

## Task 5.1: Database Migration

**Files:**
- Create: `backend/migrations/000004_add_contractor_estimate.up.sql`
- Create: `backend/migrations/000004_add_contractor_estimate.down.sql`

**Step 1: Write up migration**

Create `backend/migrations/000004_add_contractor_estimate.up.sql`:

```sql
ALTER TABLE claims
ADD COLUMN contractor_estimate_total DECIMAL(10,2);
```

**Step 2: Write down migration**

Create `backend/migrations/000004_add_contractor_estimate.down.sql`:

```sql
ALTER TABLE claims
DROP COLUMN contractor_estimate_total;
```

**Step 3: Update Claim model**

Modify: `backend/internal/models/claim.go`

Add field after `UpdatedAt`:

```go
ContractorEstimateTotal *float64 `json:"contractor_estimate_total" db:"contractor_estimate_total"`
```

**Step 4: Test migration manually**

Run:
```bash
cd backend
go run cmd/server/main.go
```

Expected: Server starts, migration runs successfully, no errors

Check database:
```bash
psql $DATABASE_URL -c "\d claims"
```

Expected: See `contractor_estimate_total` column (DECIMAL(10,2), nullable)

**Step 5: Commit**

```bash
git add backend/migrations/000004_add_contractor_estimate.up.sql \
        backend/migrations/000004_add_contractor_estimate.down.sql \
        backend/internal/models/claim.go
git commit -m "feat: add contractor_estimate_total to claims table

- Add migration for new field
- Update Claim model
- Field is nullable, stores contractor estimate for deductible comparison

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5.2: Backend Service - UpdateEstimate

**Files:**
- Modify: `backend/internal/services/claim_service.go`
- Create: `backend/internal/services/claim_service_test.go` (if doesn't exist)

**Step 1: Write failing test**

In `backend/internal/services/claim_service_test.go`:

```go
func TestUpdateEstimate_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil, nil)

	// Create test org, user, property, policy, claim
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0) // $10k deductible
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Test
	estimate := 15000.0
	claim, comparison, err := service.UpdateEstimate(claimID, estimate, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, claim)
	assert.NotNil(t, comparison)
	assert.Equal(t, estimate, *claim.ContractorEstimateTotal)
	assert.Equal(t, 10000.0, comparison.Deductible)
	assert.Equal(t, 15000.0, comparison.Estimate)
	assert.Equal(t, 5000.0, comparison.Delta)
	assert.Equal(t, "worth_filing", comparison.Recommendation)
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd backend
go test ./internal/services/... -v -run TestUpdateEstimate_Success
```

Expected: FAIL with "undefined: service.UpdateEstimate"

**Step 3: Add ComparisonResult struct**

In `backend/internal/services/claim_service.go`, add after imports:

```go
type ComparisonResult struct {
	Deductible     float64 `json:"deductible"`
	Estimate       float64 `json:"estimate"`
	Delta          float64 `json:"delta"`
	Recommendation string  `json:"recommendation"`
}
```

**Step 4: Implement UpdateEstimate method**

In `backend/internal/services/claim_service.go`, add method:

```go
func (s *ClaimService) UpdateEstimate(
	claimID string,
	estimateTotal float64,
	userID string,
	orgID string,
) (*Claim, *ComparisonResult, error) {
	// Validate estimate
	if estimateTotal <= 0 {
		return nil, nil, fmt.Errorf("estimate must be greater than 0")
	}

	// Fetch claim with policy
	query := `
		SELECT c.*, p.deductible_calculated
		FROM claims c
		JOIN policies p ON p.id = c.policy_id
		WHERE c.id = $1
	`

	var claim Claim
	var deductible float64
	err := s.db.QueryRow(query, claimID).Scan(
		&claim.ID,
		&claim.PropertyID,
		&claim.PolicyID,
		&claim.ClaimNumber,
		&claim.LossType,
		&claim.IncidentDate,
		&claim.Status,
		&claim.FiledAt,
		&claim.AssignedUserID,
		&claim.AdjusterName,
		&claim.AdjusterPhone,
		&claim.MeetingDatetime,
		&claim.CreatedByUserID,
		&claim.CreatedAt,
		&claim.UpdatedAt,
		&claim.ContractorEstimateTotal,
		&deductible,
	)
	if err == sql.ErrNoRows {
		return nil, nil, fmt.Errorf("claim not found")
	}
	if err != nil {
		return nil, nil, err
	}

	// Check ownership
	propertyOrgID, err := s.getPropertyOrganizationID(claim.PropertyID)
	if err != nil {
		return nil, nil, err
	}
	if propertyOrgID != orgID {
		return nil, nil, fmt.Errorf("unauthorized")
	}

	// Update estimate
	updateQuery := `
		UPDATE claims
		SET contractor_estimate_total = $1, updated_at = NOW()
		WHERE id = $2
		RETURNING contractor_estimate_total, updated_at
	`
	err = s.db.QueryRow(updateQuery, estimateTotal, claimID).Scan(
		&claim.ContractorEstimateTotal,
		&claim.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}

	// Calculate comparison
	delta := estimateTotal - deductible
	recommendation := "not_worth_filing"
	if delta > 0 {
		recommendation = "worth_filing"
	}

	comparison := &ComparisonResult{
		Deductible:     deductible,
		Estimate:       estimateTotal,
		Delta:          delta,
		Recommendation: recommendation,
	}

	// Log activity
	err = s.logActivity(claimID, &userID, "estimate_entered",
		fmt.Sprintf("Contractor estimate entered: $%.2f", estimateTotal),
		map[string]interface{}{
			"estimate_total":  estimateTotal,
			"deductible":      deductible,
			"delta":           delta,
			"recommendation":  recommendation,
		},
	)
	if err != nil {
		log.Printf("Warning: Failed to log activity: %v", err)
	}

	return &claim, comparison, nil
}

// Helper method to get property organization ID
func (s *ClaimService) getPropertyOrganizationID(propertyID string) (string, error) {
	var orgID string
	err := s.db.QueryRow(
		"SELECT organization_id FROM properties WHERE id = $1",
		propertyID,
	).Scan(&orgID)
	return orgID, err
}
```

**Step 5: Run test to verify it passes**

Run:
```bash
cd backend
go test ./internal/services/... -v -run TestUpdateEstimate_Success
```

Expected: PASS

**Step 6: Add test for not worth filing**

Add test in `backend/internal/services/claim_service_test.go`:

```go
func TestUpdateEstimate_NotWorthFiling(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil, nil)

	// Create test data with $10k deductible
	orgID := createTestOrg(t, db)
	userID := createTestUser(t, db, orgID)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Test with estimate below deductible
	estimate := 8000.0
	claim, comparison, err := service.UpdateEstimate(claimID, estimate, userID, orgID)

	// Assert
	assert.NoError(t, err)
	assert.Equal(t, estimate, *claim.ContractorEstimateTotal)
	assert.Equal(t, 10000.0, comparison.Deductible)
	assert.Equal(t, 8000.0, comparison.Estimate)
	assert.Equal(t, -2000.0, comparison.Delta)
	assert.Equal(t, "not_worth_filing", comparison.Recommendation)
}
```

**Step 7: Run tests**

Run:
```bash
cd backend
go test ./internal/services/... -v -run TestUpdateEstimate
```

Expected: Both tests PASS

**Step 8: Add test for unauthorized access**

Add test:

```go
func TestUpdateEstimate_UnauthorizedOrg(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	service := NewClaimService(db, nil, nil)

	// Create claim for org1
	org1ID := createTestOrg(t, db)
	user1ID := createTestUser(t, db, org1ID)
	propertyID := createTestProperty(t, db, org1ID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, org1ID, user1ID)

	// Try to update from org2
	org2ID := createTestOrg(t, db)
	user2ID := createTestUser(t, db, org2ID)

	// Test
	_, _, err := service.UpdateEstimate(claimID, 15000.0, user2ID, org2ID)

	// Assert
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unauthorized")
}
```

**Step 9: Run all tests**

Run:
```bash
cd backend
go test ./internal/services/... -v
```

Expected: All tests PASS

**Step 10: Commit**

```bash
git add backend/internal/services/claim_service.go \
        backend/internal/services/claim_service_test.go
git commit -m "feat: add UpdateEstimate service method with tests

- Calculate deductible comparison (estimate vs deductible)
- Return ComparisonResult with recommendation
- Log activity when estimate is entered
- Test coverage: success, not worth filing, unauthorized

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5.3: Backend Handler - PATCH /api/claims/:id/estimate

**Files:**
- Modify: `backend/internal/handlers/claim_handler.go`
- Modify: `backend/internal/api/router.go`

**Step 1: Write failing handler test**

In `backend/internal/handlers/claim_handler_test.go`:

```go
func TestPatchClaimEstimate_Success(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	handler := NewClaimHandler(NewClaimService(db, nil, nil))
	router := setupTestRouter(handler)

	// Create test data
	orgID, userID, token := createAuthenticatedUser(t, db)
	propertyID := createTestProperty(t, db, orgID)
	policyID := createTestPolicy(t, db, propertyID, 10000.0)
	claimID := createTestClaim(t, db, propertyID, policyID, orgID, userID)

	// Request
	body := `{"contractor_estimate_total": 15000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/"+claimID+"/estimate", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	assert.Contains(t, response, "claim")
	assert.Contains(t, response, "comparison")

	comparison := response["comparison"].(map[string]interface{})
	assert.Equal(t, 10000.0, comparison["deductible"])
	assert.Equal(t, 15000.0, comparison["estimate"])
	assert.Equal(t, 5000.0, comparison["delta"])
	assert.Equal(t, "worth_filing", comparison["recommendation"])
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd backend
go test ./internal/handlers/... -v -run TestPatchClaimEstimate_Success
```

Expected: FAIL (route not registered or handler doesn't exist)

**Step 3: Add handler method**

In `backend/internal/handlers/claim_handler.go`:

```go
type UpdateEstimateRequest struct {
	ContractorEstimateTotal float64 `json:"contractor_estimate_total" binding:"required,gt=0"`
}

func (h *ClaimHandler) PatchClaimEstimate(c *gin.Context) {
	// Get claim ID
	claimID := c.Param("id")

	// Get authenticated user
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userModel := user.(*models.User)

	// Parse request
	var req UpdateEstimateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update estimate
	claim, comparison, err := h.claimService.UpdateEstimate(
		claimID,
		req.ContractorEstimateTotal,
		userModel.ID,
		userModel.OrganizationID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, gin.H{"error": "Claim not found"})
			return
		}
		if strings.Contains(err.Error(), "unauthorized") {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"claim":      claim,
		"comparison": comparison,
	})
}
```

**Step 4: Register route**

In `backend/internal/api/router.go`, add route in authenticated group:

```go
// In the authenticated routes section, add:
claims.PATCH("/:id/estimate", claimHandler.PatchClaimEstimate)
```

**Step 5: Run test to verify it passes**

Run:
```bash
cd backend
go test ./internal/handlers/... -v -run TestPatchClaimEstimate_Success
```

Expected: PASS

**Step 6: Add test for unauthorized**

Add test:

```go
func TestPatchClaimEstimate_Unauthorized(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	handler := NewClaimHandler(NewClaimService(db, nil, nil))
	router := setupTestRouter(handler)

	// Request without token
	body := `{"contractor_estimate_total": 15000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/some-id/estimate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
```

**Step 7: Add test for invalid input**

Add test:

```go
func TestPatchClaimEstimate_InvalidInput(t *testing.T) {
	// Setup
	db := setupTestDB(t)
	defer db.Close()

	handler := NewClaimHandler(NewClaimService(db, nil, nil))
	router := setupTestRouter(handler)

	_, _, token := createAuthenticatedUser(t, db)

	// Request with negative estimate
	body := `{"contractor_estimate_total": -1000.00}`
	req := httptest.NewRequest("PATCH", "/api/claims/some-id/estimate", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
```

**Step 8: Run all handler tests**

Run:
```bash
cd backend
go test ./internal/handlers/... -v
```

Expected: All tests PASS

**Step 9: Test manually with curl**

Start server:
```bash
cd backend
go run cmd/server/main.go
```

In another terminal:
```bash
# Get auth token (replace with actual login)
TOKEN="your-jwt-token"
CLAIM_ID="your-claim-id"

# Update estimate
curl -X PATCH http://localhost:8080/api/claims/$CLAIM_ID/estimate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contractor_estimate_total": 15000.00}'
```

Expected: 200 OK with claim and comparison in response

**Step 10: Commit**

```bash
git add backend/internal/handlers/claim_handler.go \
        backend/internal/handlers/claim_handler_test.go \
        backend/internal/api/router.go
git commit -m "feat: add PATCH /api/claims/:id/estimate endpoint

- Handler validates input and authorization
- Returns claim with comparison result
- Test coverage: success, unauthorized, invalid input

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5.4: Frontend UI - Deductible Analysis Component

**Files:**
- Modify: `frontend/src/pages/ClaimDetail.tsx`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add API method**

In `frontend/src/lib/api.ts`, add method:

```typescript
// Deductible comparison
export const updateClaimEstimate = async (claimId: string, estimateTotal: number) => {
  return api.patch(`/api/claims/${claimId}/estimate`, {
    contractor_estimate_total: estimateTotal
  })
}
```

**Step 2: Add ComparisonResult type**

In `frontend/src/types/` (or at top of ClaimDetail.tsx):

```typescript
interface ComparisonResult {
  deductible: number
  estimate: number
  delta: number
  recommendation: 'worth_filing' | 'not_worth_filing'
}
```

**Step 3: Add DeductibleAnalysis component**

In `frontend/src/pages/ClaimDetail.tsx`, add component before the main ClaimDetail component:

```typescript
interface DeductibleAnalysisProps {
  claim: Claim
  policy: Policy
  onEstimateUpdated: () => void
}

function DeductibleAnalysis({ claim, policy, onEstimateUpdated }: DeductibleAnalysisProps) {
  const [estimateInput, setEstimateInput] = useState('')
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)

  const updateEstimateMutation = useMutation({
    mutationFn: (estimateTotal: number) =>
      updateClaimEstimate(claim.id, estimateTotal),
    onSuccess: (response) => {
      setComparison(response.data.comparison)
      onEstimateUpdated()
      // Clear input on success
      setEstimateInput('')
    }
  })

  const handleCalculate = () => {
    const amount = parseFloat(estimateInput)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    updateEstimateMutation.mutate(amount)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  // Load existing estimate if it exists
  useEffect(() => {
    if (claim.contractor_estimate_total && policy) {
      const delta = claim.contractor_estimate_total - policy.deductible_calculated
      setComparison({
        deductible: policy.deductible_calculated,
        estimate: claim.contractor_estimate_total,
        delta,
        recommendation: delta > 0 ? 'worth_filing' : 'not_worth_filing'
      })
    }
  }, [claim.contractor_estimate_total, policy])

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">📊 Deductible Analysis</h2>

      <div className="space-y-4">
        {/* Deductible display */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Policy Deductible
          </label>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(policy.deductible_calculated)}
          </div>
        </div>

        {/* Estimate input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Contractor Estimate Total
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={estimateInput}
              onChange={(e) => setEstimateInput(e.target.value)}
              placeholder="0.00"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              disabled={updateEstimateMutation.isPending}
            />
            <button
              onClick={handleCalculate}
              disabled={updateEstimateMutation.isPending || !estimateInput}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {updateEstimateMutation.isPending ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>

        {/* Comparison result */}
        {comparison && (
          <div className={`mt-4 p-4 rounded-lg border-2 ${
            comparison.recommendation === 'worth_filing'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className="text-2xl">
                {comparison.recommendation === 'worth_filing' ? '✅' : '⚠️'}
              </div>
              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-2 ${
                  comparison.recommendation === 'worth_filing'
                    ? 'text-green-800'
                    : 'text-red-800'
                }`}>
                  {comparison.recommendation === 'worth_filing'
                    ? 'WORTH FILING'
                    : 'NOT WORTH FILING'}
                </h3>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Contractor Estimate:</span>
                    <span className="font-medium">{formatCurrency(comparison.estimate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Policy Deductible:</span>
                    <span className="font-medium">{formatCurrency(comparison.deductible)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-gray-600">
                      {comparison.recommendation === 'worth_filing'
                        ? 'Expected Payout:'
                        : 'Amount Below Deductible:'}
                    </span>
                    <span className={`font-bold ${
                      comparison.recommendation === 'worth_filing'
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}>
                      {formatCurrency(Math.abs(comparison.delta))}
                    </span>
                  </div>
                </div>

                <p className={`mt-3 text-sm ${
                  comparison.recommendation === 'worth_filing'
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}>
                  {comparison.recommendation === 'worth_filing'
                    ? 'The estimate exceeds your deductible. Proceeding with this claim should result in a payout.'
                    : 'The estimate is below your deductible. Filing this claim would result in $0 payout.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {updateEstimateMutation.isError && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              Failed to update estimate. Please try again.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 4: Add to ClaimDetail page**

In `ClaimDetail` component, add DeductibleAnalysis section after documents section and before activity timeline:

```typescript
// In the main ClaimDetail component, after documents section:

{/* Deductible Analysis - only show in draft/assessing status */}
{claim && policy && ['draft', 'assessing'].includes(claim.status) && (
  <DeductibleAnalysis
    claim={claim}
    policy={policy}
    onEstimateUpdated={() => {
      queryClient.invalidateQueries(['claim', claimId])
      queryClient.invalidateQueries(['activities', claimId])
    }}
  />
)}
```

**Step 5: Add contractor_estimate_total to Claim type**

In `frontend/src/types/` or wherever Claim type is defined:

```typescript
interface Claim {
  // ... existing fields
  contractor_estimate_total?: number
}
```

**Step 6: Test in browser**

Run:
```bash
cd frontend
npm run dev
```

1. Navigate to a claim in `draft` status
2. Verify deductible analysis section appears
3. Enter estimate below deductible
4. Click "Calculate"
5. Verify red "NOT WORTH FILING" banner appears
6. Update estimate above deductible
7. Click "Calculate"
8. Verify green "WORTH FILING" banner appears

**Step 7: Commit**

```bash
git add frontend/src/pages/ClaimDetail.tsx \
        frontend/src/lib/api.ts \
        frontend/src/types/
git commit -m "feat: add deductible analysis UI to claim workspace

- DeductibleAnalysis component with estimate input
- Real-time comparison calculation
- Green/red visual feedback for recommendations
- Only shows in draft/assessing status
- Currency formatting and error handling

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5.5: Integration Testing & Polish

**Files:**
- Test: Manual end-to-end testing
- Modify: Any files needing polish

**Step 1: Create test data**

Using the app:
1. Create property with policy (deductible: $10,000)
2. Create claim in `draft` status
3. Note claim ID

**Step 2: Test below deductible flow**

1. Navigate to claim detail
2. Enter estimate: $8,000
3. Click "Calculate"
4. Verify:
   - Red banner appears
   - Shows "NOT WORTH FILING"
   - Shows "Amount Below Deductible: $2,000"
   - Message explains $0 payout

**Step 3: Test above deductible flow**

1. Enter estimate: $15,000
2. Click "Calculate"
3. Verify:
   - Green banner appears
   - Shows "WORTH FILING"
   - Shows "Expected Payout: $5,000"
   - Message explains payout expected

**Step 4: Test exact deductible**

1. Enter estimate: $10,000
2. Click "Calculate"
3. Verify:
   - Red banner appears (delta = 0, treat as not worth filing)
   - Shows $0 delta

**Step 5: Test validation**

1. Enter negative number: -1000
2. Verify: Error message or disabled button
3. Enter zero: 0
4. Verify: Error message or disabled button
5. Enter valid: 5000.50
6. Verify: Accepts decimal values

**Step 6: Test activity log**

1. After entering estimate
2. Scroll to activity timeline
3. Verify: New activity "Contractor estimate entered: $X"
4. Check metadata includes comparison data

**Step 7: Test persistence**

1. Enter estimate and calculate
2. Refresh page
3. Verify: Comparison result still displays
4. Verify: Don't need to re-enter estimate

**Step 8: Test status visibility**

1. Verify section shows in `draft` status
2. Update claim to `filed` status
3. Verify: Section disappears
4. Update back to `assessing`
5. Verify: Section reappears with saved data

**Step 9: Test mobile responsive**

1. Open in mobile view (Chrome DevTools)
2. Verify: Layout works on small screens
3. Verify: Input and button are touch-friendly
4. Verify: Banner text is readable

**Step 10: Fix any bugs found**

If bugs found during testing:
- Fix issues
- Re-test
- Commit fixes

**Step 11: Final commit**

```bash
git add .
git commit -m "test: verify Phase 5 deductible comparison works end-to-end

- Tested below/above/equal deductible scenarios
- Verified activity logging
- Confirmed persistence after refresh
- Tested mobile responsive layout
- All edge cases handled correctly

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5.6: Documentation

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`
- Create: `backend/docs/phase5-testing.md`

**Step 1: Document API endpoint**

Add to `IMPLEMENTATION_SUMMARY.md` in API section:

```markdown
#### Deductible Comparison

**PATCH /api/claims/:id/estimate**
- Update contractor estimate and get comparison
- Auth: Required
- Request: `{ "contractor_estimate_total": 15000.00 }`
- Response: `{ "claim": {...}, "comparison": {...} }`
```

**Step 2: Document Phase 5**

Add new section to `IMPLEMENTATION_SUMMARY.md`:

```markdown
## Phase 5: Deductible Comparison

**Goal:** Smart gate to help decide if claim is worth filing

### Features
- Contractor estimate entry in claim workspace
- Automatic comparison: estimate vs deductible
- Visual recommendation (green/red)
- Shows expected payout or loss amount
- Activity logging
- Persistence across sessions

### Database Changes
- Added `contractor_estimate_total` to claims table

### API Endpoints
- PATCH /api/claims/:id/estimate

### UI Components
- DeductibleAnalysis component in ClaimDetail
- Shows in draft/assessing status only
- Currency formatting
- Real-time calculation
```

**Step 3: Create testing guide**

Create `backend/docs/phase5-testing.md`:

```markdown
# Phase 5: Deductible Comparison - Testing Guide

## Manual Test Cases

### Test 1: Worth Filing (Estimate > Deductible)
1. Create claim with $10k deductible
2. Enter estimate: $15,000
3. Expected: Green "WORTH FILING" with $5,000 payout

### Test 2: Not Worth Filing (Estimate < Deductible)
1. Same claim
2. Enter estimate: $8,000
3. Expected: Red "NOT WORTH FILING" with $2,000 below

### Test 3: Equal to Deductible
1. Enter estimate: $10,000
2. Expected: Red "NOT WORTH FILING" with $0 delta

### Test 4: Invalid Input
1. Enter: -1000
2. Expected: Validation error
3. Enter: 0
4. Expected: Validation error

### Test 5: Persistence
1. Enter estimate and calculate
2. Refresh page
3. Expected: Result still shows

### Test 6: Activity Logging
1. Enter estimate
2. Check activity timeline
3. Expected: "Contractor estimate entered" activity

## API Testing

```bash
# Get auth token
TOKEN="your-jwt-token"
CLAIM_ID="your-claim-id"

# Test worth filing
curl -X PATCH http://localhost:8080/api/claims/$CLAIM_ID/estimate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contractor_estimate_total": 15000.00}'

# Expected response:
{
  "claim": { "contractor_estimate_total": 15000.00, ... },
  "comparison": {
    "deductible": 10000.00,
    "estimate": 15000.00,
    "delta": 5000.00,
    "recommendation": "worth_filing"
  }
}
```
```

**Step 4: Update QUICK_START.md**

Add Phase 5 to the feature list in `QUICK_START.md`:

```markdown
## Features Available
- ✅ Authentication & Multi-tenancy
- ✅ Property & Policy Management
- ✅ Claims Workflow
- ✅ Document Upload (Supabase Storage)
- ✅ Magic Link for Contractors
- ✅ **Deductible Comparison** (NEW - Phase 5)
```

**Step 5: Commit documentation**

```bash
git add IMPLEMENTATION_SUMMARY.md \
        QUICK_START.md \
        backend/docs/phase5-testing.md
git commit -m "docs: add Phase 5 deductible comparison documentation

- Updated implementation summary
- Added testing guide
- Updated quick start guide

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Completion Criteria

**Phase 5 is complete when:**

- ✅ Migration adds contractor_estimate_total field
- ✅ UpdateEstimate service method works with tests
- ✅ PATCH /api/claims/:id/estimate endpoint works
- ✅ DeductibleAnalysis UI component displays correctly
- ✅ Green "worth filing" shows when estimate > deductible
- ✅ Red "not worth filing" shows when estimate ≤ deductible
- ✅ Activity logging works
- ✅ All backend tests pass
- ✅ Manual testing complete (all scenarios)
- ✅ Documentation updated
- ✅ Mobile responsive
- ✅ No console errors

**Total commits:** 6-7 commits

**Estimated time:** 4-6 hours

---

## Next Steps After Completion

After Phase 5 is complete and tested:

1. **Deploy to staging** - Test in production-like environment
2. **User acceptance testing** - Get feedback from property managers
3. **Phase 6: AI Audit System** - The big feature (LLM integration)
4. **Or deploy Phase 0-5 to production** - Start using the MVP

Phase 5 is the last "quick win" before tackling Phase 6's complexity. It adds immediate value without much risk.
