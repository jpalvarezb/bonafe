import Decimal from "decimal.js";

/**
 * Budget-vs-actual variance. Pure — budget lines and aggregated actuals in,
 * a month × category matrix out. All money as strings, Decimal math.
 */

export type BudgetCategory = "labor" | "input" | "machine" | "other";

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  "labor",
  "input",
  "machine",
  "other",
];

export type MonthCategoryAmount = {
  month: number; // 1..12
  category: BudgetCategory;
  amount: string | number;
};

export type VarianceCell = {
  month: number;
  category: BudgetCategory;
  budget: string;
  actual: string;
  /** actual − budget: positive = overspend. */
  variance: string;
  /** variance / budget × 100; null when the budget is zero. */
  variancePct: string | null;
};

export type VarianceReport = {
  cells: VarianceCell[];
  categoryTotals: Array<{
    category: BudgetCategory;
    budget: string;
    actual: string;
    variance: string;
    variancePct: string | null;
  }>;
  totalBudget: string;
  totalActual: string;
  totalVariance: string;
};

const d = (value: string | number | null | undefined) =>
  new Decimal(value ?? 0);

function key(month: number, category: string): string {
  return `${month}:${category}`;
}

/**
 * Builds the full matrix over every month that appears in either input
 * (so unbudgeted spend and unspent budget both surface).
 */
export function buildVarianceReport(
  budgetLines: MonthCategoryAmount[],
  actuals: MonthCategoryAmount[],
): VarianceReport {
  const budgetByKey = new Map<string, Decimal>();
  for (const line of budgetLines) {
    const k = key(line.month, line.category);
    budgetByKey.set(k, (budgetByKey.get(k) ?? new Decimal(0)).add(d(line.amount)));
  }
  const actualByKey = new Map<string, Decimal>();
  for (const line of actuals) {
    const k = key(line.month, line.category);
    actualByKey.set(k, (actualByKey.get(k) ?? new Decimal(0)).add(d(line.amount)));
  }

  const months = [
    ...new Set([...budgetLines, ...actuals].map((line) => line.month)),
  ].sort((a, b) => a - b);

  const cells: VarianceCell[] = [];
  for (const month of months) {
    for (const category of BUDGET_CATEGORIES) {
      const budget = budgetByKey.get(key(month, category)) ?? new Decimal(0);
      const actual = actualByKey.get(key(month, category)) ?? new Decimal(0);
      if (budget.isZero() && actual.isZero()) continue;
      const variance = actual.sub(budget);
      cells.push({
        month,
        category,
        budget: budget.toFixed(4),
        actual: actual.toFixed(4),
        variance: variance.toFixed(4),
        variancePct: budget.isZero()
          ? null
          : variance.div(budget).mul(100).toFixed(2),
      });
    }
  }

  const categoryTotals = BUDGET_CATEGORIES.map((category) => {
    const rows = cells.filter((cell) => cell.category === category);
    const budget = rows.reduce((s, r) => s.add(d(r.budget)), new Decimal(0));
    const actual = rows.reduce((s, r) => s.add(d(r.actual)), new Decimal(0));
    const variance = actual.sub(budget);
    return {
      category,
      budget: budget.toFixed(4),
      actual: actual.toFixed(4),
      variance: variance.toFixed(4),
      variancePct: budget.isZero()
        ? null
        : variance.div(budget).mul(100).toFixed(2),
    };
  }).filter((row) => !(d(row.budget).isZero() && d(row.actual).isZero()));

  const totalBudget = categoryTotals.reduce(
    (s, r) => s.add(d(r.budget)),
    new Decimal(0),
  );
  const totalActual = categoryTotals.reduce(
    (s, r) => s.add(d(r.actual)),
    new Decimal(0),
  );

  return {
    cells,
    categoryTotals,
    totalBudget: totalBudget.toFixed(4),
    totalActual: totalActual.toFixed(4),
    totalVariance: totalActual.sub(totalBudget).toFixed(4),
  };
}
