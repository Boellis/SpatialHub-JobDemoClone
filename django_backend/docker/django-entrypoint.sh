#!/bin/sh
set -e

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding habitat zones..."
python manage.py seed_habitat_zones

echo "Starting Gunicorn on port 8000..."
exec gunicorn spatialhub_backend.wsgi:application --bind 0.0.0.0:8000
