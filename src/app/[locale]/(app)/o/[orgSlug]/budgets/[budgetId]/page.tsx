import { notFound, redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  budgetActuals,
  getBudget,
  listBudgetLines,
  summarizeBudgetLines,
} from "@/server/services/budgets";
import { upsertBudgetLineAction } from "@/server/actions/budgets";
import {
  buildVarianceReport,
  BUDGET_CATEGORIES,
  type BudgetCategory,
  type MonthCategoryAmount,
} from "@/lib/calc/variance";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// Same density building blocks as the payroll/planning screens (globals.css
// [data-mode="field"] retunes these for field mode).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const NUM_CELL = `tabular text-right font-mono text-[length:var(--density-font-body)] ${CELL}`;

export default async function BudgetDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; budgetId: string }>;
}>) {
  const { locale, orgSlug, budgetId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "budgets")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=budgets`);
  }

  const t = await getTranslations("budgets");
  const format = await getFormatter();

  const row = await getBudget(ctx, budgetId);
  if (!row) notFound();
  const { budget, farmName, cycleName } = row;

  const lines = await listBudgetLines(ctx, budgetId);
  const canManage = can(ctx.role, "budget", "manage");

  const lineByKey = new Map<string, string>();
  const lineAmounts: MonthCategoryAmount[] = [];
  for (const line of lines) {
    const category = line.category as BudgetCategory;
    lineByKey.set(`${line.month}:${category}`, line.amount);
    lineAmounts.push({ month: line.month, category, amount: line.amount });
  }
  const totals = summarizeBudgetLines(lineAmounts);

  const actuals = await budgetActuals(ctx, budget);
  const report = buildVarianceReport(lineAmounts, actuals);
  const cellByKey = new Map(
    report.cells.map((cell) => [`${cell.month}:${cell.category}`, cell]),
  );
  const monthsWithData = [...new Set(report.cells.map((cell) => cell.month))].sort(
    (a, b) => a - b,
  );

  const money = (value: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: budget.currencyCode,
    });

  // Variance sign is inverted from plain arithmetic sign: positive variance
  // means actual spend exceeded budget (bad -> fin-negative/red), negative
  // variance means under budget (good -> fin-positive/green). Not a fit for
  // <Metric signed> for that reason.
  const varianceClass = (value: string) =>
    Number(value) > 0
      ? "text-fin-negative"
      : Number(value) < 0
        ? "text-fin-positive"
        : "";

  function scopeLabel() {
    if (farmName && cycleName) {
      return t("scope.farmAndCycle", { farm: farmName, cycle: cycleName });
    }
    if (farmName) return t("scope.farm", { name: farmName });
    if (cycleName) return t("scope.cycle", { name: cycleName });
    return t("scope.org");
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/o/${orgSlug}/budgets`}
          className="w-fit font-mono text-[11px] text-muted-foreground hover:underline"
        >
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {budget.name}{" "}
              <span className="text-muted-foreground">({budget.year})</span>
            </h1>
            <p className="tabular font-mono text-[11px] text-muted-foreground">
              {scopeLabel()} · {budget.currencyCode}
            </p>
          </div>
          <StatusChip
            family="life"
            state={budget.status as "draft" | "active"}
          >
            {t(`status.${budget.status}`)}
          </StatusChip>
        </div>
      </div>

      {/* Month × category budget lines — dense matrix, mono microlabel
          headers, per-cell inline-save forms when editable. */}
      <div className="flex flex-col rounded-[3px] border border-border">
        <div className={cn(CELL, "border-b border-border")}>
          <h2 className={MICRO_LABEL}>{t("lines.title")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[length:var(--density-font-body)]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("lines.month")}
                </th>
                {BUDGET_CATEGORIES.map((category) => (
                  <th
                    key={category}
                    className={cn(
                      MICRO_LABEL,
                      CELL,
                      "text-right font-semibold",
                    )}
                  >
                    {t(`categories.${category}`)}
                  </th>
                ))}
                <th
                  className={cn(
                    MICRO_LABEL,
                    CELL,
                    "text-right font-semibold",
                  )}
                >
                  {t("lines.totalMonth")}
                </th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr
                  key={month}
                  className="border-b border-border last:border-b-0"
                >
                  <td
                    className={cn(
                      CELL,
                      "font-mono text-[length:var(--density-font-body)] font-medium",
                    )}
                  >
                    {t(`months.${month}`)}
                  </td>
                  {BUDGET_CATEGORIES.map((category) => {
                    const amount = lineByKey.get(`${month}:${category}`) ?? "0";
                    return (
                      <td key={category} className={canManage ? CELL : NUM_CELL}>
                        {canManage ? (
                          <form
                            action={upsertBudgetLineAction}
                            className="flex items-center justify-end gap-1"
                          >
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="orgSlug" value={orgSlug} />
                            <input
                              type="hidden"
                              name="budgetId"
                              value={budget.id}
                            />
                            <input type="hidden" name="month" value={month} />
                            <input
                              type="hidden"
                              name="category"
                              value={category}
                            />
                            <Input
                              name="amount"
                              defaultValue={amount}
                              inputMode="decimal"
                              className="tabular h-[var(--density-control-h)] w-24 rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-right font-mono text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-[var(--density-control-h)] shrink-0 items-center justify-center rounded-[3px] border border-border px-1.5 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {t("lines.save")}
                            </button>
                          </form>
                        ) : (
                          money(amount)
                        )}
                      </td>
                    );
                  })}
                  <td className={cn(NUM_CELL, "font-semibold")}>
                    {money(totals.byMonth[month] ?? "0")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={CELL}>{t("lines.totalCategory")}</td>
                {BUDGET_CATEGORIES.map((category) => (
                  <td key={category} className={NUM_CELL}>
                    {money(totals.byCategory[category] ?? "0")}
                  </td>
                ))}
                <td className={cn(NUM_CELL, "font-bold")}>
                  {money(totals.grand)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Budget vs. actual variance — mono numerals, fin-token coloring
          (over budget = red, under budget = green; varianceClass inverts
          the plain arithmetic sign per its doc comment above). */}
      <div className="flex flex-col rounded-[3px] border border-border">
        <div className={cn(CELL, "border-b border-border")}>
          <h2 className={MICRO_LABEL}>{t("variance.title")}</h2>
        </div>
        {monthsWithData.length === 0 ? (
          <p className={cn(CELL, "text-muted-foreground")}>
            {t("variance.empty")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-[length:var(--density-font-body)]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th
                      className={cn(
                        MICRO_LABEL,
                        CELL,
                        "text-left font-semibold",
                      )}
                    >
                      {t("variance.month")}
                    </th>
                    <th className={CELL} />
                    <th
                      className={cn(
                        MICRO_LABEL,
                        CELL,
                        "text-right font-semibold",
                      )}
                    >
                      {t("variance.budget")}
                    </th>
                    <th
                      className={cn(
                        MICRO_LABEL,
                        CELL,
                        "text-right font-semibold",
                      )}
                    >
                      {t("variance.actual")}
                    </th>
                    <th
                      className={cn(
                        MICRO_LABEL,
                        CELL,
                        "text-right font-semibold",
                      )}
                    >
                      {t("variance.variance")}
                    </th>
                    <th
                      className={cn(
                        MICRO_LABEL,
                        CELL,
                        "text-right font-semibold",
                      )}
                    >
                      {t("variance.variancePct")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthsWithData.map((month) =>
                    BUDGET_CATEGORIES.filter((category) =>
                      cellByKey.has(`${month}:${category}`),
                    ).map((category, index) => {
                      const cell = cellByKey.get(`${month}:${category}`)!;
                      return (
                        <tr
                          key={`${month}:${category}`}
                          className="border-b border-border last:border-b-0"
                        >
                          <td
                            className={cn(
                              CELL,
                              "font-mono text-[length:var(--density-font-body)] font-medium",
                            )}
                          >
                            {index === 0 ? t(`months.${month}`) : ""}
                          </td>
                          <td className={cn(CELL, "text-muted-foreground")}>
                            {t(`categories.${category}`)}
                          </td>
                          <td className={NUM_CELL}>{money(cell.budget)}</td>
                          <td className={NUM_CELL}>{money(cell.actual)}</td>
                          <td
                            className={cn(
                              NUM_CELL,
                              "font-semibold",
                              varianceClass(cell.variance),
                            )}
                          >
                            {money(cell.variance)}
                          </td>
                          <td
                            className={cn(
                              NUM_CELL,
                              varianceClass(cell.variance),
                            )}
                          >
                            {cell.variancePct === null
                              ? "—"
                              : `${cell.variancePct}%`}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border">
              <p className={cn(CELL, MICRO_LABEL, "border-b border-border")}>
                {t("variance.categoryTotals")}
              </p>
              <table className="w-full min-w-[680px] text-[length:var(--density-font-body)]">
                <tbody>
                  {report.categoryTotals.map((catTotal) => (
                    <tr
                      key={catTotal.category}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className={cn(CELL, "font-medium")}>
                        {t(`categories.${catTotal.category}`)}
                      </td>
                      <td className={NUM_CELL}>{money(catTotal.budget)}</td>
                      <td className={NUM_CELL}>{money(catTotal.actual)}</td>
                      <td
                        className={cn(
                          NUM_CELL,
                          "font-semibold",
                          varianceClass(catTotal.variance),
                        )}
                      >
                        {money(catTotal.variance)}
                      </td>
                      <td
                        className={cn(
                          NUM_CELL,
                          varianceClass(catTotal.variance),
                        )}
                      >
                        {catTotal.variancePct === null
                          ? "—"
                          : `${catTotal.variancePct}%`}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className={CELL}>{t("variance.grandTotals")}</td>
                    <td className={NUM_CELL}>{money(report.totalBudget)}</td>
                    <td className={NUM_CELL}>{money(report.totalActual)}</td>
                    <td
                      className={cn(
                        NUM_CELL,
                        "font-bold",
                        varianceClass(report.totalVariance),
                      )}
                    >
                      {money(report.totalVariance)}
                    </td>
                    <td className={CELL} />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-fin-positive">
                <span aria-hidden className="size-[6px] shrink-0 bg-fin-positive" />
                {t("variance.legendUnder")}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-fin-negative">
                <span aria-hidden className="size-[6px] shrink-0 bg-fin-negative" />
                {t("variance.legendOver")}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
