#!/bin/bash

# Test script for draft save/retrieve endpoints
# This script tests the draft functionality with a magic link

set -e

echo "========================================="
echo "Testing Draft Save & Retrieve Endpoints"
echo "========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8080}"

# You need to provide a valid magic link token for testing
# Get one from the database or create one via the API
if [ -z "$MAGIC_LINK_TOKEN" ]; then
    echo -e "${RED}ERROR: MAGIC_LINK_TOKEN environment variable not set${NC}"
    echo "Usage: MAGIC_LINK_TOKEN=your-token-here ./test_draft_endpoints.sh"
    exit 1
fi

echo "API URL: $API_URL"
echo "Magic Link Token: ${MAGIC_LINK_TOKEN:0:8}..."
echo

# Test 1: Save a draft (first time - create)
echo "Test 1: Save Draft (Create)"
echo "----------------------------"
RESPONSE=$(curl -s -X POST "$API_URL/api/magic-links/$MAGIC_LINK_TOKEN/scope-sheet/draft" \
  -H "Content-Type: application/json" \
  -d '{
    "roof_type": "asphalt_shingles",
    "roof_square_footage": 2000,
    "draft_step": 1
  }')

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Draft created successfully${NC}"
    DRAFT_ID=$(echo "$RESPONSE" | jq -r '.data.id')
    echo "Draft ID: $DRAFT_ID"
else
    echo -e "${RED}✗ Failed to create draft${NC}"
    exit 1
fi
echo

# Test 2: Retrieve the draft
echo "Test 2: Retrieve Draft"
echo "----------------------"
RESPONSE=$(curl -s -X GET "$API_URL/api/magic-links/$MAGIC_LINK_TOKEN/scope-sheet/draft")

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success == true and .data.is_draft == true' > /dev/null; then
    echo -e "${GREEN}✓ Draft retrieved successfully${NC}"
    STEP=$(echo "$RESPONSE" | jq -r '.data.draft_step')
    echo "Draft Step: $STEP"
else
    echo -e "${RED}✗ Failed to retrieve draft${NC}"
    exit 1
fi
echo

# Test 3: Update the draft (UPSERT - should update existing)
echo "Test 3: Update Draft (UPSERT)"
echo "------------------------------"
sleep 1 # Ensure different timestamp
RESPONSE=$(curl -s -X POST "$API_URL/api/magic-links/$MAGIC_LINK_TOKEN/scope-sheet/draft" \
  -H "Content-Type: application/json" \
  -d '{
    "roof_type": "asphalt_shingles",
    "roof_square_footage": 2000,
    "roof_pitch": "6/12",
    "draft_step": 2
  }')

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success == true and .data.id == "'$DRAFT_ID'"' > /dev/null; then
    echo -e "${GREEN}✓ Draft updated successfully (same ID)${NC}"
    UPDATED_STEP=$(echo "$RESPONSE" | jq -r '.data.draft_step')
    echo "Updated Draft Step: $UPDATED_STEP"
else
    echo -e "${RED}✗ Failed to update draft${NC}"
    exit 1
fi
echo

# Test 4: Verify updated draft
echo "Test 4: Verify Updated Draft"
echo "-----------------------------"
RESPONSE=$(curl -s -X GET "$API_URL/api/magic-links/$MAGIC_LINK_TOKEN/scope-sheet/draft")

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success == true and .data.draft_step == 2 and .data.roof_pitch == "6/12"' > /dev/null; then
    echo -e "${GREEN}✓ Draft update verified${NC}"
else
    echo -e "${RED}✗ Draft update verification failed${NC}"
    exit 1
fi
echo

# Test 5: Invalid token (should return 401)
echo "Test 5: Invalid Token"
echo "---------------------"
RESPONSE=$(curl -s -X GET "$API_URL/api/magic-links/invalid-token-123/scope-sheet/draft")

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success == false' > /dev/null; then
    echo -e "${GREEN}✓ Invalid token handled correctly${NC}"
else
    echo -e "${RED}✗ Invalid token not handled correctly${NC}"
    exit 1
fi
echo

echo "========================================="
echo -e "${GREEN}All tests passed!${NC}"
echo "========================================="
