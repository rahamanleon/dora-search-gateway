/**
 * Cloudflare Worker Gateway for Dora Search Infrastructure
 *
 * Runs on Cloudflare Workers Free Tier.
 * Acts as high-availability failover router, rate limiter, and authenticator.
 */

import { GatewayRouter, type GatewayEnv } from '../../src/gateway/router.js';

let routerInstance: GatewayRouter | null = null;
let cachedSecret: string | null = null;

export default {
  async fetch(request: Request, env: GatewayEnv, ctx: ExecutionContext): Promise<Response> {
    // Re-initialize router if secrets or environment changed
    if (!routerInstance || cachedSecret !== env.DORA_API_SECRET) {
      cachedSecret = env.DORA_API_SECRET || null;
      routerInstance = new GatewayRouter(env);
    }

    return routerInstance.handleRequest(request);
  },
};

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

