# Draft Save Endpoint Implementation Summary

## Overview
Implemented backend draft persistence for the scope sheet wizard, enabling contractors to save their progress and resume later via magic link authentication.

## Changes Made

### 1. Database Migration
**Files:**
- `backend/migrations/000009_add_scope_sheet_draft_fields.up.sql`
- `backend/migrations/000009_add_scope_sheet_draft_fields.down.sql`

**Schema Changes:**
```sql
ALTER TABLE scope_sheets
ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN draft_step INTEGER CHECK (draft_step >= 1 AND draft_step <= 10),
ADD COLUMN draft_saved_at TIMESTAMP;
```

**Index Added:**
- Partial index on `(claim_id, is_draft)` where `is_draft = true` for efficient draft lookups

### 2. Model Updates
**File:** `backend/internal/models/scope_sheet.go`

**Fields Added:**
```go
IsDraft      bool       `json:"is_draft" db:"is_draft"`
DraftStep    *int       `json:"draft_step,omitempty" db:"draft_step"`
DraftSavedAt *time.Time `json:"draft_saved_at,omitempty" db:"draft_saved_at"`
```

### 3. Service Layer
**File:** `backend/internal/services/scope_sheet_service.go`

**Methods Implemented:**
1. `SaveScopeDraft(ctx context.Context, token string, draft *CreateScopeSheetInput) (*models.ScopeSheet, error)`
   - Validates magic link token
   - Performs UPSERT operation (updates existing draft or creates new one)
   - Only one draft per claim allowed
   - Sets `is_draft=true` and `draft_saved_at=NOW()`

2. `GetScopeDraft(ctx context.Context, token string) (*models.ScopeSheet, error)`
   - Validates magic link token
   - Retrieves draft for the token's claim
   - Returns error if no draft exists (404)

**Input Structure Updated:**
- Added `DraftStep *int` field to `CreateScopeSheetInput` struct

### 4. Handler Layer
**File:** `backend/internal/handlers/scope_sheet_handler.go`

**Handlers Implemented:**
1. `SaveDraft(c *gin.Context)` - POST handler
   - Public endpoint (no auth required, uses magic link)
   - Returns 201 Created on success
   - Returns 401 for invalid/expired token
   - Returns 500 for server errors

2. `GetDraft(c *gin.Context)` - GET handler
   - Public endpoint (no auth required, uses magic link)
   - Returns 200 OK with draft data
   - Returns 404 if no draft exists
   - Returns 401 for invalid/expired token

### 5. Router Configuration
**File:** `backend/internal/api/router.go`

**Routes Added:**
```go
r.POST("/api/magic-links/:token/scope-sheet/draft", scopeSheetHandler.SaveDraft)
r.GET("/api/magic-links/:token/scope-sheet/draft", scopeSheetHandler.GetDraft)
```

### 6. Tests
**File:** `backend/internal/services/scope_sheet_service_test.go`

**Test Cases Added:**
1. `TestSaveScopeDraft_CreateNew` - Verifies draft creation
2. `TestSaveScopeDraft_UpdateExisting` - Verifies UPSERT behavior
3. `TestSaveScopeDraft_InvalidToken` - Verifies error handling
4. `TestGetScopeDraft_Success` - Verifies draft retrieval
5. `TestGetScopeDraft_NotFound` - Verifies 404 handling
6. `TestGetScopeDraft_InvalidToken` - Verifies token validation

**Helper Function:**
- `createTestMagicLink(t *testing.T, db *sql.DB, claimID string) string` - Creates test magic link

### 7. Integration Test Script
**File:** `backend/test_draft_endpoints.sh`

**Test Coverage:**
- Create draft (POST)
- Retrieve draft (GET)
- Update draft (UPSERT)
- Verify update
- Invalid token handling

## API Endpoints

### Save Draft
```
POST /api/magic-links/:token/scope-sheet/draft
Content-Type: application/json

{
  "roof_type": "asphalt_shingles",
  "roof_square_footage": 2000,
  "draft_step": 1,
  ... (any other scope sheet fields)
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": "...",
    "claim_id": "...",
    "is_draft": true,
    "draft_step": 1,
    "draft_saved_at": "2026-02-11T...",
    ... (all scope sheet fields)
  }
}
```

### Get Draft
```
GET /api/magic-links/:token/scope-sheet/draft

Response: 200 OK
{
  "success": true,
  "data": {
    "id": "...",
    "claim_id": "...",
    "is_draft": true,
    "draft_step": 1,
    "draft_saved_at": "2026-02-11T...",
    ... (all scope sheet fields)
  }
}

Response: 404 Not Found (no draft exists)
{
  "success": false,
  "error": "No draft exists for this claim"
}
```

## Design Decisions

### 1. One Draft Per Claim
- Used `claim_id + is_draft=true` to ensure only one draft exists per claim
- UPSERT operation updates existing draft instead of creating duplicates
- Simplifies frontend logic (no need to manage multiple drafts)

### 2. Partial Validation
- Drafts accept partial data (all fields optional except those required for UPSERT)
- Allows contractors to save progress at any point without validation errors
- Full validation only required for final submission (when `is_draft=false`)

### 3. Token-Based Access
- No authentication required (public endpoints)
- Security through magic link tokens (72-hour expiration)
- Token validation happens at service layer

### 4. draft_step Field
- Nullable integer (1-10)
- NULL indicates not started
- 1-10 indicates which wizard step they're on
- Frontend can use this to redirect to correct step on resume

### 5. Separate from Final Submission
- Drafts have `is_draft=true` and `submitted_at=NULL`
- Final submission sets `is_draft=false` and `submitted_at=NOW()`
- This allows distinguishing between in-progress and completed scope sheets

## Testing

### Unit Tests
Run the service tests:
```bash
cd backend
go test ./internal/services -run "TestSaveScopeDraft|TestGetScopeDraft" -v
```

### Integration Tests
Run the integration test script (requires running server and valid magic link):
```bash
cd backend
MAGIC_LINK_TOKEN=your-token-here ./test_draft_endpoints.sh
```

## Migration Instructions

### Apply Migration
```sql
-- Run this SQL against your database
-- File: backend/migrations/000009_add_scope_sheet_draft_fields.up.sql
```

### Rollback Migration
```sql
-- Run this SQL to rollback
-- File: backend/migrations/000009_add_scope_sheet_draft_fields.down.sql
```

## Next Steps
1. Apply database migration to development environment
2. Run unit tests to verify functionality
3. Run integration tests with a valid magic link
4. Frontend implementation (Task 2-15 in the plan)
5. End-to-end testing

## Error Handling

### Token Validation
- Invalid token: 401 Unauthorized
- Expired token: 401 Unauthorized
- Missing token: 401 Unauthorized

### Draft Operations
- No draft exists (GET): 404 Not Found
- Database errors: 500 Internal Server Error
- Invalid JSON: 400 Bad Request

## Performance Considerations
- Partial index on `(claim_id, is_draft)` for fast draft lookups
- UPSERT operation prevents draft duplicates
- Timestamp tracking for draft saved time

## Security
- Public endpoints (no auth) rely on magic link security
- Magic links expire after 72 hours
- Tokens are cryptographically secure UUIDs
- One draft per claim prevents data pollution

## Compatibility
- Backward compatible (new columns have defaults)
- Existing scope sheets have `is_draft=false` by default
- No breaking changes to existing endpoints
