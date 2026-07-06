import { describe, expect, it } from "vitest";
import {
  computeCycleProfitability,
  processingYieldPct,
} from "../../src/lib/calc/profitability";

describe("computeCycleProfitability", () => {
  it("reconciles the canonical 1000 kg cherry → 200 kg parchment fixture", () => {
    // 1000 kg cherry picked (piecework 150.00), field activities 300.00,
    // processing to 200 kg parchment costs 100.00; sold 200 kg @ 4.00 = 800.
    const result = computeCycleProfitability({
      salesIncome: ["800.00"],
      activityCosts: ["120.00", "180.00"],
      processingCosts: ["100.00"],
      pieceworkCosts: ["150.00"],
      areaHa: "5",
      outputQuantity: "200",
    });
    expect(result.income).toBe("800.0000");
    expect(result.totalCost).toBe("550.0000");
    expect(result.profit).toBe("250.0000");
    expect(result.marginPct).toBe("31.25");
    expect(result.costPerHa).toBe("110.0000");
    expect(result.profitPerHa).toBe("50.0000");
    expect(result.costPerUnit).toBe("2.7500"); // per kg parchment
    expect(result.profitPerUnit).toBe("1.2500");
  });

  it("handles a loss-making cycle and missing denominators", () => {
    const result = computeCycleProfitability({
      salesIncome: [],
      activityCosts: ["100.00"],
      processingCosts: [],
      pieceworkCosts: [],
    });
    expect(result.profit).toBe("-100.0000");
    expect(result.marginPct).toBeNull(); // no income
    expect(result.costPerHa).toBeNull();
    expect(result.profitPerUnit).toBeNull();
  });

  it("keeps decimal precision on many small amounts", () => {
    const result = computeCycleProfitability({
      salesIncome: Array.from({ length: 10 }, () => "0.10"),
      activityCosts: ["0.30"],
      processingCosts: ["0.30"],
      pieceworkCosts: ["0.10"],
    });
    expect(result.income).toBe("1.0000");
    expect(result.totalCost).toBe("0.7000");
    expect(result.profit).toBe("0.3000");
    expect(result.marginPct).toBe("30.00");
  });
});

describe("processingYieldPct", () => {
  it("computes the cherry→parchment yield", () => {
    expect(processingYieldPct("1000", "200")).toBe("20.00");
  });
  it("returns null on zero input", () => {
    expect(processingYieldPct("0", "10")).toBeNull();
  });
});
