# Deployment Guide: Cloudflare Workers (API Gateway & Failover Router)

This guide walks through deploying the Dora Search Gateway to Cloudflare Workers Free Tier.

> **Important**: Cloudflare Workers executes the lightweight API gateway, rate limiter, cache, and failover router. It does **not** run SearXNG containers (which run on Oracle Cloud, Cloud Run, and Render).

---

## 1. Prerequisites

1. A free [Cloudflare Account](https://dash.cloudflare.com/).
2. The Wrangler CLI installed:
   ```bash
   npm install -g wrangler
   # Or use npx wrangler
   ```
3. Authenticate Wrangler:
   ```bash
   wrangler login
   ```

---

## 2. Setting Environment Secrets

Navigate to `deployment/cloudflare/` and configure your environment secrets:

```bash
cd deployment/cloudflare

# 1. Secret token used by Dora AI to authenticate against this Gateway
wrangler secret put DORA_API_SECRET
# Enter a secure random string (e.g. openssl rand -hex 32)

# 2. Origin URLs for your deployed SearXNG instances
wrangler secret put ORACLE_ORIGIN_URL
# Enter: https://search.yourdomain.com

wrangler secret put CLOUD_RUN_ORIGIN_URL
# Enter: https://dora-search-backup-xxxxxx.a.run.app

wrangler secret put RENDER_ORIGIN_URL
# Enter: https://dora-search-render-fallback.onrender.com

# 3. Optional upstream authentication token (matches Oracle Caddy UPSTREAM_SECRET_TOKEN)
wrangler secret put UPSTREAM_SECRET_TOKEN
# Enter the token configured in Oracle Caddy .env
```

---

## 3. Deploy the Worker

Deploy directly to Cloudflare's global edge network:
```bash
wrangler deploy
```

Upon success, Wrangler outputs your Worker URL:
`https://dora-search-gateway.<your-subdomain>.workers.dev`

---

## 4. Test the Gateway

### 1. Status Dashboard
Open in your browser:
`https://dora-search-gateway.<your-subdomain>.workers.dev/dashboard`

### 2. Search Query
```bash
curl -H "Authorization: Bearer <YOUR_DORA_API_SECRET>" \
  "https://dora-search-gateway.<your-subdomain>.workers.dev/api/search?q=typescript+tutorial&limit=10"
```

### 3. Read Webpage
```bash
curl -H "Authorization: Bearer <YOUR_DORA_API_SECRET>" \
  "https://dora-search-gateway.<your-subdomain>.workers.dev/api/read?url=https://www.typescriptlang.org/"
```

