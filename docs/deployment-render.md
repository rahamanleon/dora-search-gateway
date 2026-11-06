# Deployment Guide: Render Free Tier (Backup 2 Emergency Fallback)

This guide walks through deploying the tertiary backup SearXNG container to Render's free container tier.

---

## 1. Free Tier Behavior & Considerations

- **Memory**: Render Free web services are limited to **512 MB RAM**.
- **Cold Starts**: Render spins services down after 15 minutes of inactivity. When invoked, a cold start takes ~50 seconds.
- **Priority**: In Dora Search, Render is configured as **Backup 2 (Tertiary)**. It will only be called if *both* Oracle Cloud and Google Cloud Run have failed.

---

## 2. Deploy via Render Blueprint (Recommended)

1. Push your repository to GitHub or GitLab.
2. Log into the [Render Dashboard](https://dashboard.render.com/).
3. Click **New** &rarr; **Blueprint**.
4. Connect your GitHub repository.
5. Render detects `deployment/render/render.yaml` automatically:
   - Service Name: `dora-search-render-fallback`
   - Plan: `Free`
   - Health Check Path: `/healthz`
6. Click **Apply**.
7. Once deployed, Render will display a public URL (e.g. `https://dora-search-render-fallback.onrender.com`).

---

## 3. Verify Deployment

Wait for build and deployment to complete, then query the health endpoint:
```bash
curl "https://<YOUR_RENDER_SERVICE>.onrender.com/healthz"
# Returns OK
```

Test a search query:
```bash
curl "https://<YOUR_RENDER_SERVICE>.onrender.com/search?q=render+test&format=json"
```

Save this URL for the Cloudflare Gateway `RENDER_ORIGIN_URL` environment secret.

