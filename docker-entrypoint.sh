#!/bin/sh
set -e

# Wait for Postgres to be ready
until nc -z postgres 5432; do
  echo "Waiting for Postgres..."
  sleep 1
done

# Run migrations
npx prisma migrate deploy

# Start the app
exec npm start 