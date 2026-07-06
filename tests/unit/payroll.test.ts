import { describe, expect, it } from "vitest";
import {
  computePayrollEntry,
  periodTotal,
  type AttendanceLine,
} from "../../src/lib/calc/payroll";

const line = (
  status: AttendanceLine["status"],
  overrides: Partial<AttendanceLine> = {},
): AttendanceLine => ({
  status,
  dailyRateSnapshot: "10.00",
  hourlyRateSnapshot: "1.50",
  hoursWorked: null,
  ...overrides,
});

describe("computePayrollEntry", () => {
  it("pays full days at the daily rate snapshot", () => {
    const totals = computePayrollEntry({
      attendance: [line("present"), line("present"), line("present")],
    });
    expect(totals.daysWorked).toBe("3.00");
    expect(totals.baseAmount).toBe("30.0000");
    expect(totals.netAmount).toBe("30.0000");
  });

  it("counts half days as 0.5 and skips absent/sick/leave", () => {
    const totals = computePayrollEntry({
      attendance: [
        line("present"),
        line("half_day"),
        line("absent"),
        line("sick"),
        line("leave"),
      ],
    });
    expect(totals.daysWorked).toBe("1.50");
    expect(totals.baseAmount).toBe("15.0000");
  });

  it("pays overtime hours at the hourly snapshot on paid days only", () => {
    const totals = computePayrollEntry({
      attendance: [
        line("present", { hoursWorked: "2" }),
        line("half_day", { hoursWorked: "1.5" }),
        line("absent", { hoursWorked: "4" }), // unpaid day: hours ignored
      ],
    });
    expect(totals.hoursWorked).toBe("3.50");
    expect(totals.overtimeAmount).toBe("5.2500");
    expect(totals.netAmount).toBe("20.2500");
  });

  it("uses per-row rate snapshots, not a single worker rate", () => {
    const totals = computePayrollEntry({
      attendance: [
        line("present", { dailyRateSnapshot: "10.00" }),
        line("present", { dailyRateSnapshot: "12.00" }), // raise mid-period
      ],
    });
    expect(totals.baseAmount).toBe("22.0000");
  });

  it("applies piecework, bonuses and deductions to the net", () => {
    // Hand-computed fortnight fixture (mirrors the seed):
    // 10 present + 1 half day @ 10.00 = 105.00; 5h overtime @ 1.50 = 7.50
    // + bonus 5.00 − deduction 3.50 = 114.00
    const attendance = [
      ...Array.from({ length: 10 }, () => line("present")),
      line("half_day"),
      line("absent"),
      line("absent"),
      line("sick"),
    ];
    attendance[0] = line("present", { hoursWorked: "3" });
    attendance[1] = line("present", { hoursWorked: "2" });
    const totals = computePayrollEntry({
      attendance,
      bonuses: "5.00",
      deductions: "3.50",
    });
    expect(totals.daysWorked).toBe("10.50");
    expect(totals.baseAmount).toBe("105.0000");
    expect(totals.overtimeAmount).toBe("7.5000");
    expect(totals.netAmount).toBe("114.0000");
  });

  it("never loses cents to float math", () => {
    const totals = computePayrollEntry({
      attendance: Array.from({ length: 3 }, () =>
        line("present", { dailyRateSnapshot: "0.10" }),
      ),
    });
    expect(totals.baseAmount).toBe("0.3000"); // 0.1*3 !== 0.30000000000000004
  });
});

describe("periodTotal", () => {
  it("sums entry nets", () => {
    expect(
      periodTotal([
        { netAmount: "114.0000" },
        { netAmount: "80.5000" },
        { netAmount: "0.0000" },
      ]),
    ).toBe("194.5000");
  });
});
