#!/bin/sh
set -e

echo "🎯 Starting SIMS backend..."
exec node dist/src/main
