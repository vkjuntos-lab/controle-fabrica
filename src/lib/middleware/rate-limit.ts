// Simple rate limiting logic for server functions
// In a serverless/worker environment, this is often handled by the platform (Cloudflare),
// but we can implement a basic store-level check here.

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const checkRateLimit = (key: string, config: RateLimitConfig): boolean => {
  const now = Date.now();
  const state = rateLimitStore.get(key) || { count: 0, resetTime: now + config.windowMs };

  if (now > state.resetTime) {
    state.count = 1;
    state.resetTime = now + config.windowMs;
  } else {
    state.count++;
  }

  rateLimitStore.set(key, state);
  return state.count <= config.limit;
};
