#!/bin/bash
echo "Database initializing .."
flask db upgrade

exec "$@"