#!/bin/bash
set -e

# Create and set permissions for database directory
mkdir -p /app/backend/data
chmod 755 /app/backend/data

# Create database file if it doesn't exist
if [ ! -f "/app/backend/data/meals.db" ]; then
    touch /app/backend/data/meals.db
    chmod 644 /app/backend/data/meals.db
    echo "Created new database file"
    
    # Initialize migrations for fresh database
    flask db upgrade
else
    # Apply existing migrations
    flask db upgrade
fi

exec "$@"