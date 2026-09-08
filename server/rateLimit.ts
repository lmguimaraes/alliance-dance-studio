export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitError";
  }
}

type Bucket = {
  count: number;
  windowStartedAt: number;
  lastSeenAt: number;
};

export type RateLimiter = {
  consume: (key: string, now?: number) => void;
  clear: () => void;
};

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxEntries?: number;
}): RateLimiter {
  const { limit, windowMs, maxEntries = 10_000 } = options;
  const buckets = new Map<string, Bucket>();
  let operations = 0;

  if (!Number.isInteger(limit) || limit <= 0 || windowMs <= 0) {
    throw new Error("Rate limiter options are invalid.");
  }

  function prune(now: number): void {
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastSeenAt >= windowMs) buckets.delete(key);
    }

    if (buckets.size <= maxEntries) return;

    const oldest = [...buckets.entries()]
      .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)
      .slice(0, buckets.size - maxEntries);
    for (const [key] of oldest) buckets.delete(key);
  }

  return {
    consume(key: string, now: number = Date.now()): void {
      const safeKey = key.trim() || "unknown";
      operations += 1;
      if (operations % 100 === 0 || buckets.size > maxEntries) prune(now);

      const current = buckets.get(safeKey);
      if (!current || now - current.windowStartedAt >= windowMs) {
        buckets.set(safeKey, {
          count: 1,
          windowStartedAt: now,
          lastSeenAt: now,
        });
        return;
      }

      current.lastSeenAt = now;
      if (current.count >= limit) {
        const remaining = windowMs - (now - current.windowStartedAt);
        throw new RateLimitError(Math.max(1, Math.ceil(remaining / 1000)));
      }

      current.count += 1;
    },
    clear(): void {
      buckets.clear();
      operations = 0;
    },
  };
}
