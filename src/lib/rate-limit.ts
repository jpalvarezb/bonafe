/**
 * Minimal fixed-window in-memory rate limiter for API routes (per key —
 * usually the user id). Single-instance only: acceptable for the current
 * deployment shape; swap for Redis when scaling horizontally.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export function rateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// Opportunistic cleanup so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();
export function cleanupExpiredWindows(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, value] of windows) {
    if (value.resetAt <= now) windows.delete(key);
  }
}
