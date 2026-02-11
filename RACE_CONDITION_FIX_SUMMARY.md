# Race Condition Fix Summary

## Critical Issues Fixed

### 1. Race Condition in UPSERT Logic (CRITICAL - FIXED)
**Problem:** The check-then-act pattern in `SaveScopeDraft` was vulnerable to race conditions:
```go
// OLD CODE - VULNERABLE TO RACE CONDITIONS
var existingID *string
checkQuery := `SELECT id FROM scope_sheets WHERE claim_id = $1 AND is_draft = true`
err = s.db.QueryRowContext(ctx, checkQuery, claimID).Scan(&existingID)

if existingID != nil {
    // UPDATE
} else {
    // INSERT
}
```

**Solution:** Implemented atomic UPSERT using PostgreSQL's `ON CONFLICT`:
```go
// NEW CODE - ATOMIC OPERATION
INSERT INTO scope_sheets (...)
VALUES (...)
ON CONFLICT (claim_id) WHERE is_draft = true
DO UPDATE SET
    roof_type = EXCLUDED.roof_type,
    ...
RETURNING ...
```

**Benefits:**
- Atomic operation - no race condition possible
- Database-level concurrency control
- Simpler code - single query instead of check + conditional logic

### 2. Missing Unique Constraint (CRITICAL - FIXED)
**Problem:** Migration only created a regular index, not enforcing uniqueness:
```sql
-- OLD - NOT UNIQUE
CREATE INDEX idx_scope_sheets_draft ON scope_sheets(claim_id, is_draft) WHERE is_draft = true;
```

**Solution:** Created UNIQUE partial index:
```sql
-- NEW - ENFORCES UNIQUENESS
CREATE UNIQUE INDEX idx_scope_sheets_draft_unique ON scope_sheets(claim_id) WHERE is_draft = true;
```

**Benefits:**
- Database-level enforcement of business rule (one draft per claim)
- Prevents duplicate drafts even in concurrent scenarios
- Works seamlessly with ON CONFLICT clause

### 3. Code Improvements (All Implemented)

#### 3.1 Extract Token Validation Helper
**Added:**
```go
// validateMagicLinkToken validates a magic link token and returns the associated claim ID
// Returns ErrTokenInvalid if token is not found, expired, or inactive
func (s *ScopeSheetService) validateMagicLinkToken(ctx context.Context, token string) (string, error) {
    var claimID string
    query := `SELECT claim_id FROM magic_links WHERE token = $1 AND status = 'active' AND expires_at > NOW()`
    err := s.db.QueryRowContext(ctx, query, token).Scan(&claimID)
    if err == sql.ErrNoRows {
        return "", ErrTokenInvalid
    }
    if err != nil {
        return "", fmt.Errorf("failed to validate token: %w", err)
    }
    return claimID, nil
}
```

**Benefits:**
- DRY principle - no duplication between SaveScopeDraft and GetScopeDraft
- Consistent error handling
- Easier to maintain and test

#### 3.2 Sentinel Errors
**Added:**
```go
// Sentinel errors for scope sheet operations
var (
    ErrTokenInvalid     = errors.New("magic link token is invalid or expired")
    ErrDraftNotFound    = errors.New("draft not found")
    ErrInvalidDraftStep = errors.New("draft_step must be between 1 and 10")
)
```

**Usage in Handlers:**
```go
// OLD - STRING COMPARISON (FRAGILE)
if err.Error() == "token not found or expired" {
    ...
}

// NEW - SENTINEL ERRORS (ROBUST)
if errors.Is(err, services.ErrTokenInvalid) {
    ...
}
```

**Benefits:**
- Type-safe error checking
- Errors can be wrapped without breaking comparisons
- Better IDE support (autocomplete, refactoring)
- More maintainable code

#### 3.3 Input Validation
**Added draft_step validation:**
```go
// Step 2: Validate draft_step if provided
if draft.DraftStep != nil {
    if *draft.DraftStep < 1 || *draft.DraftStep > 10 {
        return nil, ErrInvalidDraftStep
    }
}
```

**Benefits:**
- Validates business rules before database operation
- Returns clear error message
- Prevents invalid data from reaching database

## Files Modified

### Database Migration
- `/backend/migrations/000009_add_scope_sheet_draft_fields.up.sql`
  - Changed from regular INDEX to UNIQUE INDEX
  - Index name changed from `idx_scope_sheets_draft` to `idx_scope_sheets_draft_unique`

- `/backend/migrations/000009_add_scope_sheet_draft_fields.down.sql`
  - Updated to drop `idx_scope_sheets_draft_unique`

### Service Layer
- `/backend/internal/services/scope_sheet_service.go`
  - Added sentinel errors (ErrTokenInvalid, ErrDraftNotFound, ErrInvalidDraftStep)
  - Added `validateMagicLinkToken()` helper method
  - Completely rewrote `SaveScopeDraft()` to use ON CONFLICT
  - Updated `GetScopeDraft()` to use helper and sentinel errors
  - Added `draft_step` validation (1-10 range)

### Handler Layer
- `/backend/internal/handlers/scope_sheet_handler.go`
  - Added `import "errors"`
  - Updated `SaveDraft()` to use `errors.Is()` for error checking
  - Added handler for `ErrInvalidDraftStep` (400 Bad Request)
  - Updated `GetDraft()` to use `errors.Is()` for error checking

### Tests
- `/backend/internal/services/scope_sheet_service_test.go`
  - Added `import "errors"`
  - Updated `TestSaveScopeDraft_InvalidToken()` to use `errors.Is()`
  - Added `TestSaveScopeDraft_InvalidDraftStep()` to test validation
  - Updated `TestGetScopeDraft_NotFound()` to use `errors.Is()`
  - Updated `TestGetScopeDraft_InvalidToken()` to use `errors.Is()`

## Testing

### Unit Tests
All existing tests updated to use sentinel errors:
```bash
cd backend
go test ./internal/services -run "TestSaveScopeDraft|TestGetScopeDraft" -v
```

### Test Coverage
- `TestSaveScopeDraft_CreateNew` - ✅ Verifies INSERT path
- `TestSaveScopeDraft_UpdateExisting` - ✅ Verifies UPDATE path (ON CONFLICT)
- `TestSaveScopeDraft_InvalidToken` - ✅ Verifies ErrTokenInvalid
- `TestSaveScopeDraft_InvalidDraftStep` - ✅ NEW - Verifies validation
- `TestGetScopeDraft_Success` - ✅ Verifies draft retrieval
- `TestGetScopeDraft_NotFound` - ✅ Verifies ErrDraftNotFound
- `TestGetScopeDraft_InvalidToken` - ✅ Verifies ErrTokenInvalid

## Performance Impact

### Before (Check-then-Act)
```
1. SELECT to check if draft exists
2. UPDATE or INSERT based on result
Total: 2 database round trips
```

### After (ON CONFLICT)
```
1. INSERT ... ON CONFLICT DO UPDATE
Total: 1 database round trip
```

**Result:** 50% reduction in database queries + elimination of race condition window

## Security Impact

### Before
- Race condition window between SELECT and INSERT/UPDATE
- Multiple concurrent requests could create duplicate drafts
- Potential for data inconsistency

### After
- Atomic operation - no race condition possible
- Unique constraint enforced at database level
- Guaranteed data consistency

## Backward Compatibility

✅ **Fully backward compatible:**
- API contracts unchanged (same endpoints, same responses)
- Existing drafts work without migration
- Handler error responses unchanged (same HTTP status codes)
- ON CONFLICT handles both INSERT and UPDATE cases transparently

## Migration Notes

### Applying Migration
```sql
-- Run migration 000009 up
-- This adds:
-- 1. is_draft, draft_step, draft_saved_at columns
-- 2. UNIQUE partial index on (claim_id) WHERE is_draft = true
```

### Rollback
```sql
-- Run migration 000009 down
-- This removes:
-- 1. UNIQUE index idx_scope_sheets_draft_unique
-- 2. All three draft columns
```

### Important
If you've already applied the old migration (with regular INDEX), you need to:
1. Drop the old index: `DROP INDEX IF EXISTS idx_scope_sheets_draft;`
2. Create the new unique index: `CREATE UNIQUE INDEX idx_scope_sheets_draft_unique ON scope_sheets(claim_id) WHERE is_draft = true;`

## Code Quality Improvements

1. **DRY Principle** - Token validation extracted to helper
2. **Type Safety** - Sentinel errors instead of string comparison
3. **Atomic Operations** - ON CONFLICT for race-free UPSERT
4. **Input Validation** - draft_step range checking
5. **Better Error Handling** - errors.Is() for robust checking
6. **Clearer Intent** - Code is more readable and maintainable

## Performance Characteristics

### ON CONFLICT Performance
- **Best Case (INSERT):** Same as regular INSERT
- **Best Case (UPDATE):** Slightly faster than SELECT + UPDATE (1 query vs 2)
- **Worst Case:** Same as UPDATE (conflict detected, update executed)
- **Concurrency:** Handles concurrent requests correctly via database locking

### Index Performance
- **Partial Index:** Only indexes rows where is_draft = true
- **Memory Efficient:** Much smaller than full index
- **Query Performance:** Near-instant lookups for draft retrieval

## Conclusion

All critical issues identified in the code quality review have been fixed:

✅ Race condition eliminated using ON CONFLICT
✅ Unique constraint enforced at database level
✅ Token validation helper extracted (DRY)
✅ Sentinel errors implemented
✅ Input validation added
✅ Tests updated to use errors.Is()
✅ Code compiles successfully
✅ Backward compatible

The implementation is now production-ready with proper concurrency handling, input validation, and maintainable error handling.
