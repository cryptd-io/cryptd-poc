#!/bin/bash

# Simple example script to test the Cryptd API
# This demonstrates the API flow but doesn't implement actual client-side encryption

set -e

BASE_URL="http://localhost:8080"
USERNAME="testuser_$(date +%s)"
BLOB_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

echo "=== Cryptd API Example ==="
echo "Base URL: $BASE_URL"
echo "Username: $USERNAME"
echo "Blob ID: $BLOB_ID"
echo

# Helper function to make base64 string
make_b64() {
    echo -n "$1" | base64
}

# 1. Register a new user
echo "1. Registering user..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/register" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"$USERNAME\",
        \"kdf\": {
            \"type\": \"argon2id\",
            \"salt_b64\": \"$(make_b64 "random-salt-data")\",
            \"memory_kib\": 65536,
            \"iterations\": 3,
            \"parallelism\": 1
        },
        \"auth_verifier_b64\": \"$(make_b64 "fake-auth-key-32-bytes-long!!")\",
        \"wrapped_uek\": {
            \"alg\": \"A256GCM\",
            \"nonce_b64\": \"$(make_b64 "nonce-12byte")\",
            \"ciphertext_b64\": \"$(make_b64 "fake-encrypted-uek-data")\""
        }
    }")

echo "Response: $REGISTER_RESPONSE"
USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
echo "User ID: $USER_ID"
echo

# 2. Login
echo "2. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/login" \
    -H "Content-Type: application/json" \
    -d "{
        \"username\": \"$USERNAME\",
        \"auth_verifier_b64\": \"$(make_b64 "fake-auth-key-32-bytes-long!!")\"
    }")

echo "Response: $LOGIN_RESPONSE"
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"
echo

# 3. Create a blob
echo "3. Creating blob..."
PUT_RESPONSE=$(curl -s -X PUT "$BASE_URL/v1/blobs/$BLOB_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
        \"wrapped_dek\": {
            \"alg\": \"A256GCM\",
            \"nonce_b64\": \"$(make_b64 "dek-nonce-12")\",
            \"ciphertext_b64\": \"$(make_b64 "fake-wrapped-dek")\"
        },
        \"blob\": {
            \"alg\": \"A256GCM\",
            \"nonce_b64\": \"$(make_b64 "blob-nonce12")\",
            \"ciphertext_b64\": \"$(make_b64 "fake-encrypted-blob-data-here")\"
        },
        \"version\": 1
    }")

echo "Response: $PUT_RESPONSE"
echo

# 4. Get the blob
echo "4. Getting blob..."
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/v1/blobs/$BLOB_ID" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $GET_RESPONSE"
echo

# 5. List blobs
echo "5. Listing blobs..."
LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/v1/blobs?limit=10" \
    -H "Authorization: Bearer $TOKEN")

echo "Response: $LIST_RESPONSE"
echo

# 6. Update the blob
echo "6. Updating blob..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/v1/blobs/$BLOB_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
        \"wrapped_dek\": {
            \"alg\": \"A256GCM\",
            \"nonce_b64\": \"$(make_b64 "dek-nonce-12")\",
            \"ciphertext_b64\": \"$(make_b64 "fake-wrapped-dek-v2")\"
        },
        \"blob\": {
            \"alg\": \"A256GCM\",
            \"nonce_b64\": \"$(make_b64 "blob-nonce12")\",
            \"ciphertext_b64\": \"$(make_b64 "fake-encrypted-blob-data-UPDATED")\"
        },
        \"version\": 2
    }")

echo "Response: $UPDATE_RESPONSE"
echo

# 7. Delete the blob
echo "7. Deleting blob..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/v1/blobs/$BLOB_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -w "\nHTTP Status: %{http_code}")

echo "Response: $DELETE_RESPONSE"
echo

# 8. Verify deletion
echo "8. Verifying deletion (should return 404)..."
VERIFY_RESPONSE=$(curl -s -X GET "$BASE_URL/v1/blobs/$BLOB_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -w "\nHTTP Status: %{http_code}")

echo "Response: $VERIFY_RESPONSE"
echo

echo "=== Test Complete ==="
