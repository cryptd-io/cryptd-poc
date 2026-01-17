#!/bin/sh
set -e

# Generate runtime config from environment variables
cat > /usr/share/nginx/html/config.js <<EOF
// Runtime configuration - auto-generated from environment variables
window.APP_CONFIG = {
  apiBaseUrl: '${API_BASE_URL:-http://localhost:8080}'
};
EOF

echo "Generated runtime config with API_BASE_URL=${API_BASE_URL:-http://localhost:8080}"

# Execute the default nginx entrypoint
exec nginx -g 'daemon off;'
