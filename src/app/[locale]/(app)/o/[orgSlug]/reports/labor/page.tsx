import { redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  laborByWorkerReport,
  laborCostByActivityType,
  laborCostByParcel,
} from "@/server/services/payroll";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Default range: last 30 days (inclusive of today) when not given. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: toDateString(from), to: toDateString(to) };
}

export default async function LaborReportPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "labor")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=labor`);
  }

  const t = await getTranslations("payroll");
  const format = await getFormatter();

  const fallback = defaultRange();
  const range = {
    from: sp.from && sp.from.length === 10 ? sp.from : fallback.from,
    to: sp.to && sp.to.length === 10 ? sp.to : fallback.to,
  };

  const [byWorker, byActivityType, byParcel] = await Promise.all([
    laborByWorkerReport(ctx, range),
    laborCostByActivityType(ctx, range),
    laborCostByParcel(ctx, range),
  ]);

  const money = (value: string | number | null) =>
    format.number(Number(value ?? 0), {
      style: "currency",
      currency: ctx.org.baseCurrencyCode,
    });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("reports.title")}</h1>

      <Card>
        <CardContent className="pt-4">
          <form
            method="get"
            className="flex flex-wrap items-end gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="from">{t("reports.from")}</Label>
              <Input id="from" name="from" type="date" defaultValue={range.from} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="to">{t("reports.to")}</Label>
              <Input id="to" name="to" type="date" defaultValue={range.to} />
            </div>
            <Button type="submit" variant="outline">
              {t("reports.apply")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reports.byWorker.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byWorker.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("reports.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>{t("reports.byWorker.worker")}</span>
                  <span>{t("reports.byWorker.days")}</span>
                  <span>{t("reports.byWorker.hours")}</span>
                  <span>{t("reports.byWorker.grossPay")}</span>
                </div>
                {byWorker.map((row) => (
                  <div
                    key={row.workerId}
                    className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr] gap-x-3 border-b px-4 py-2 text-sm last:border-b-0"
                  >
                    <span className="truncate font-medium">
                      {row.workerName}
                    </span>
                    <span>{row.daysWorked}</span>
                    <span>{row.hoursWorked}</span>
                    <span>{money(row.grossPay)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reports.byActivityType.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byActivityType.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("reports.empty")}
            </p>
          ) : (
            <div className="divide-y">
              {byActivityType.map((row) => (
                <div
                  key={row.typeName}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span>{row.typeName}</span>
                  <span className="font-medium">{money(row.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reports.byParcel.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byParcel.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t("reports.empty")}
            </p>
          ) : (
            <div className="divide-y">
              {byParcel.map((row) => (
                <div
                  key={row.parcelId ?? "general"}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span>{row.parcelName ?? t("reports.byParcel.general")}</span>
                  <span className="font-medium">{money(row.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
