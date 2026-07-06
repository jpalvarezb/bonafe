import { describe, expect, it } from "vitest";
import {
  applyMovement,
  computeStock,
  EMPTY_STOCK,
} from "../../src/lib/calc/inventory";

describe("weighted-average valuation", () => {
  it("re-weights the average on each purchase", () => {
    const state = computeStock([
      { quantity: "10", unitCost: "2.00" },
      { quantity: "10", unitCost: "3.00" },
    ]);
    expect(state.quantity).toBe("20.0000");
    expect(state.avgUnitCost).toBe("2.5000");
    expect(state.totalValue).toBe("50.0000");
  });

  it("values consumption at the running average without changing it", () => {
    const state = computeStock([
      { quantity: "10", unitCost: "2.00" },
      { quantity: "10", unitCost: "3.00" },
      { quantity: "-8" }, // outbound: no unitCost
    ]);
    expect(state.quantity).toBe("12.0000");
    expect(state.avgUnitCost).toBe("2.5000");
    expect(state.totalValue).toBe("30.0000");
  });

  it("enters costless inbound adjustments at the current average", () => {
    const state = computeStock([
      { quantity: "10", unitCost: "2.50" },
      { quantity: "5" }, // adjustment_in, no cost captured
    ]);
    expect(state.quantity).toBe("15.0000");
    expect(state.avgUnitCost).toBe("2.5000");
    expect(state.totalValue).toBe("37.5000");
  });

  it("keeps the average through zero and negative stock", () => {
    const afterOverdraw = computeStock([
      { quantity: "5", unitCost: "4.00" },
      { quantity: "-7" },
    ]);
    expect(afterOverdraw.quantity).toBe("-2.0000");
    expect(afterOverdraw.avgUnitCost).toBe("4.0000");
    expect(afterOverdraw.totalValue).toBe("-8.0000");

    // Late-arriving purchase reconciles the ledger.
    const reconciled = applyMovement(afterOverdraw, {
      quantity: "10",
      unitCost: "4.00",
    });
    expect(reconciled.quantity).toBe("8.0000");
    expect(reconciled.totalValue).toBe("32.0000");
  });

  it("ignores zero-quantity movements and starts from EMPTY_STOCK", () => {
    expect(applyMovement(EMPTY_STOCK, { quantity: "0" })).toBe(EMPTY_STOCK);
    expect(computeStock([]).quantity).toBe("0.0000");
  });

  it("handles fractional quantities without float drift", () => {
    const state = computeStock([
      { quantity: "0.1", unitCost: "3.00" },
      { quantity: "0.2", unitCost: "3.00" },
    ]);
    expect(state.quantity).toBe("0.3000");
    expect(state.totalValue).toBe("0.9000");
  });
});
