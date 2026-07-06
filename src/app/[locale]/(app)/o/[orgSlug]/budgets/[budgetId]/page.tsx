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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_CHIP_CLASS: Record<"draft" | "active", string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

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

  const varianceClass = (value: string) =>
    Number(value) > 0
      ? "text-red-600 dark:text-red-400"
      : Number(value) < 0
        ? "text-green-600 dark:text-green-400"
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
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {budget.name}{" "}
              <span className="text-muted-foreground">({budget.year})</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {scopeLabel()} · {budget.currencyCode}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_CHIP_CLASS[budget.status as "draft" | "active"]
            }`}
          >
            {t(`status.${budget.status}`)}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("lines.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="p-2">{t("lines.month")}</th>
                {BUDGET_CATEGORIES.map((category) => (
                  <th key={category} className="p-2 text-right">
                    {t(`categories.${category}`)}
                  </th>
                ))}
                <th className="p-2 text-right">{t("lines.totalMonth")}</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((month) => (
                <tr key={month} className="border-b last:border-b-0">
                  <td className="p-2 font-medium">{t(`months.${month}`)}</td>
                  {BUDGET_CATEGORIES.map((category) => {
                    const amount = lineByKey.get(`${month}:${category}`) ?? "0";
                    return (
                      <td key={category} className="p-2">
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
                              className="h-8 w-24 text-right"
                            />
                            <Button type="submit" size="sm" variant="outline">
                              {t("lines.save")}
                            </Button>
                          </form>
                        ) : (
                          <span className="block text-right">
                            {money(amount)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-medium">
                    {money(totals.byMonth[month] ?? "0")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="p-2">{t("lines.totalCategory")}</td>
                {BUDGET_CATEGORIES.map((category) => (
                  <td key={category} className="p-2 text-right">
                    {money(totals.byCategory[category] ?? "0")}
                  </td>
                ))}
                <td className="p-2 text-right">{money(totals.grand)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("variance.title")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {monthsWithData.length === 0 ? (
            <p className="text-muted-foreground">{t("variance.empty")}</p>
          ) : (
            <>
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="p-2">{t("variance.month")}</th>
                    <th className="p-2"></th>
                    <th className="p-2 text-right">{t("variance.budget")}</th>
                    <th className="p-2 text-right">{t("variance.actual")}</th>
                    <th className="p-2 text-right">{t("variance.variance")}</th>
                    <th className="p-2 text-right">
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
                          className="border-b last:border-b-0"
                        >
                          <td className="p-2 font-medium">
                            {index === 0 ? t(`months.${month}`) : ""}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {t(`categories.${category}`)}
                          </td>
                          <td className="p-2 text-right">
                            {money(cell.budget)}
                          </td>
                          <td className="p-2 text-right">
                            {money(cell.actual)}
                          </td>
                          <td
                            className={`p-2 text-right font-medium ${varianceClass(cell.variance)}`}
                          >
                            {money(cell.variance)}
                          </td>
                          <td
                            className={`p-2 text-right ${varianceClass(cell.variance)}`}
                          >
                            {cell.variancePct === null ? "—" : `${cell.variancePct}%`}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>

              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("variance.categoryTotals")}
                </p>
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <tbody>
                    {report.categoryTotals.map((catTotal) => (
                      <tr
                        key={catTotal.category}
                        className="border-b last:border-b-0"
                      >
                        <td className="p-2 font-medium">
                          {t(`categories.${catTotal.category}`)}
                        </td>
                        <td className="p-2 text-right">{money(catTotal.budget)}</td>
                        <td className="p-2 text-right">{money(catTotal.actual)}</td>
                        <td
                          className={`p-2 text-right font-medium ${varianceClass(catTotal.variance)}`}
                        >
                          {money(catTotal.variance)}
                        </td>
                        <td
                          className={`p-2 text-right ${varianceClass(catTotal.variance)}`}
                        >
                          {catTotal.variancePct === null
                            ? "—"
                            : `${catTotal.variancePct}%`}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="p-2">{t("variance.grandTotals")}</td>
                      <td className="p-2 text-right">
                        {money(report.totalBudget)}
                      </td>
                      <td className="p-2 text-right">
                        {money(report.totalActual)}
                      </td>
                      <td
                        className={`p-2 text-right ${varianceClass(report.totalVariance)}`}
                      >
                        {money(report.totalVariance)}
                      </td>
                      <td className="p-2 text-right"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="text-green-600 dark:text-green-400">
                  ● {t("variance.legendUnder")}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  ● {t("variance.legendOver")}
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
