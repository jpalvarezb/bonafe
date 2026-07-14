import { describe, expect, it, vi } from "vitest";
import {
  computeRateToBase,
  fetchAndValidateFxRates,
  fxFeedResponseSchema,
  type FxFeedResponse,
} from "../../src/lib/fx-rates";

/**
 * Fixture shaped like a real open.er-api.com/v6/latest/USD response: a
 * USD-quoted feed (base_code "USD", rates are "1 USD = N <code>"). Covers
 * every currency code in src/lib/currency.ts plus USD itself (which the
 * feed includes at 1, self-referentially).
 */
const validPayload = {
  result: "success",
  provider: "https://www.exchangerate-api.com",
  documentation: "https://www.exchangerate-api.com/docs/free",
  terms_of_use: "https://www.exchangerate-api.com/terms",
  time_last_update_unix: 1690000000,
  time_last_update_utc: "Fri, 21 Jul 2023 00:00:01 +0000",
  time_next_update_unix: 1690086400,
  time_next_update_utc: "Sat, 22 Jul 2023 00:00:00 +0000",
  base_code: "USD",
  rates: {
    USD: 1,
    NIO: 36.62,
    GTQ: 7.79,
    HNL: 24.75,
    CRC: 511.7512,
    COP: 4100.5,
    MXN: 18.1,
    EUR: 0.92,
  },
} satisfies Record<string, unknown>;

describe("computeRateToBase", () => {
  // The org_exchange_rates.rate_to_base column doc comment (src/lib/db/
  // schema/billing.ts) and latestRateToBaseInTx (src/server/services/
  // exchange-rates.ts) agree: "multiply an amount in currency_code by this
  // to get base currency." computeRateToBase must produce that same
  // multiplier, cross-rated from a single USD-quoted feed.

  it("USD row in a NIO-base org: rateToBase = feed.rates.NIO / feed.rates.USD", () => {
    // Hand-computed: 36.62 / 1 = 36.62 exactly, formatted to 8dp.
    expect(computeRateToBase(validPayload.rates, "USD", "NIO")).toBe(
      "36.62000000",
    );
  });

  it("NIO row in a EUR-base org: rateToBase = feed.rates.EUR / feed.rates.NIO", () => {
    // Hand-computed: 0.92 / 36.62 = 0.02512288367... -> 8dp -> 0.02512288.
    expect(computeRateToBase(validPayload.rates, "NIO", "EUR")).toBe(
      "0.02512288",
    );
  });

  it("direction matches what latestRateToBaseInTx / sales.ts expect: amount_in_currency * rateToBase = amount_in_base", () => {
    // USD -> NIO: multiplying by the rate must scale UP (1 USD is worth
    // many NIO), not down.
    const usdToNio = Number(computeRateToBase(validPayload.rates, "USD", "NIO"));
    expect(100 * usdToNio).toBeCloseTo(3662, 0);
    expect(usdToNio).toBeGreaterThan(1);

    // NIO -> EUR: multiplying by the rate must scale DOWN (1 NIO is worth a
    // small fraction of a EUR), the opposite direction from the case above.
    const nioToEur = Number(computeRateToBase(validPayload.rates, "NIO", "EUR"));
    expect(100 * nioToEur).toBeCloseTo(2.512288, 5);
    expect(nioToEur).toBeLessThan(1);
  });

  it("CRC row in a USD-base org: rateToBase = feed.rates.USD / feed.rates.CRC", () => {
    // Hand-computed: 1 / 511.7512 = 0.00195407... -> 8dp -> 0.00195407.
    expect(computeRateToBase(validPayload.rates, "CRC", "USD")).toBe(
      "0.00195407",
    );
  });

  it("output is always fixed to 8 decimal places, even for exact ratios", () => {
    // 1 / 1 = 1 exactly, still rendered as "1.00000000" (numeric(18,8)).
    expect(computeRateToBase(validPayload.rates, "USD", "USD")).toBe(
      "1.00000000",
    );
  });

  it("throws (fails loudly) rather than silently skipping a currency missing from the feed", () => {
    const partial = { USD: 1, NIO: 36.62 };
    expect(() => computeRateToBase(partial, "EUR", "NIO")).toThrow(
      /missing rate for currency EUR/,
    );
    expect(() => computeRateToBase(partial, "USD", "GTQ")).toThrow(
      /missing rate for base currency GTQ/,
    );
  });
});

describe("fxFeedResponseSchema", () => {
  it("accepts a valid open.er-api-shaped payload", () => {
    const parsed = fxFeedResponseSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.base_code).toBe("USD");
      expect(parsed.data.rates.NIO).toBe(36.62);
    }
  });

  it("rejects a payload whose result is not 'success'", () => {
    const parsed = fxFeedResponseSchema.safeParse({
      ...validPayload,
      result: "error",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a payload with a non-numeric rate", () => {
    const parsed = fxFeedResponseSchema.safeParse({
      ...validPayload,
      rates: { ...validPayload.rates, NIO: "36.62" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("fetchAndValidateFxRates", () => {
  it("resolves via an injected provider function — no fetch is ever called", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = vi.fn(async () => validPayload as unknown);

    const result: FxFeedResponse = await fetchAndValidateFxRates(provider);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(result.rates.NIO).toBe(36.62);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("rejects (throws) when the injected provider resolves invalid shape", async () => {
    const provider = vi.fn(async () => ({ result: "error" }) as unknown);
    await expect(fetchAndValidateFxRates(provider)).rejects.toThrow();
  });
});
