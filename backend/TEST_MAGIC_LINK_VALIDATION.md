# Magic Link Validation API - Test Guide

This document provides test cases for the magic link validation endpoint implemented in Task 4.2.

## Endpoint

**GET /api/magic-links/:token/validate**

- **Authentication:** None required (public endpoint)
- **Purpose:** Validates a magic link token and returns claim information for contractors

## Test Cases

### 1. Valid Active Token

**Request:**
```bash
curl -X GET "http://localhost:8080/api/magic-links/{valid-token}/validate"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "magic_link_id": "123e4567-e89b-12d3-a456-426614174000",
    "claim": {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "claim_number": "CLM-2024-001",
      "loss_type": "water",
      "incident_date": "2026-02-01T10:00:00Z",
      "property": {
        "nickname": "Highland Apartments",
        "legal_address": "123 Main St, Austin, TX 78701"
      }
    },
    "contractor_name": "Bob's Roofing",
    "expires_at": "2026-02-08T12:00:00Z",
    "status": "active"
  }
}
```

**Verification:**
- `valid` is `true`
- All claim details are populated
- `status` is `"active"`
- `expires_at` is in the future

### 2. Token Not Found

**Request:**
```bash
curl -X GET "http://localhost:8080/api/magic-links/invalid-token-12345/validate"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "not_found"
  }
}
```

**Verification:**
- `valid` is `false`
- `reason` is `"not_found"`
- No claim data is returned

### 3. Expired Token

**Setup:**
Manually update a token in the database to be expired:
```sql
UPDATE magic_links
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE token = '{test-token}';
```

**Request:**
```bash
curl -X GET "http://localhost:8080/api/magic-links/{expired-token}/validate"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "expired"
  }
}
```

**Verification:**
- `valid` is `false`
- `reason` is `"expired"`

### 4. Completed Token

**Setup:**
Manually update a token's status to completed:
```sql
UPDATE magic_links
SET status = 'completed'
WHERE token = '{test-token}';
```

**Request:**
```bash
curl -X GET "http://localhost:8080/api/magic-links/{completed-token}/validate"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "reason": "completed"
  }
}
```

**Verification:**
- `valid` is `false`
- `reason` is `"completed"`

### 5. Access Tracking

**Test:**
Make multiple requests to a valid token and verify access tracking:

```bash
# First request
curl -X GET "http://localhost:8080/api/magic-links/{valid-token}/validate"

# Second request
curl -X GET "http://localhost:8080/api/magic-links/{valid-token}/validate"
```

**Database Verification:**
```sql
SELECT access_count, accessed_at
FROM magic_links
WHERE token = '{valid-token}';
```

**Expected:**
- `access_count` increments with each request (1, 2, 3, etc.)
- `accessed_at` updates to the most recent access time

## Integration Test Flow

### Complete End-to-End Test

1. **Generate a Magic Link** (requires authentication)
   ```bash
   curl -X POST "http://localhost:8080/api/claims/{claim-id}/magic-link" \
     -H "Authorization: Bearer {jwt-token}" \
     -H "Content-Type: application/json" \
     -d '{
       "contractor_name": "Test Contractor",
       "contractor_email": "test@example.com",
       "contractor_phone": "555-0123"
     }'
   ```

   **Save the returned `token` value**

2. **Validate the Token** (no authentication needed)
   ```bash
   curl -X GET "http://localhost:8080/api/magic-links/{token}/validate"
   ```

   **Verify:**
   - Response shows `valid: true`
   - Claim details match the original claim
   - Contractor name matches

3. **Check Access Count**
   - Make the same validation request again
   - Verify in database that `access_count` increased

4. **Test with Invalid Token**
   ```bash
   curl -X GET "http://localhost:8080/api/magic-links/fake-token-123/validate"
   ```

   **Verify:**
   - Response shows `valid: false`
   - Reason is `"not_found"`

## Security Verification

### Confirm No Authentication Required

The validation endpoint should work WITHOUT an Authorization header:

```bash
# This should succeed (no auth header)
curl -X GET "http://localhost:8080/api/magic-links/{valid-token}/validate"
```

### Verify No Sensitive Data Exposure

Check that the response does NOT include:
- User IDs or user information
- Organization IDs
- Policy details
- Full property details (only nickname and legal address)
- Database IDs beyond what's necessary

## Database Queries for Testing

### View All Magic Links
```sql
SELECT
  ml.token,
  ml.contractor_name,
  ml.status,
  ml.expires_at,
  ml.access_count,
  ml.accessed_at,
  c.claim_number
FROM magic_links ml
JOIN claims c ON c.id = ml.claim_id
ORDER BY ml.created_at DESC;
```

### Reset a Token for Testing
```sql
-- Make a token active and not expired
UPDATE magic_links
SET
  status = 'active',
  expires_at = NOW() + INTERVAL '72 hours',
  access_count = 0,
  accessed_at = NULL
WHERE token = '{test-token}';
```

## Expected Behavior Summary

| Scenario | Valid | Reason | HTTP Status | Access Count Updated |
|----------|-------|--------|-------------|---------------------|
| Token not found | false | not_found | 200 | No |
| Token expired | false | expired | 200 | No |
| Token completed | false | completed | 200 | No |
| Token active & valid | true | - | 200 | Yes |
| Database error | - | - | 500 | No |

## Notes

- All validation responses return HTTP 200 OK (except database errors → 500)
- Invalid/expired tokens return `valid: false` with a reason (not a 404)
- Access tracking updates are non-blocking (validation succeeds even if tracking fails)
- Token validation is idempotent (can be called multiple times)
- The endpoint is public by design (contractors don't have accounts)
