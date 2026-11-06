#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
APP_NAME=${FLY_APP_NAME:-"dora-search-mock-origin"}
flyctl apps create "$APP_NAME" 2>/dev/null || true
flyctl deploy --app "$APP_NAME"
echo "Origin URL: https://${APP_NAME}.fly.dev"
echo "Set on gateway: flyctl secrets set ORACLE_ORIGIN_URL=https://${APP_NAME}.fly.dev --app dora-search-gateway"
