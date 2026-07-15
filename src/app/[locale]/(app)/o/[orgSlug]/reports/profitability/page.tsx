import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listCycles } from "@/server/services/cycles";
import {
  cycleProfitabilityReport,
  orgUnattributedPieceworkCost,
} from "@/server/reports/profitability";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function ProfitabilityReportPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ cycleId?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "sales")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=sales`);
  }

  const t = await getTranslations("sales");
  const format = await getFormatter();

  const selectedCycleId = sp.cycleId || undefined;

  const [allCycles, rows, pieceworkCost] = await Promise.all([
    listCycles(ctx),
    cycleProfitabilityReport(ctx, selectedCycleId),
    orgUnattributedPieceworkCost(ctx),
  ]);

  const money = (value: string | number | null) =>
    format.number(Number(value ?? 0), {
      style: "currency",
      currency: ctx.org.baseCurrencyCode,
      maximumFractionDigits: 2,
    });

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("profitability.title")}</h1>

      <Card>
        <CardContent className="pt-4">
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="cycleId" className="text-sm font-medium">
                {t("profitability.cycle")}
              </label>
              <select
                id="cycleId"
                name="cycleId"
                defaultValue={selectedCycleId ?? ""}
                className={selectClass}
              >
                <option value="">{t("profitability.allCycles")}</option>
                {allCycles.map(({ cycle }) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              {t("profitability.apply")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              {t("profitability.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_0.8fr_1fr_1fr] gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>{t("profitability.cycle")}</span>
                  <span>{t("profitability.income")}</span>
                  <span>{t("profitability.activityCost")}</span>
                  <span>{t("profitability.processingCost")}</span>
                  <span>{t("profitability.pieceworkCost")}</span>
                  <span>{t("profitability.profit")}</span>
                  <span>{t("profitability.margin")}</span>
                  <span>{t("profitability.profitPerHa")}</span>
                  <span>{t("profitability.costPerUnit")}</span>
                </div>
                {rows.map((row) => {
                  const isProfit = Number(row.profit) >= 0;
                  return (
                    <div
                      key={row.cycleId}
                      className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_0.8fr_1fr_1fr] gap-x-3 border-b px-4 py-2 text-sm last:border-b-0"
                    >
                      <span className="truncate font-medium">
                        {row.cycleName}
                      </span>
                      <span>{money(row.income)}</span>
                      <span>{money(row.activityCost)}</span>
                      <span>{money(row.processingCost)}</span>
                      <span>{money(row.pieceworkCost)}</span>
                      <span
                        className={cn(
                          "font-medium",
                          isProfit ? "text-fin-positive" : "text-fin-negative",
                        )}
                      >
                        {money(row.profit)}
                      </span>
                      <span
                        className={
                          isProfit ? "text-fin-positive" : "text-fin-negative"
                        }
                      >
                        {row.marginPct != null ? `${row.marginPct}%` : "—"}
                      </span>
                      <span>
                        {row.profitPerHa != null ? money(row.profitPerHa) : "—"}
                      </span>
                      <span>
                        {row.costPerUnit != null && row.outputUnit
                          ? `${money(row.costPerUnit)} / ${row.outputUnit}`
                          : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("profitability.pieceworkFootnote", { amount: money(pieceworkCost) })}
      </p>
    </div>
  );
}
