#!/bin/bash

# PDF Parsing Flow Example
# This script demonstrates the complete flow for uploading and parsing a carrier estimate PDF

set -e

API_URL="http://localhost:8080/api"
CLAIM_ID="your-claim-id"
AUTH_TOKEN="your-auth-token"

echo "=== Carrier Estimate PDF Parsing Flow ==="
echo

# Step 1: Request upload URL
echo "1. Requesting upload URL..."
UPLOAD_RESPONSE=$(curl -s -X POST "${API_URL}/claims/${CLAIM_ID}/carrier-estimate/upload-url" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "carrier_estimate.pdf",
    "file_size": 102400,
    "mime_type": "application/pdf"
  }')

echo "Response: ${UPLOAD_RESPONSE}"
echo

# Extract upload URL and estimate ID
UPLOAD_URL=$(echo $UPLOAD_RESPONSE | jq -r '.data.upload_url')
ESTIMATE_ID=$(echo $UPLOAD_RESPONSE | jq -r '.data.estimate_id')

echo "Upload URL: ${UPLOAD_URL}"
echo "Estimate ID: ${ESTIMATE_ID}"
echo

# Step 2: Upload PDF to Supabase
echo "2. Uploading PDF file..."
curl -X PUT "${UPLOAD_URL}" \
  -H "Content-Type: application/pdf" \
  --data-binary "@path/to/carrier_estimate.pdf"

echo "PDF uploaded successfully"
echo

# Step 3: Confirm upload
echo "3. Confirming upload..."
CONFIRM_RESPONSE=$(curl -s -X POST "${API_URL}/claims/${CLAIM_ID}/carrier-estimate/${ESTIMATE_ID}/confirm" \
  -H "Authorization: Bearer ${AUTH_TOKEN}")

echo "Response: ${CONFIRM_RESPONSE}"
echo

# Step 4: Trigger parsing
echo "4. Triggering PDF parsing..."
PARSE_RESPONSE=$(curl -s -X POST "${API_URL}/claims/${CLAIM_ID}/carrier-estimate/${ESTIMATE_ID}/parse" \
  -H "Authorization: Bearer ${AUTH_TOKEN}")

echo "Response: ${PARSE_RESPONSE}"
echo

# Step 5: Check parse status (poll every 2 seconds)
echo "5. Checking parse status..."
for i in {1..30}; do
  sleep 2

  LIST_RESPONSE=$(curl -s -X GET "${API_URL}/claims/${CLAIM_ID}/carrier-estimate" \
    -H "Authorization: Bearer ${AUTH_TOKEN}")

  PARSE_STATUS=$(echo $LIST_RESPONSE | jq -r ".data[] | select(.id == \"${ESTIMATE_ID}\") | .parse_status")

  echo "Parse status (attempt ${i}/30): ${PARSE_STATUS}"

  if [ "$PARSE_STATUS" = "completed" ]; then
    echo
    echo "=== Parsing completed successfully! ==="
    echo
    echo "Parsed data:"
    echo $LIST_RESPONSE | jq ".data[] | select(.id == \"${ESTIMATE_ID}\") | .parsed_data"
    break
  elif [ "$PARSE_STATUS" = "failed" ]; then
    echo
    echo "=== Parsing failed ==="
    echo
    echo "Error:"
    echo $LIST_RESPONSE | jq ".data[] | select(.id == \"${ESTIMATE_ID}\") | .parse_error"
    exit 1
  fi
done

if [ "$PARSE_STATUS" != "completed" ]; then
  echo
  echo "=== Parsing timed out ==="
  echo "Current status: ${PARSE_STATUS}"
  exit 1
fi

echo
echo "=== Flow completed successfully ==="
