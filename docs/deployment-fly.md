# Deployment Guide: Fly.io Free Tier (Backup 3 Emergency Fallback)

This guide walks through deploying the tertiary/backup SearXNG container to Fly.io's free shared-cpu VM tier.

---

## 1. Free Tier Behavior & Considerations

- **Memory**: Fly.io free shared-cpu-1x VMs are limited to **256 MB RAM**.
- **Scale-to-Zero**: Machines auto-stop after inactivity and auto-start on the next request (cold start ~5-10s).
- **Priority**: In Dora Search, Fly.io is configured as an **additional fallback origin**. It will only be called if higher-priority origins have failed.
- **Spending Protection**: `min_machines_running = 0` and `auto_stop_machines = true` ensure no cost when idle.

---

## 2. Deploy via flyctl (Recommended)

1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
2. Authenticate: `flyctl auth login`
3. From the repository root, run:
   ```bash
   chmod +x deployment/fly/deploy.sh
   SEARXNG_SECRET="$(openssl rand -hex 32)" ./deployment/fly/deploy.sh
   ```
   Or deploy directly:
   ```bash
   cd deployment/fly
   flyctl deploy
   ```
4. Once deployed, Fly will display an app URL (e.g. `https://dora-search-fly-fallback.fly.dev`).

---

## 3. Verify Deployment

Wait for build and deployment to complete, then query the health endpoint:

```bash
curl "https://<YOUR_FLY_APP>.fly.dev/healthz"
# Returns OK
```

Test a search query:

```bash
curl "https://<YOUR_FLY_APP>.fly.dev/search?q=fly+test&format=json"
```

Save this URL for the Cloudflare Gateway `RENDER_ORIGIN_URL` (or a dedicated `FLY_ORIGIN_URL`) environment secret.
