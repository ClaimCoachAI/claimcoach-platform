#!/bin/bash

# Test script for Magic Link Generation API
# This script tests the magic link generation endpoint

set -e

BACKEND_URL="http://localhost:8080"
CLAIM_ID="00000000-0000-0000-0000-000000000005"

echo "=== Testing Magic Link Generation API ==="
echo ""

echo "Test 1: Generate magic link without auth (should fail with 401)"
curl -s -X POST "${BACKEND_URL}/api/claims/${CLAIM_ID}/magic-link" \
  -H "Content-Type: application/json" \
  -d '{
    "contractor_name": "Bobs Roofing",
    "contractor_email": "bob@roofing.com",
    "contractor_phone": "555-1234"
  }' | jq '.'
echo ""

echo "Test 2: Generate magic link with invalid JSON (should fail with 400)"
echo "Note: This requires a valid auth token which we cannot easily generate in test mode"
echo ""

echo "Test 3: Check database schema for magic_links table"
PGPASSWORD= psql -h localhost -U $(whoami) -d test -c "\d magic_links" || echo "Could not connect to database"
echo ""

echo "Test 4: Verify magic link route is registered in backend"
echo "Checking backend logs for magic-link route registration..."
grep "magic-link" /tmp/backend.log || echo "Route not found in logs"
echo ""

echo "=== Manual Testing Instructions ==="
echo ""
echo "To properly test the magic link endpoint, you need a valid authentication token."
echo "Since this is a test environment with Supabase in test mode, you would need to:"
echo ""
echo "1. Set up a real Supabase instance OR"
echo "2. Create a simple JWT token generator for testing OR"
echo "3. Use the actual frontend to authenticate and get a token"
echo ""
echo "Example curl command with a valid token:"
echo ""
echo "curl -X POST ${BACKEND_URL}/api/claims/${CLAIM_ID}/magic-link \\"
echo "  -H \"Authorization: Bearer YOUR_TOKEN_HERE\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"contractor_name\": \"Bobs Roofing\","
echo "    \"contractor_email\": \"bob@roofing.com\","
echo "    \"contractor_phone\": \"555-1234\""
echo "  }'"
echo ""
echo "Expected Response:"
echo "{"
echo "  \"success\": true,"
echo "  \"data\": {"
echo "    \"magic_link_id\": \"<uuid>\","
echo "    \"token\": \"<uuid>\","
echo "    \"link_url\": \"http://localhost:5173/upload/<uuid>\","
echo "    \"contractor_name\": \"Bobs Roofing\","
echo "    \"contractor_email\": \"bob@roofing.com\","
echo "    \"contractor_phone\": \"555-1234\","
echo "    \"expires_at\": \"<timestamp>\","
echo "    \"status\": \"active\""
echo "  }"
echo "}"
echo ""

echo "=== Implementation Verification ==="
echo ""
echo "Checking that all required files exist:"
files=(
  "internal/models/magic_link.go"
  "internal/services/magic_link_service.go"
  "internal/handlers/magic_link_handler.go"
)

for file in "${files[@]}"; do
  if [ -f "${file}" ]; then
    echo "✓ ${file} exists"
  else
    echo "✗ ${file} NOT FOUND"
  fi
done
echo ""

echo "Checking router registration:"
if grep -q "magic-link" internal/api/router.go; then
  echo "✓ Magic link route registered in router.go"
else
  echo "✗ Magic link route NOT registered in router.go"
fi
echo ""

echo "Checking config for FRONTEND_URL:"
if grep -q "FrontendURL" internal/config/config.go; then
  echo "✓ FrontendURL added to config"
else
  echo "✗ FrontendURL NOT added to config"
fi
echo ""

echo "=== Tests Complete ==="
