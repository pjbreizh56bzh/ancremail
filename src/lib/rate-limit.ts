import { HttpError } from "./http";

// Limiteur à fenêtre glissante en mémoire. Suffisant pour une instance unique ;
// en multi-instance, remplacer le Map par Redis (même interface).
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (!b.hits.length || now - b.hits[b.hits.length - 1] > windowMs) buckets.delete(k);
    lastSweep = now;
  }
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
    buckets.set(key, bucket);
    return { ok: false as const, remaining: 0, retryAfter };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true as const, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) {
    throw new HttpError(429, "rate_limited", "Trop de requêtes, réessayez plus tard", {
      "Retry-After": String(r.retryAfter),
    });
  }
  return r;
}

export function resetRateLimits() {
  buckets.clear();
}
