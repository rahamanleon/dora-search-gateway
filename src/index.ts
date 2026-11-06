import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { GatewayRouter } from './gateway/router.js';

const PORT = Number(process.env.PORT || (process.env.FLY_APP_NAME ? 8080 : 3000));
const HOST = process.env.HOST || '0.0.0.0';

const gateway = new GatewayRouter({
  DORA_API_SECRET: process.env.DORA_API_SECRET || 'dora_dev_secret_token_12345',
  ORACLE_ORIGIN_URL: process.env.ORACLE_ORIGIN_URL || 'http://127.0.0.1:8080',
  CLOUD_RUN_ORIGIN_URL: process.env.CLOUD_RUN_ORIGIN_URL || 'http://127.0.0.1:8081',
  RENDER_ORIGIN_URL: process.env.RENDER_ORIGIN_URL || 'http://127.0.0.1:8082',
  UPSTREAM_SECRET_TOKEN: process.env.UPSTREAM_SECRET_TOKEN,
  RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || 60,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 60000,
});

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${PORT}`;
    const fullUrl = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined && val !== null) {
        if (Array.isArray(val)) {
          for (const v of val) headers.append(key, v);
        } else {
          headers.set(key, String(val));
        }
      }
    }

    const standardRequest = new Request(fullUrl, {
      method: req.method,
      headers,
    });

    const response = await gateway.handleRequest(standardRequest);

    res.statusCode = response.status;
    response.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const bodyBuffer = await response.arrayBuffer();
    res.end(Buffer.from(bodyBuffer));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Gateway Error', details: msg }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Dora Search Gateway] Listening on http://${HOST}:${PORT}`);
  console.log(`[Dora Search Gateway] Endpoints:`);
  console.log(`  - GET  /dashboard               (Status Dashboard)`);
  console.log(`  - GET  /api/health              (System Health)`);
  console.log(`  - GET  /api/health/providers    (Provider Diagnostics)`);
  console.log(`  - GET  /api/search?q=...        (Search Gateway)`);
  console.log(`  - GET  /api/read?url=...        (Webpage Reader)`);
});

export { gateway, server };
