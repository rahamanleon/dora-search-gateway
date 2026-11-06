#!/usr/bin/env bash
set -euo pipefail

# Dora Search - Fly.io Free Tier Deployment Script
# Deploys SearXNG container with scale-to-zero and strict memory limits

APP_NAME=${FLY_APP_NAME:-"dora-search-fly-fallback"}
REGION=${FLY_REGION:-"iad"}
SEARXNG_SECRET=${SEARXNG_SECRET:-"$(openssl rand -hex 32)"}

echo "=== Deploying Dora Search Fallback to Fly.io ==="
echo "App:    ${APP_NAME}"
echo "Region: ${REGION}"

# Ensure flyctl is installed
if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "flyctl is not installed. Install from https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
fi
FLY=${FLY_COMMAND:-flyctl}

# 1. Create the app if it doesn't exist (ignore "already exists")
${FLY} apps create "${APP_NAME}" --org personal 2>/dev/null || true

# 2. Set secrets
${FLY} secrets set SEARXNG_SECRET="${SEARXNG_SECRET}" --app "${APP_NAME}"

# 3. Deploy (scale-to-zero, 256MB shared VM)
cd "$(dirname "$0")"
${FLY} deploy \
  --config ./fly.toml \
  --app "${APP_NAME}" \
  --region "${REGION}" \
  --ha=false

echo "Deployment complete! Retrieve the app URL with:"
echo "  ${FLY} status --app ${APP_NAME}"
echo "  ${FLY} open --app ${APP_NAME}"
