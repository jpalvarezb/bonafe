import Decimal from "decimal.js";

/** Money values travel as strings (numeric columns); Decimal for all math. */

export type InputLine = {
  quantity: string | number;
  unitCost: string | number;
};

export type LaborLine = {
  workersCount: number;
  hours?: string | number | null;
  /** Piecework units (e.g. bags picked); rate is the per-unit piece rate. */
  quantity?: string | number | null;
  rateType: "daily" | "hourly" | "piecework";
  rate: string | number;
};

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

export function inputLineTotal(line: InputLine): string {
  return d(line.quantity).mul(d(line.unitCost)).toFixed(4);
}

/**
 * daily:     workers × rate (rate = per worker-day)
 * hourly:    workers × hours × rate
 * piecework: quantity × rate — mirrors createPieceworkEntry's
 *            quantity × rateSnapshot model (src/server/services/piecework.ts),
 *            NOT workers × rate.
 */
export function laborLineAmount(line: LaborLine): string {
  const workers = d(line.workersCount);
  const rate = d(line.rate);
  if (line.rateType === "hourly") {
    return workers.mul(d(line.hours)).mul(rate).toFixed(4);
  }
  if (line.rateType === "piecework") {
    return d(line.quantity).mul(rate).toFixed(4);
  }
  return workers.mul(rate).toFixed(4);
}

export type ActivityCostInput = {
  inputs: InputLine[];
  labor: LaborLine[];
  machineCost?: string | number;
  otherCost?: string | number;
};

export type ActivityCostTotals = {
  inputCost: string;
  laborCost: string;
  machineCost: string;
  otherCost: string;
  totalCost: string;
  inputTotals: string[];
  laborAmounts: string[];
};

export function computeActivityTotals(
  input: ActivityCostInput,
): ActivityCostTotals {
  const inputTotals = input.inputs.map(inputLineTotal);
  const laborAmounts = input.labor.map(laborLineAmount);

  const inputCost = inputTotals.reduce(
    (sum, total) => sum.add(d(total)),
    new Decimal(0),
  );
  const laborCost = laborAmounts.reduce(
    (sum, amount) => sum.add(d(amount)),
    new Decimal(0),
  );
  const machineCost = d(input.machineCost);
  const otherCost = d(input.otherCost);
  const totalCost = inputCost.add(laborCost).add(machineCost).add(otherCost);

  return {
    inputCost: inputCost.toFixed(4),
    laborCost: laborCost.toFixed(4),
    machineCost: machineCost.toFixed(4),
    otherCost: otherCost.toFixed(4),
    totalCost: totalCost.toFixed(4),
    inputTotals,
    laborAmounts,
  };
}

/** Cost per hectare; null when the area is missing or zero. */
export function costPerHa(
  totalCost: string | number,
  areaHa: string | number | null | undefined,
): string | null {
  const area = d(areaHa);
  if (area.isZero()) return null;
  return d(totalCost).div(area).toFixed(4);
}
