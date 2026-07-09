import { describe, expect, it } from "vitest";
import { planningWindowMonths } from "../../src/server/reports/cockpit";

// Pure function test — planningWindowMonths does no db/RLS work, so this
// runs under plain vitest (mirrors nav-structure.test.ts / payroll.test.ts).

describe("planningWindowMonths", () => {
  it("returns a single tuple when the 14-day window stays in the same month", () => {
    const today = new Date("2026-07-09T00:00:00Z"); // 14 days later = Jul 23
    expect(planningWindowMonths(today)).toEqual([{ year: 2026, month: 7 }]);
  });

  it("returns two tuples when the window crosses a month boundary", () => {
    const today = new Date("2026-07-25T00:00:00Z"); // +14d = Aug 8
    expect(planningWindowMonths(today)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("rolls Dec -> Jan of the next year", () => {
    const today = new Date("2026-12-22T00:00:00Z"); // +14d = 2027-01-05
    expect(planningWindowMonths(today)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it("stays a single tuple right at month start (window fits within the month)", () => {
    const today = new Date("2026-02-01T00:00:00Z"); // +14d = Feb 15
    expect(planningWindowMonths(today)).toEqual([{ year: 2026, month: 2 }]);
  });

  // These two pin the window WIDTH itself (exactly today+14, inclusive): a
  // 13- or 15-day window would flip one of them.
  it("window ending exactly on the last day of the month stays a single tuple", () => {
    const today = new Date("2026-07-17T00:00:00Z"); // +14d = Jul 31
    expect(planningWindowMonths(today)).toEqual([{ year: 2026, month: 7 }]);
  });

  it("window ending exactly on the 1st of the next month yields two tuples", () => {
    const today = new Date("2026-07-18T00:00:00Z"); // +14d = Aug 1
    expect(planningWindowMonths(today)).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });
});
