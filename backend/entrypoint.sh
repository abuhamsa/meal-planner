#!/bin/bash
set -e

# Corrected path: Use /app/data instead of /app/backend/data
mkdir -p /app/data
chmod 755 /app/data

# Check database at the mounted location
if [ ! -f "/app/data/meals.db" ]; then
    echo "Database file not found. Initializing..."
    flask db upgrade
else
    echo "Checking if database is initialized..."
    
    # Check tables at the correct path
    if ! sqlite3 /app/data/meals.db "SELECT 1 FROM meal LIMIT 1;" >/dev/null 2>&1; then
        echo "Database exists but is missing tables. Running migrations..."
        flask db upgrade
    else
        echo "Database is already up to date."
    fi
fi

exec "$@"