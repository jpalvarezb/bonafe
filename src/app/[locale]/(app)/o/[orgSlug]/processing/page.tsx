import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listCycles } from "@/server/services/cycles";
import { listLots, listRuns } from "@/server/services/processing";
import { deleteRunAction } from "@/server/actions/processing";
import { processingYieldPct } from "@/lib/calc/profitability";
import { ProcessingRunForm } from "@/components/processing/processing-run-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const KNOWN_UNITS = ["kg", "lb", "qq", "lata", "saco"];

export default async function ProcessingPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "sales")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=sales`);
  }

  const t = await getTranslations("processing");
  const format = await getFormatter();

  function unitLabel(unit: string): string {
    return KNOWN_UNITS.includes(unit) ? t(`units.${unit}`) : unit;
  }

  const money = (value: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: ctx.org.baseCurrencyCode,
    });

  const [cycles, lotsData, runs] = await Promise.all([
    listCycles(ctx),
    listLots(ctx),
    listRuns(ctx),
  ]);

  const canManage = can(ctx.role, "processing", "manage");
  const openLots = lotsData.filter(({ lot }) => lot.status === "open");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button asChild variant="outline">
          <Link href={`/o/${orgSlug}/processing/lots`}>{t("lots.link")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("lots.summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {lotsData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("lots.summaryEmpty")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("lots.summaryCount", {
                open: openLots.length,
                total: lotsData.length,
              })}
            </p>
          )}
        </CardContent>
      </Card>

      {runs.length === 0 ? (
        <p className="text-muted-foreground">{t("runs.empty")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("runs.title")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("runs.date")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.cycle")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.lot")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.input")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.output")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.yield")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.cost")}</th>
                  <th className="px-4 py-2 font-medium">{t("runs.notes")}</th>
                  {canManage && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map(({ run, cycleName, lotName }) => {
                  const yieldPct = processingYieldPct(
                    run.inputQuantity,
                    run.outputQuantity,
                  );
                  const overOutput = new Decimal(run.outputQuantity).gt(
                    run.inputQuantity,
                  );
                  return (
                    <tr key={run.id}>
                      <td className="px-4 py-2">{run.date}</td>
                      <td className="px-4 py-2">{cycleName}</td>
                      <td className="px-4 py-2">{lotName ?? "—"}</td>
                      <td className="px-4 py-2">
                        {run.inputQuantity} {unitLabel(run.inputUnit)}
                      </td>
                      <td className="px-4 py-2">
                        {run.outputQuantity} {unitLabel(run.outputUnit)}
                        {overOutput && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {t("runs.overOutputWarning")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {yieldPct === null ? "—" : `${yieldPct}%`}
                      </td>
                      <td className="px-4 py-2">{money(run.cost)}</td>
                      <td className="max-w-[14rem] truncate px-4 py-2">
                        {run.notes ?? "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-2 text-right">
                          <form action={deleteRunAction}>
                            <input type="hidden" name="locale" value={locale} />
                            <input
                              type="hidden"
                              name="orgSlug"
                              value={orgSlug}
                            />
                            <input type="hidden" name="id" value={run.id} />
                            <Button variant="ghost" size="sm" type="submit">
                              {t("runs.delete")}
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canManage && cycles.length > 0 && (
        <ProcessingRunForm
          locale={locale}
          orgSlug={orgSlug}
          cycles={cycles.map(({ cycle }) => ({ id: cycle.id, name: cycle.name }))}
          lots={openLots.map(({ lot }) => ({
            id: lot.id,
            name: lot.name,
            cropCycleId: lot.cropCycleId,
          }))}
        />
      )}
    </div>
  );
}
