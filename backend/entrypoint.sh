#!/bin/sh
set -e

if ! touch "$DATA_DIR/.write-test" 2>/dev/null; then
    echo "ERROR: $DATA_DIR is not writable by uid $(id -u)." >&2
    echo "Create the host folder yourself before starting, e.g.: mkdir data && sudo chown 1000:1000 data" >&2
    exit 1
fi
rm -f "$DATA_DIR/.write-test"

echo "Applying database migrations..."
flask db upgrade
flask seed
exec "$@"
