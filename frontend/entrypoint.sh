#!/bin/sh

# Clean existing config
rm -f /etc/nginx/conf.d/default.conf

# Choose appropriate config
if [ "$HTTPS_ENABLED" = "true" ]; then
    echo "Using HTTPS configuration"
    cp /etc/nginx/conf.d/nginx-https.conf.placeholder /etc/nginx/conf.d/default.conf
    
    # Generate certs if missing
    if [ ! -f /etc/nginx/ssl/fullchain.pem ]; then
        echo "Generating self-signed certificate..."
        mkdir -p /etc/nginx/ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/nginx/ssl/privkey.pem \
            -out /etc/nginx/ssl/fullchain.pem \
            -subj "/CN=localhost"
    fi
else
    echo "Using HTTP configuration"
    cp /etc/nginx/conf.d/nginx-http.conf.placeholder /etc/nginx/conf.d/default.conf
    # Remove SSL artifacts if they exist
    #rm -rf /etc/nginx/ssl/
fi

exec "$@"