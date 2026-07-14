import { describe, expect, it } from "vitest";
import {
  computeActivityTotals,
  costPerHa,
  inputLineTotal,
  laborLineAmount,
} from "../../src/lib/calc/costs";

describe("inputLineTotal", () => {
  it("multiplies quantity by unit cost", () => {
    expect(inputLineTotal({ quantity: "2.5", unitCost: "10" })).toBe(
      "25.0000",
    );
  });

  it("avoids float drift", () => {
    expect(inputLineTotal({ quantity: "0.1", unitCost: "0.2" })).toBe(
      "0.0200",
    );
  });
});

describe("laborLineAmount", () => {
  it("daily: workers × rate", () => {
    expect(
      laborLineAmount({ workersCount: 4, rateType: "daily", rate: "250" }),
    ).toBe("1000.0000");
  });

  it("hourly: workers × hours × rate", () => {
    expect(
      laborLineAmount({
        workersCount: 2,
        hours: "6.5",
        rateType: "hourly",
        rate: "40",
      }),
    ).toBe("520.0000");
  });

  it("hourly with missing hours yields zero", () => {
    expect(
      laborLineAmount({ workersCount: 2, rateType: "hourly", rate: "40" }),
    ).toBe("0.0000");
  });

  it("piecework: quantity × rate (matches createPieceworkEntry's quantity × rateSnapshot model)", () => {
    // Real fixture: 250 units of piecework @ 0.85 per unit = 212.50, NOT
    // workers × rate (which would wrongly give 1 × 0.85 = 0.85). LaborLine
    // has no `quantity` field yet, so this does not even typecheck today —
    // that is the point: piecework cannot be modeled until it's added.
    expect(
      laborLineAmount({
        workersCount: 1,
        rateType: "piecework",
        rate: "0.85",
        quantity: "250",
      }),
    ).toBe("212.5000");
  });
});

describe("computeActivityTotals", () => {
  it("sums inputs, labor, machine and other into total", () => {
    const totals = computeActivityTotals({
      inputs: [
        { quantity: "2", unitCost: "150" }, // 300
        { quantity: "0.5", unitCost: "80" }, // 40
      ],
      labor: [
        { workersCount: 3, rateType: "daily", rate: "200" }, // 600
        { workersCount: 1, hours: "4", rateType: "hourly", rate: "50" }, // 200
      ],
      machineCost: "75.5",
      otherCost: "10",
    });

    expect(totals.inputCost).toBe("340.0000");
    expect(totals.laborCost).toBe("800.0000");
    expect(totals.machineCost).toBe("75.5000");
    expect(totals.otherCost).toBe("10.0000");
    expect(totals.totalCost).toBe("1225.5000");
    expect(totals.inputTotals).toEqual(["300.0000", "40.0000"]);
    expect(totals.laborAmounts).toEqual(["600.0000", "200.0000"]);
  });

  it("handles empty lines", () => {
    const totals = computeActivityTotals({ inputs: [], labor: [] });
    expect(totals.totalCost).toBe("0.0000");
  });

  it("mixes daily, hourly and piecework labor lines with real piecework math", () => {
    // daily:     2 workers × 15.00           = 30.0000
    // hourly:    1 worker × 4h × 3.50         = 14.0000
    // piecework: 100 units × 0.85 per unit    = 85.0000
    // laborCost = 30 + 14 + 85 = 129.0000
    const totals = computeActivityTotals({
      inputs: [],
      labor: [
        { workersCount: 2, rateType: "daily", rate: "15.00" },
        { workersCount: 1, hours: "4", rateType: "hourly", rate: "3.50" },
        { workersCount: 1, rateType: "piecework", rate: "0.85", quantity: "100" },
      ],
    });

    expect(totals.laborAmounts).toEqual([
      "30.0000",
      "14.0000",
      "85.0000",
    ]);
    expect(totals.laborCost).toBe("129.0000");
    expect(totals.totalCost).toBe("129.0000");
  });
});

describe("costPerHa", () => {
  it("divides by area", () => {
    expect(costPerHa("1000", "2.5")).toBe("400.0000");
  });

  it("returns null for zero or missing area", () => {
    expect(costPerHa("1000", "0")).toBeNull();
    expect(costPerHa("1000", null)).toBeNull();
  });
});
