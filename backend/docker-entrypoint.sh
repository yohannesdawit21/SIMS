#!/bin/sh
set -e

echo "⏳ Waiting for Postgres to be ready..."
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(() => { c.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "  ... not ready yet, retrying in 2s"
  sleep 2
done
echo "✅ Postgres is ready."

echo "🚀 Running database migrations..."
npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
echo "✅ Migrations complete."

echo "🎯 Starting SIMS backend..."
exec node dist/src/main
