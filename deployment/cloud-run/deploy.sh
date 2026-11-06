#!/usr/bin/env bash
set -euo pipefail

# Dora Search - Google Cloud Run Deployment Script
# Deploys SearXNG container with strict spending caps & scale-to-zero

PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"your-gcp-project-id"}
REGION=${GOOGLE_CLOUD_REGION:-"us-central1"}
SERVICE_NAME="dora-search-backup"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "=== Deploying Dora Search Backup to Google Cloud Run ==="
echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"

# 1. Build and push container to Google Artifact Registry / GCR
echo "Building container image..."
gcloud builds submit --tag "${IMAGE_NAME}" .

# 2. Deploy with strict free-tier spending protections:
# - max-instances=1: Prevents runaway bill spikes
# - min-instances=0: Scales down to zero cost when idle
# - memory=512Mi / cpu=1: Fits comfortably within Cloud Run monthly free tier (360k GB-s)
# - timeout=10s: Cuts off hanging requests
echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 15 \
  --timeout 10s \
  --set-env-vars SEARXNG_SECRET="$(openssl rand -hex 32)"

echo "Deployment complete! Retrieve the Cloud Run service URL with:"
echo "  gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)'"

