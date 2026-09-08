import { describe, expect, it } from "vitest";
import {
  createFixedWindowRateLimiter,
  RateLimitError,
} from "./rateLimit";

describe("fixed-window rate limiter", () => {
  it("limits a key and resets after the window", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.consume("client", 0);
    limiter.consume("client", 1);
    expect(() => limiter.consume("client", 2)).toThrow(RateLimitError);
    expect(() => limiter.consume("client", 1000)).not.toThrow();
  });

  it("keeps independent counters per client", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.consume("a", 0);
    expect(() => limiter.consume("b", 0)).not.toThrow();
    expect(() => limiter.consume("a", 1)).toThrow(RateLimitError);
  });
});
