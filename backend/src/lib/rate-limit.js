// In-memory limiter for login and sign-up. Good enough for a single process;
// move it to Redis or similar if the app ever runs on several.
export function rateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    blocked(key) {
      const entry = hits.get(key);
      if (!entry) return false;
      if (entry.resetAt <= Date.now()) {
        hits.delete(key);
        return false;
      }
      return entry.count >= limit;
    },
    hit(key) {
      if (hits.size > 50_000) hits.clear();
      const entry = hits.get(key);
      if (entry && entry.resetAt > Date.now()) entry.count++;
      else hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
