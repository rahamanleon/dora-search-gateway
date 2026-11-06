# Dora Search — Independent Web Search Infrastructure

A standalone, lightweight, open-source web search service built for Dora AI. 

Dora Search is independently deployable across free hosting tiers, provides automated multi-cloud failover with circuit breakers, and exposes a clean, authenticated API for Dora's Node.js/TypeScript backend.

---

## Key Highlights

- **Core Search Engine**: Official SearXNG (`searxng/searxng:2025.2.22-3715d0ec3`) with Valkey caching, bot protection, and JSON search API enabled.
- **Multiple Free Hosting Targets**:
  1. **Oracle Cloud Always Free**: Primary persistent Docker host running SearXNG, Valkey, and Caddy reverse proxy with automated HTTPS.
  2. **Google Cloud Run**: Independent backup container with scale-to-zero and hard spending protection (`max-instances: 1`).
  3. **Render Free Tier**: Emergency fallback container with 512MB RAM optimization.
  4. **Fly.io Free Tier**: Additional scale-to-zero fallback container with 256MB RAM optimization.
  5. **Cloudflare Workers Free**: Global edge API gateway, secret authenticator, rate limiter, and failover router.
- **Resilient Failover Manager**:
  - Sequential failover (Oracle &rarr; Cloud Run &rarr; Render).
  - Per-origin timeouts and limited retries.
  - Three-state Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with cooldowns.
  - Empty-result detection and fallback trigger.
  - Tracking parameter removal and URL deduplication.
- **Secure Webpage Reader**:
  - Native Node.js `fetch` with streaming byte limits (2MB).
  - SSRF protection: blocks private IPv4 (`10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `169.254.169.254`), loopback, IPv6 ULA, and DNS rebinding across redirect chains.
  - Strips JavaScript, stylesheets, navigation, and ads without JS execution.
- **Status Dashboard**: Live responsive status dashboard at `/dashboard` displaying provider health, circuit breaker states, gateway latency, and upstream engine health.

---

## API Contract

All endpoints require authentication using `Authorization: Bearer <TOKEN>` or `x-api-key: <TOKEN>`.

### 1. Web Search
`GET /api/search?q=Node.js+documentation&limit=10`

**Response (`200 OK`)**:
```json
{
  "success": true,
  "query": "Node.js documentation",
  "provider": "oracle",
  "fallbackUsed": false,
  "results": [
    {
      "title": "Node.js",
      "url": "https://nodejs.org/",
      "snippet": "Node.js documentation and JavaScript runtime environment.",
      "source": "duckduckgo"
    }
  ],
  "sources": [
    "duckduckgo"
  ],
  "failedProviders": []
}
```

### 2. System Health
`GET /api/health`

### 3. Provider Diagnostics
`GET /api/health/providers`

### 4. Webpage Reader
`GET /api/read?url=https://example.com/article`

---

## Quickstart (Local Development)

### Prerequisites
- Node.js v20+ / v22+ / v24+
- Docker & Docker Compose

### 1. Clone & Install
```bash
git clone <repo-url> dora-search
cd dora-search
npm install
```

### 2. Start SearXNG & Valkey Locally
```bash
docker compose up -d
```

### 3. Run Gateway Server
```bash
npm run dev
```

Visit the dashboard in your browser:
[http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## Automated Testing

Dora Search includes a comprehensive test suite mocking all upstream networks:

```bash
npm test
```

Tested scenarios:
1. Successful primary search
2. Primary timeout followed by backup success
3. Primary invalid JSON followed by backup
4. Cascading primary and secondary failure followed by tertiary success
5. All providers unavailable
6. Empty search results fallback trigger
7. URL deduplication and tracking parameter stripping
8. Invalid URLs and SSRF attempts (Private IPs, AWS/GCP metadata, DNS rebinding)
9. Rate limiting (HTTP 429 & Retry-After)
10. Health-check recovery and circuit breaker state transitions
11. Authentication failures (401 timing-safe comparison)
12. Cache behavior (`X-Cache: HIT` / `MISS` and TTL)

---

## Documentation

- [Architecture & Design](docs/architecture.md)
- [Local Setup Guide](docs/local-setup.md)
- [Environment Variables Reference](docs/environment-variables.md)
- [Free Tier Limits & Spending Protections](docs/free-tier-limits.md)
- [Oracle Cloud Deployment Guide](docs/deployment-oracle.md)
- [Google Cloud Run Deployment Guide](docs/deployment-cloud-run.md)
- [Render Free Tier Deployment Guide](docs/deployment-render.md)
- [Fly.io Free Tier Deployment Guide](docs/deployment-fly.md)
- [Cloudflare Workers Deployment Guide](docs/deployment-cloudflare.md)
- [Troubleshooting Guide](docs/troubleshooting.md)

---

## Author

Made by **Rl** — GitHub: [@rahamanleon](https://github.com/rahamanleon)

---

## License

Licensed under the [MIT License](LICENSE) © 2026 Rl (@rahamanleon)

