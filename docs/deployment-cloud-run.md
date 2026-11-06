# Deployment Guide: Google Cloud Run (Backup 1 Origin)

This guide walks through deploying the first backup SearXNG container to Google Cloud Run with strict free-tier spending protections.

---

## 1. Prerequisites

1. A Google Cloud account with an active project.
2. The `gcloud` CLI installed and authenticated:
   ```bash
   gcloud auth login
   gcloud config set project <YOUR_PROJECT_ID>
   ```
3. Enable necessary APIs:
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
   ```

---

## 2. Deploying to Cloud Run

### Step 1: Navigate to the Cloud Run deployment folder
```bash
cd deployment/cloud-run
```

### Step 2: Run the automated deployment script
```bash
export GOOGLE_CLOUD_PROJECT="<YOUR_PROJECT_ID>"
export GOOGLE_CLOUD_REGION="us-central1"
chmod +x deploy.sh
./deploy.sh
```

The script builds the image using Google Cloud Build and provisions Cloud Run with the following hard spending caps:
- `--max-instances 1`: Never launches more than 1 container simultaneously.
- `--min-instances 0`: Scales down to zero instances when idle ($0 cost when not called).
- `--memory 512Mi`: Fits within Cloud Run free tier.
- `--cpu 1`: 1 vCPU allocation.
- `--concurrency 15`: Handles up to 15 concurrent searches per container.
- `--timeout 10s`: Automatically terminates hung requests.

---

## 3. Verify Deployment

Get your service URL:
```bash
gcloud run services describe dora-search-backup \
  --region us-central1 \
  --format 'value(status.url)'
```

Test query:
```bash
curl "<CLOUD_RUN_URL>/search?q=test&format=json"
```

Save this `<CLOUD_RUN_URL>` for the Cloudflare Gateway `CLOUD_RUN_ORIGIN_URL` environment secret.

