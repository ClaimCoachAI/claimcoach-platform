# Magic Link Generation API - Testing Guide

## Implementation Summary

The magic link generation backend has been successfully implemented with the following components:

### Files Created

1. **`internal/models/magic_link.go`** - MagicLink model matching the database schema
2. **`internal/services/magic_link_service.go`** - Business logic for generating magic links
3. **`internal/handlers/magic_link_handler.go`** - HTTP handler for the API endpoint
4. **`migrations/000003_add_magic_link_activity_type.up.sql`** - Migration to support activity logging
5. **`migrations/000003_add_magic_link_activity_type.down.sql`** - Rollback migration

### Files Modified

1. **`internal/config/config.go`** - Added `FrontendURL` configuration field
2. **`internal/api/router.go`** - Registered magic link endpoint and fixed route conflicts
3. **`internal/handlers/policy_handler.go`** - Fixed route parameter naming for consistency
4. **`.env.example`** - Added `FRONTEND_URL` environment variable

## API Endpoint

**POST /api/claims/:id/magic-link**

### Request

```bash
curl -X POST http://localhost:8080/api/claims/{claim-id}/magic-link \
  -H "Authorization: Bearer {your-jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "contractor_name": "Bob'\''s Roofing",
    "contractor_email": "bob@roofing.com",
    "contractor_phone": "555-1234"
  }'
```

### Response (Success - 201)

```json
{
  "success": true,
  "data": {
    "magic_link_id": "6b744c4e-bdcd-43fe-93f6-66d32f030fbf",
    "token": "13d0dfe7-daf5-4823-9364-b70b9411504a",
    "link_url": "http://localhost:5173/upload/13d0dfe7-daf5-4823-9364-b70b9411504a",
    "contractor_name": "Bob's Roofing",
    "contractor_email": "bob@roofing.com",
    "contractor_phone": "555-1234",
    "expires_at": "2026-02-08T22:58:39Z",
    "status": "active"
  }
}
```

### Response (Error - 404)

```json
{
  "success": false,
  "error": "Claim not found"
}
```

### Response (Error - 401)

```json
{
  "success": false,
  "error": "Authorization header required",
  "code": "UNAUTHORIZED"
}
```

## Features Implemented

### 1. Secure Token Generation
- Uses UUID v4 for cryptographically secure tokens
- Tokens are guaranteed to be unique via database constraint

### 2. Claim Ownership Validation
- Verifies that the user has access to the claim through organization ownership
- Prevents unauthorized magic link generation

### 3. Link Expiration
- Magic links expire 72 hours (3 days) after creation
- Expiration timestamp included in response

### 4. Link Invalidation
- Generating a new magic link automatically invalidates previous active links for the same claim
- Only one active link per claim at any time

### 5. Activity Logging
- Logs `magic_link_generated` activity with metadata
- Includes contractor name, email, and magic link ID in metadata
- Tracks user who generated the link

### 6. Frontend URL Configuration
- Link URLs use `FRONTEND_URL` environment variable
- Format: `{FRONTEND_URL}/upload/{token}`
- Defaults to `http://localhost:5173` in development

## Testing

### Automated Test Script

Run the included test script:

```bash
cd backend
chmod +x test_magic_link.sh
./test_magic_link.sh
```

### Manual Testing

1. **Set up environment variables:**
   ```bash
   export FRONTEND_URL=http://localhost:5173
   export DATABASE_URL=postgresql://localhost/test?sslmode=disable
   export SUPABASE_URL=your-supabase-url
   export SUPABASE_SERVICE_KEY=your-service-key
   export SUPABASE_JWT_SECRET=your-jwt-secret
   export PORT=8080
   ```

2. **Start the backend:**
   ```bash
   go run cmd/server/main.go
   ```

3. **Generate a JWT token** (requires Supabase setup or alternative auth)

4. **Test the endpoint:**
   ```bash
   curl -X POST http://localhost:8080/api/claims/{claim-id}/magic-link \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{
       "contractor_name": "Test Contractor",
       "contractor_email": "test@example.com",
       "contractor_phone": "555-0123"
     }'
   ```

### Verification Checklist

- [x] Magic link generated with unique UUID token
- [x] Link URL includes frontend base URL
- [x] Expiration set to 72 hours from creation
- [x] Token stored in database with status 'active'
- [x] Previous active links invalidated when new link generated
- [x] Activity logged in claim_activities table
- [x] Claim ownership validated before generation
- [x] Proper error handling for invalid claims
- [x] Authorization required for endpoint access

## Database Schema

The `magic_links` table (from migration 000001):

```sql
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    contractor_name TEXT NOT NULL,
    contractor_email TEXT NOT NULL,
    contractor_phone TEXT,
    expires_at TIMESTAMP NOT NULL,
    accessed_at TIMESTAMP,
    access_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'completed')) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Security Considerations

1. **Token Security**: Uses UUID v4 for cryptographically secure random tokens
2. **Authorization**: Requires valid JWT token to generate links
3. **Claim Ownership**: Validates user has access to claim through organization
4. **Link Expiration**: Automatic expiration after 72 hours
5. **Single Active Link**: Only one active link per claim prevents confusion
6. **Audit Trail**: All link generations logged in activity table

## Next Steps

- **Task 4.2**: Implement magic link validation backend (verify token, check expiration)
- **Task 4.3**: Build contractor upload portal UI
- **Task 4.4**: Add email notification to send magic link to contractor

## Troubleshooting

### Error: "claim not found"
- Verify the claim ID exists and belongs to the user's organization
- Check that the claim hasn't been deleted

### Error: "Authorization header required"
- Include `Authorization: Bearer {token}` header in request
- Verify JWT token is valid and not expired

### Migration issues
- Ensure all migrations are run: `000001`, `000002`, and `000003`
- Check `schema_migrations` table for current version
- If dirty flag is set, manually clean up and set correct version
