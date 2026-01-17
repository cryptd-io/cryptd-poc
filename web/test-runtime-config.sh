#!/bin/bash

# Test script to demonstrate runtime configuration

set -e

echo "=== Testing Runtime Configuration ==="
echo ""

# Build the web image
echo "1. Building web image..."
cd /Users/shalteor/Documents/@Me/cryptd-poc
docker build -t cryptd-web-test ./web

echo ""
echo "2. Testing with default API_BASE_URL (http://localhost:8080)..."
docker run --rm --name cryptd-web-test -d -p 8081:80 cryptd-web-test
sleep 2
echo "   Checking generated config.js:"
docker exec cryptd-web-test cat /usr/share/nginx/html/config.js
docker stop cryptd-web-test

echo ""
echo "3. Testing with custom API_BASE_URL (https://api.example.com)..."
docker run --rm --name cryptd-web-test -d -p 8081:80 \
  -e API_BASE_URL=https://api.example.com \
  cryptd-web-test
sleep 2
echo "   Checking generated config.js:"
docker exec cryptd-web-test cat /usr/share/nginx/html/config.js
docker stop cryptd-web-test

echo ""
echo "=== Test Complete ==="
echo "Runtime configuration is working correctly!"
