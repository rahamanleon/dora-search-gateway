# Environment Variable Reference

This document outlines all configuration variables used across the Gateway, SearXNG instances, and deployment targets.

---

## 1. Gateway Router Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DORA_API_SECRET` | string | `dora_dev_secret_token_12345` | **Required in production.** Shared secret used to authenticate incoming Dora requests via `Authorization: Bearer <TOKEN>` or `x-api-key`. |
| `PORT` | number | `3000` | HTTP port for the Node.js standalone gateway. (Cloudflare Workers ignores this). |
| `HOST` | string | `0.0.0.0` | Bind address for Node.js standalone gateway. |
| `ORACLE_ORIGIN_URL` | string | `http://127.0.0.1:8080` | URL of the Primary SearXNG instance (Oracle Cloud VM). |
| `CLOUD_RUN_ORIGIN_URL` | string | `http://127.0.0.1:8081` | URL of Backup 1 SearXNG container (Google Cloud Run). |
| `RENDER_ORIGIN_URL` | string | `http://127.0.0.1:8082` | URL of Backup 2 SearXNG container (Render Free Web Service). |
| `UPSTREAM_SECRET_TOKEN` | string | `undefined` | Optional secret token sent in `Authorization: Bearer <TOKEN>` to upstream reverse proxies. |
| `RATE_LIMIT_MAX` | number | `60` | Maximum requests allowed per IP within the rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | number | `60000` | Rate-limit window duration in milliseconds (60 seconds). |
| `CACHE_TTL_MS` | number | `300000` | Duration to cache successful search queries in milliseconds (5 minutes). |

---

## 2. SearXNG Origin Variables

| Variable | Target | Description |
| :--- | :--- | :--- |
| `SEARXNG_SECRET` | SearXNG containers | 32+ byte random hex string for session encryption and HMAC. Generate via `openssl rand -hex 32`. |
| `SEARXNG_BASE_URL` | SearXNG containers | Canonical public URL of the SearXNG instance (e.g. `https://search.yourdomain.com/`). |

---

## 3. Reverse Proxy (Oracle Cloud Caddy) Variables

| Variable | Target | Description |
| :--- | :--- | :--- |
| `DOMAIN` | Oracle Caddy | The fully-qualified domain name (e.g. `search.yourdomain.com`). Automated Let's Encrypt certificates are provisioned for this domain. |
| `ACME_EMAIL` | Oracle Caddy | Contact email for Let's Encrypt certificate renewal notices. |
| `UPSTREAM_SECRET_TOKEN` | Oracle Caddy | Shared secret token checked by Caddy to reject unauthorized public search requests. |

