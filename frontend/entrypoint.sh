#!/bin/sh

# Generate self-signed cert if needed 
if [ "$HTTPS_ENABLED" = "true" ] && [ ! -f /etc/nginx/ssl/fullchain.pem ]; then
    echo "Generating self-signed certificate..."
    mkdir -p /etc/nginx/ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/privkey.pem \
        -out /etc/nginx/ssl/fullchain.pem \
        -subj "/CN=localhost"
fi

exec "$@"