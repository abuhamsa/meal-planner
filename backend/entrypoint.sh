#!/bin/bash
set -e

# Create and set permissions for database directory
mkdir -p /app/backend/data
chmod 755 /app/backend/data

# Ensure database exists and migrations are applied
if [ ! -f "/app/backend/data/meals.db" ]; then
    echo "Database file not found. Initializing..."
    flask db upgrade
else
    echo "Checking if database is initialized..."
    
    # Check if tables exist using SQLite
    if ! sqlite3 /app/backend/data/meals.db "SELECT 1 FROM meal LIMIT 1;" >/dev/null 2>&1; then
        echo "Database exists but is missing tables. Running migrations..."
        flask db upgrade
    else
        echo "Database is already up to date."
    fi
fi

exec "$@"
