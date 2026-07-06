import Decimal from "decimal.js";

/**
 * Payroll book math. Pure — attendance rows in, amounts out; all money as
 * strings (numeric columns), Decimal for the arithmetic.
 *
 * Rules:
 *  - present = 1 day, half_day = 0.5 day; absent/sick/leave pay nothing.
 *  - hoursWorked are overtime hours on top of the day, paid at the hourly
 *    rate snapshot, and only counted on paid days (present/half_day).
 *  - Rate snapshots live on each attendance row so historic payrolls are
 *    immune to later worker-rate edits.
 */

export type AttendanceStatus =
  | "present"
  | "half_day"
  | "absent"
  | "sick"
  | "leave";

export type AttendanceLine = {
  status: AttendanceStatus;
  hoursWorked?: string | number | null;
  dailyRateSnapshot: string | number;
  hourlyRateSnapshot: string | number;
};

export type PayrollEntryInput = {
  attendance: AttendanceLine[];
  pieceworkAmount?: string | number;
  bonuses?: string | number;
  deductions?: string | number;
};

export type PayrollEntryTotals = {
  daysWorked: string; // 2 decimals
  hoursWorked: string; // 2 decimals
  baseAmount: string;
  overtimeAmount: string;
  pieceworkAmount: string;
  bonuses: string;
  deductions: string;
  netAmount: string;
};

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

export function daysForStatus(status: AttendanceStatus): Decimal {
  if (status === "present") return new Decimal(1);
  if (status === "half_day") return new Decimal(0.5);
  return new Decimal(0);
}

export function computePayrollEntry(
  input: PayrollEntryInput,
): PayrollEntryTotals {
  let daysWorked = new Decimal(0);
  let hoursWorked = new Decimal(0);
  let baseAmount = new Decimal(0);
  let overtimeAmount = new Decimal(0);

  for (const line of input.attendance) {
    const days = daysForStatus(line.status);
    if (days.isZero()) continue;
    daysWorked = daysWorked.add(days);
    baseAmount = baseAmount.add(days.mul(d(line.dailyRateSnapshot)));
    const hours = d(line.hoursWorked);
    if (!hours.isZero()) {
      hoursWorked = hoursWorked.add(hours);
      overtimeAmount = overtimeAmount.add(
        hours.mul(d(line.hourlyRateSnapshot)),
      );
    }
  }

  const pieceworkAmount = d(input.pieceworkAmount);
  const bonuses = d(input.bonuses);
  const deductions = d(input.deductions);
  const netAmount = baseAmount
    .add(overtimeAmount)
    .add(pieceworkAmount)
    .add(bonuses)
    .sub(deductions);

  return {
    daysWorked: daysWorked.toFixed(2),
    hoursWorked: hoursWorked.toFixed(2),
    baseAmount: baseAmount.toFixed(4),
    overtimeAmount: overtimeAmount.toFixed(4),
    pieceworkAmount: pieceworkAmount.toFixed(4),
    bonuses: bonuses.toFixed(4),
    deductions: deductions.toFixed(4),
    netAmount: netAmount.toFixed(4),
  };
}

/** Sum of entry net amounts — the period's denormalized total. */
export function periodTotal(entries: Array<{ netAmount: string }>): string {
  return entries
    .reduce((sum, entry) => sum.add(d(entry.netAmount)), new Decimal(0))
    .toFixed(4);
}
