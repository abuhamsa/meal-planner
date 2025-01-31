#!/bin/sh

# Replace the placeholder with actual environment variable value
find /usr/share/nginx/html -type f -exec sed -i "s|__VITE_API_URL__|${VITE_API_URL}|g" {} \;

exec "$@"