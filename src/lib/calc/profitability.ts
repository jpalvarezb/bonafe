import Decimal from "decimal.js";

/**
 * Per-cycle profitability. Pure — all inputs already converted to the org
 * base currency by the callers (× exchange-rate snapshots); strings in,
 * strings out, Decimal math.
 */

export type CycleProfitabilityInput = {
  /** Sale totals attributed to the cycle. */
  salesIncome: Array<string | number>;
  /** Activity total costs (labor+inputs+machine+other). */
  activityCosts: Array<string | number>;
  /** Direct processing-run costs. */
  processingCosts: Array<string | number>;
  /** Piecework amounts attributed to the cycle. */
  pieceworkCosts: Array<string | number>;
  /** Planted hectares, for per-ha metrics. */
  areaHa?: string | number | null;
  /** Final output (e.g. kg parchment), for per-unit metrics. */
  outputQuantity?: string | number | null;
};

export type CycleProfitability = {
  income: string;
  activityCost: string;
  processingCost: string;
  pieceworkCost: string;
  totalCost: string;
  profit: string;
  /** profit / income × 100; null when there is no income. */
  marginPct: string | null;
  costPerHa: string | null;
  incomePerHa: string | null;
  profitPerHa: string | null;
  costPerUnit: string | null;
  profitPerUnit: string | null;
};

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

const sum = (values: Array<string | number>) =>
  values.reduce((acc, v) => acc.add(d(v)), new Decimal(0));

export function computeCycleProfitability(
  input: CycleProfitabilityInput,
): CycleProfitability {
  const income = sum(input.salesIncome);
  const activityCost = sum(input.activityCosts);
  const processingCost = sum(input.processingCosts);
  const pieceworkCost = sum(input.pieceworkCosts);
  const totalCost = activityCost.add(processingCost).add(pieceworkCost);
  const profit = income.sub(totalCost);

  const area = d(input.areaHa);
  const output = d(input.outputQuantity);
  const perHa = (value: Decimal) =>
    area.isZero() ? null : value.div(area).toFixed(4);
  const perUnit = (value: Decimal) =>
    output.isZero() ? null : value.div(output).toFixed(4);

  return {
    income: income.toFixed(4),
    activityCost: activityCost.toFixed(4),
    processingCost: processingCost.toFixed(4),
    pieceworkCost: pieceworkCost.toFixed(4),
    totalCost: totalCost.toFixed(4),
    profit: profit.toFixed(4),
    marginPct: income.isZero()
      ? null
      : profit.div(income).mul(100).toFixed(2),
    costPerHa: perHa(totalCost),
    incomePerHa: perHa(income),
    profitPerHa: perHa(profit),
    costPerUnit: perUnit(totalCost),
    profitPerUnit: perUnit(profit),
  };
}

/** Yield ratio of a processing run (output/input × 100). */
export function processingYieldPct(
  inputQuantity: string | number,
  outputQuantity: string | number,
): string | null {
  const input = d(inputQuantity);
  if (input.isZero()) return null;
  return d(outputQuantity).div(input).mul(100).toFixed(2);
}

export type PieceworkCycleRow = {
  cropCycleId: string | null;
  amount: string | number;
};

export type GroupedPiecework = {
  /** Sum of amounts per attributed cycle. Feeds computeCycleProfitability's pieceworkCosts param. */
  byCycle: Map<string, string>;
  /** Sum of amounts with no cropCycleId (org-wide unattributed footnote). */
  unattributed: string;
};

/**
 * Pure fold: groups piecework entry amounts by crop cycle, separating out
 * entries with no cropCycleId (still-unattributed org-wide footnote).
 */
export function groupPieceworkByCycle(
  rows: PieceworkCycleRow[],
): GroupedPiecework {
  const byCycle = new Map<string, Decimal>();
  let unattributed = new Decimal(0);

  for (const row of rows) {
    const amount = d(row.amount);
    if (row.cropCycleId) {
      const prev = byCycle.get(row.cropCycleId) ?? new Decimal(0);
      byCycle.set(row.cropCycleId, prev.add(amount));
    } else {
      unattributed = unattributed.add(amount);
    }
  }

  const byCycleStrings = new Map<string, string>();
  for (const [cycleId, total] of byCycle) {
    byCycleStrings.set(cycleId, total.toFixed(2));
  }

  return { byCycle: byCycleStrings, unattributed: unattributed.toFixed(2) };
}

export type ResolveSaleCycleProcessingRun = {
  cropCycleId: string | null;
  harvestLot: { cropCycleId: string } | null;
} | null;

export type ResolveSaleCycleInput = {
  /** Manually-tagged cropCycleId on the sale, if any. */
  manualCropCycleId: string | null;
  /** The linked processing run (with its harvest lot), if any. */
  processingRun: ResolveSaleCycleProcessingRun;
};

export type ResolveSaleCycleResult = {
  cropCycleId: string | null;
  source: "processing_run" | "harvest_lot" | "manual";
  /** True when a manual tag contradicts the chain-derived cycle (chain wins). */
  mismatch: boolean;
};

/**
 * Pure decision: derive a sale's crop cycle through the processing-run →
 * harvest-lot chain when available, falling back to the manual tag only
 * when there is no chain to derive from. A chain-derived cycle always wins
 * over a conflicting manual tag, but the conflict is flagged via `mismatch`
 * so callers can reject/report it instead of silently overwriting.
 */
export function resolveSaleCycle(
  input: ResolveSaleCycleInput,
): ResolveSaleCycleResult {
  const { manualCropCycleId, processingRun } = input;

  const derived = processingRun?.cropCycleId
    ? { cropCycleId: processingRun.cropCycleId, source: "processing_run" as const }
    : processingRun?.harvestLot?.cropCycleId
      ? {
          cropCycleId: processingRun.harvestLot.cropCycleId,
          source: "harvest_lot" as const,
        }
      : null;

  if (derived) {
    return {
      cropCycleId: derived.cropCycleId,
      source: derived.source,
      mismatch:
        manualCropCycleId != null && manualCropCycleId !== derived.cropCycleId,
    };
  }

  return {
    cropCycleId: manualCropCycleId ?? null,
    source: "manual",
    mismatch: false,
  };
}
