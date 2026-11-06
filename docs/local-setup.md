# Dora Search — Local Setup Guide

Follow this guide to spin up the complete local development environment using Docker Compose and Node.js.

---

## 1. Prerequisites

- **Node.js**: v20+ or v22+ (tested with v24).
- **Docker & Docker Compose**: v2.20+ (for running SearXNG & Valkey locally).
- **Git**

---

## 2. Quickstart

### Step 1: Clone and Install Dependencies
```bash
git clone <repo-url> dora-search
cd dora-search
npm install
```

### Step 2: Start SearXNG & Valkey via Docker Compose
From the project root:
```bash
docker compose up -d
```

Verify containers are running:
```bash
docker compose ps
```
Output should show:
- `dora-valkey`: port `6379`, status healthy
- `dora-searxng`: port `127.0.0.1:8080:8080`, status healthy

You can test SearXNG directly:
```bash
curl "http://127.0.0.1:8080/search?q=test&format=json"
```

### Step 3: Run the Gateway Server locally
In development mode (with auto-reload):
```bash
npm run dev
```

The gateway listens on `http://localhost:3000`.

---

## 3. Testing the Endpoints Locally

### 1. Status Dashboard
Open your browser to:
[http://localhost:3000/dashboard](http://localhost:3000/dashboard)

### 2. Search API
```bash
curl -H "Authorization: Bearer dora_dev_secret_token_12345" \
  "http://localhost:3000/api/search?q=nodejs+architecture&limit=5"
```

Expected response format:
```json
{
  "success": true,
  "query": "nodejs architecture",
  "provider": "oracle",
  "fallbackUsed": false,
  "results": [
    {
      "title": "Node.js Architecture",
      "url": "https://nodejs.org/en/about",
      "snippet": "Node.js uses an event-driven, non-blocking I/O model...",
      "source": "duckduckgo"
    }
  ],
  "sources": ["duckduckgo"],
  "failedProviders": []
}
```

### 3. Webpage Reader API
```bash
curl -H "Authorization: Bearer dora_dev_secret_token_12345" \
  "http://localhost:3000/api/read?url=https://nodejs.org/en"
```

### 4. Health Check
```bash
curl http://localhost:3000/api/health
```

---

## 4. Running the Automated Test Suite

Run all unit and integration tests:
```bash
npm test
```

To run tests with watch mode:
```bash
npm run test:watch
```

