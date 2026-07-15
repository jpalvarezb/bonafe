import { describe, expect, it } from "vitest";
import {
  buildPriceLookupKey,
  convertPlanPriceToLocal,
  isRateFresh,
  roundToCleanLocalPrice,
} from "../../src/lib/plan-pricing";

/**
 * Rounding policy under test (documented on roundToCleanLocalPrice itself
 * once implemented): converted local amounts are rounded UP ("no org ever
 * gets charged a psychologically-odd price like 3662.34") to
 *   - the nearest 10, when the amount is below 10,000
 *   - the nearest 100, when the amount is >= 10,000
 * All math via decimal.js — no float multiplication/division anywhere in
 * this module. No Stripe client, network, or DB access.
 */
describe("convertPlanPriceToLocal", () => {
  it("Semilla (100 USD) at 36.6234 NIO/USD rounds UP to the nearest 10 below 10,000", () => {
    // Hand-computed: 100 * 36.6234 = 3662.34 -> ceil to nearest 10 -> 3670.
    const result = convertPlanPriceToLocal("100.00", "36.6234");
    expect(result.localAmount).toBe("3670.00");
    expect(result.minorUnits).toBe(367000);
  });

  it("Cosecha (350 USD) at 511.7512 CRC/USD rounds UP to the nearest 100 at >= 10,000", () => {
    // Hand-computed: 350 * 511.7512 = 179112.92 -> ceil to nearest 100 -> 179200.
    const result = convertPlanPriceToLocal("350.00", "511.7512");
    expect(result.localAmount).toBe("179200.00");
    expect(result.minorUnits).toBe(17920000);
  });
});

describe("roundToCleanLocalPrice", () => {
  it("leaves an amount already on a clean multiple unchanged", () => {
    // Already a multiple of 10, below 10,000 -> unchanged.
    expect(roundToCleanLocalPrice("3670.00")).toBe("3670.00");
    // Already a multiple of 100, at >= 10,000 -> unchanged.
    expect(roundToCleanLocalPrice("179200.00")).toBe("179200.00");
  });
});

describe("isRateFresh", () => {
  const fetchedAt = new Date("2026-07-01T00:00:00.000Z");

  it("returns true at exactly 7 days old", () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    expect(isRateFresh(fetchedAt, now)).toBe(true);
  });

  it("returns false at 8 days old", () => {
    const now = new Date("2026-07-09T00:00:00.000Z");
    expect(isRateFresh(fetchedAt, now)).toBe(false);
  });
});

describe("buildPriceLookupKey", () => {
  it("builds a deterministic, lowercase Stripe price lookup key", () => {
    expect(buildPriceLookupKey("semilla", "NIO")).toBe(
      "agropeq_semilla_nio_monthly",
    );
  });
});
