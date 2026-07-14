import { describe, expect, it } from "vitest";
import {
  computeCycleProfitability,
  groupPieceworkByCycle,
  processingYieldPct,
  resolveSaleCycle,
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

describe("groupPieceworkByCycle", () => {
  it("sums attributed entries per cycle and separates unattributed ones", () => {
    const result = groupPieceworkByCycle([
      { cropCycleId: "c1", amount: "100.00" },
      { cropCycleId: "c1", amount: "50.50" },
      { cropCycleId: null, amount: "25.00" },
    ]);

    expect(result.byCycle.get("c1")).toBe("150.50");
    expect(result.unattributed).toBe("25.00");
  });

  it("feeds computeCycleProfitability's pieceworkCosts param directly", () => {
    const grouped = groupPieceworkByCycle([
      { cropCycleId: "c1", amount: "150.00" },
    ]);

    const result = computeCycleProfitability({
      salesIncome: ["800.00"],
      activityCosts: ["300.00"],
      processingCosts: ["100.00"],
      pieceworkCosts: [grouped.byCycle.get("c1") ?? "0"],
    });
    expect(result.pieceworkCost).toBe("150.0000");
    expect(result.totalCost).toBe("550.0000");
  });

  it("returns an empty map and zero unattributed for no entries", () => {
    const result = groupPieceworkByCycle([]);
    expect(result.byCycle.size).toBe(0);
    expect(result.unattributed).toBe("0.00");
  });

  it("reconciles the seeded Café 2026-A fixture (2 corte attributed, 1 chapoda not)", () => {
    // Mirrors src/scripts/seed.ts seedPiecework: José 40 lata @1.10 = 44.00
    // and Rosa 35 lata @1.10 = 38.50 on the cycle; Ana 50 surcos @0.80 =
    // 40.00 unattributed.
    const result = groupPieceworkByCycle([
      { cropCycleId: "cycle-cafe-a", amount: "44.0000" },
      { cropCycleId: "cycle-cafe-a", amount: "38.5000" },
      { cropCycleId: null, amount: "40.0000" },
    ]);
    expect(result.byCycle.get("cycle-cafe-a")).toBe("82.50");
    expect(result.unattributed).toBe("40.00");
  });
});

describe("resolveSaleCycle", () => {
  it("prefers the processing run's own cropCycleId when present", () => {
    const result = resolveSaleCycle({
      manualCropCycleId: "c1",
      processingRun: {
        cropCycleId: "c1",
        harvestLot: { cropCycleId: "c2" },
      },
    });
    expect(result.cropCycleId).toBe("c1");
    expect(result.source).toBe("processing_run");
    expect(result.mismatch).toBe(false);
  });

  it("falls back to the harvest lot's cycle when the run has no cropCycleId", () => {
    const result = resolveSaleCycle({
      manualCropCycleId: "c2",
      processingRun: {
        cropCycleId: null,
        harvestLot: { cropCycleId: "c2" },
      },
    });
    expect(result.cropCycleId).toBe("c2");
    expect(result.source).toBe("harvest_lot");
    expect(result.mismatch).toBe(false);
  });

  it("accepts the manual tag when there is no processing-run chain at all", () => {
    const result = resolveSaleCycle({
      manualCropCycleId: "c3",
      processingRun: null,
    });
    expect(result.cropCycleId).toBe("c3");
    expect(result.source).toBe("manual");
    expect(result.mismatch).toBe(false);
  });

  it("flags a mismatch when the manual tag contradicts the chain-derived cycle", () => {
    const result = resolveSaleCycle({
      manualCropCycleId: "c-wrong",
      processingRun: {
        cropCycleId: "c1",
        harvestLot: null,
      },
    });
    expect(result.cropCycleId).toBe("c1"); // chain wins over a bad manual tag
    expect(result.source).toBe("processing_run");
    expect(result.mismatch).toBe(true);
  });
});
