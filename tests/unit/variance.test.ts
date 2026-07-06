import { describe, expect, it } from "vitest";
import { buildVarianceReport } from "../../src/lib/calc/variance";

describe("buildVarianceReport", () => {
  it("computes per-cell variance and percentage", () => {
    const report = buildVarianceReport(
      [{ month: 1, category: "labor", amount: "200.00" }],
      [{ month: 1, category: "labor", amount: "250.00" }],
    );
    expect(report.cells).toHaveLength(1);
    expect(report.cells[0]).toMatchObject({
      month: 1,
      category: "labor",
      budget: "200.0000",
      actual: "250.0000",
      variance: "50.0000",
      variancePct: "25.00",
    });
  });

  it("surfaces unbudgeted spend and unspent budget", () => {
    const report = buildVarianceReport(
      [{ month: 2, category: "input", amount: "100.00" }],
      [{ month: 3, category: "machine", amount: "40.00" }],
    );
    const input = report.cells.find((c) => c.category === "input");
    const machine = report.cells.find((c) => c.category === "machine");
    expect(input).toMatchObject({ actual: "0.0000", variance: "-100.0000" });
    expect(machine).toMatchObject({
      budget: "0.0000",
      variance: "40.0000",
      variancePct: null, // no % against a zero budget
    });
  });

  it("aggregates duplicate month/category rows and totals", () => {
    const report = buildVarianceReport(
      [
        { month: 1, category: "labor", amount: "100.00" },
        { month: 1, category: "labor", amount: "50.00" },
        { month: 2, category: "labor", amount: "150.00" },
      ],
      [
        { month: 1, category: "labor", amount: "120.00" },
        { month: 2, category: "labor", amount: "180.00" },
      ],
    );
    const total = report.categoryTotals.find((t) => t.category === "labor")!;
    expect(total.budget).toBe("300.0000");
    expect(total.actual).toBe("300.0000");
    expect(total.variance).toBe("0.0000");
    expect(report.totalBudget).toBe("300.0000");
    expect(report.totalVariance).toBe("0.0000");
  });

  it("skips all-zero cells and keeps decimal precision", () => {
    const report = buildVarianceReport(
      [{ month: 1, category: "other", amount: "0.10" }],
      [
        { month: 1, category: "other", amount: "0.20" },
        { month: 1, category: "other", amount: "0.10" },
      ],
    );
    expect(report.cells).toHaveLength(1);
    expect(report.cells[0].actual).toBe("0.3000"); // no float drift
    expect(report.cells[0].variancePct).toBe("200.00");
  });
});
