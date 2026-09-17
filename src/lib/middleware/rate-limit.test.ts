import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "@/lib/middleware/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("permite requisições dentro do limite", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 })).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 })).toBe(true);
  });

  it("bloqueia ao ultrapassar o limite", () => {
    const key = `test-${Math.random()}`;
    const cfg = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit(key, cfg)).toBe(true);
    expect(checkRateLimit(key, cfg)).toBe(false);
  });

  it("redefine a janela após o tempo de reset", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    const cfg = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit(key, cfg)).toBe(true);
    expect(checkRateLimit(key, cfg)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkRateLimit(key, cfg)).toBe(true);
  });
});
