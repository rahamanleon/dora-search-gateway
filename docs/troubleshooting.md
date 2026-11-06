# Dora Search — Troubleshooting Guide

This guide covers common issues, diagnostics, and recovery procedures.

---

## 1. Gateway Status 401 Unauthorized

### Symptom
Requests to `/api/search` or `/api/read` return `{"error": "Unauthorized: Invalid or missing authentication token"}`.

### Causes & Fixes
1. **Missing or Malformed Header**:
   Ensure you provide `Authorization: Bearer <TOKEN>` or `x-api-key: <TOKEN>`.
2. **Secret Mismatch**:
   Verify that `DORA_API_SECRET` on Cloudflare Workers / Node.js matches the token sent by Dora.
   Test locally with:
   ```bash
   curl -H "Authorization: Bearer dora_dev_secret_token_12345" "http://localhost:3000/api/search?q=test"
   ```

---

## 2. Gateway Status 429 Too Many Requests

### Symptom
Queries return HTTP 429 with `Retry-After` header.

### Causes & Fixes
1. **Rate Limit Exceeded**:
   By default, the gateway enforces 60 requests per 60-second window per IP.
2. **Increase Limit**:
   Set `RATE_LIMIT_MAX=120` or higher in `wrangler.toml` or environment variables if Dora operates at higher query volumes.

---

## 3. Circuit Breakers Tripped / Status 502 Bad Gateway

### Symptom
Queries return HTTP 502 with `All search providers failed or returned empty results`.

### Causes & Fixes
1. **Check Status Dashboard**:
   Visit `/dashboard` to view the circuit breaker state (`CLOSED`, `OPEN`, `HALF_OPEN`) and recent error messages for each provider.
2. **Examine Provider Health**:
   Query `/api/health/providers` using your bearer token:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" "https://<GATEWAY>/api/health/providers"
   ```
3. **Inspect Oracle VM Logs**:
   ```bash
   cd /opt/dora-search/deployment/oracle
   docker compose logs -f searxng
   docker compose logs -f caddy
   ```
4. **Inspect Cloud Run Container**:
   View Cloud Run logs in Google Cloud Console or:
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="dora-search-backup"' --limit=20
   ```

---

## 4. SearXNG "Engine Suspended" / Captcha Blocks

### Symptom
Upstream engines report `unresponsive_engines: [["google", "suspending"]]`.

### Causes & Fixes
- Dora Search is pre-configured to use **keyless independent engines** (`duckduckgo`, `brave`, `qwant`, `startpage`, `wikipedia`, `wikidata`).
- Engines like Google or Bing frequently block shared cloud datacenter IP ranges (e.g. AWS, Oracle, GCP) with bot verification captchas. Keep Google and Bing disabled in `searxng/settings.yml`.

---

## 5. Webpage Reader SSRF Blocks

### Symptom
Reader returns `{"success": false, "error": "SSRF blocked: Host '...' resolved to private/restricted IP"}`.

### Causes & Fixes
This is intentional security behavior. The reader rejects:
- `localhost`, `*.local`, `*.internal`
- `127.0.0.1` and `127.0.0.0/8`
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- `169.254.169.254` (Cloud metadata)
- `::1`, `fc00::/7`, `fe80::/10`
- Non-HTTP protocols (`file:`, `ftp:`, `gopher:`)

If you are running in a local isolated test environment and need to fetch localhost, pass `{ allowLocalhost: true }` to `WebpageReader`.

