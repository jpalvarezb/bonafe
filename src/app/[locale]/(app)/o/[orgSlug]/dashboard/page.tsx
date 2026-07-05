import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { costPerHa } from "@/lib/calc/costs";
import {
  costByCategory,
  costByMonth,
  costByParcel,
  dashboardSummary,
} from "@/server/reports/costs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Bar({ value, max }: Readonly<{ value: number; max: number }>) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-2 rounded-full bg-primary"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function OrgDashboardPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("dashboard");
  const format = await getFormatter();

  const [summary, byParcel, byCategory, byMonth] = await Promise.all([
    dashboardSummary(ctx),
    costByParcel(ctx),
    costByCategory(ctx),
    costByMonth(ctx),
  ]);

  const money = (value: string | number | null) =>
    format.number(Number(value ?? 0), {
      style: "currency",
      currency: ctx.org.baseCurrencyCode,
      maximumFractionDigits: 0,
    });

  const maxParcel = Math.max(
    ...byParcel.map((r) => Number(r.totalCost ?? 0)),
    0,
  );
  const maxCategory = Math.max(
    ...byCategory.map((r) => Number(r.totalCost ?? 0)),
    0,
  );
  const maxMonth = Math.max(...byMonth.map((r) => Number(r.totalCost ?? 0)), 0);

  const stats = [
    { label: t("totalCost"), value: money(summary.totalCost) },
    { label: t("activeCycles"), value: String(summary.activeCycles) },
    { label: t("farms"), value: String(summary.farms) },
    { label: t("parcels"), value: String(summary.parcels) },
  ];

  const hasData = Number(summary.totalCost) > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!hasData ? (
        <p className="text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("costByParcel")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {byParcel.map((row) => {
                const perHa = costPerHa(row.totalCost ?? "0", row.areaHa);
                return (
                  <div key={row.parcelId} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        {row.parcelName}
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.farmName}
                        </span>
                      </span>
                      <span className="font-medium">
                        {money(row.totalCost)}
                        {perHa && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({money(perHa)}/ha)
                          </span>
                        )}
                      </span>
                    </div>
                    <Bar value={Number(row.totalCost ?? 0)} max={maxParcel} />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("costByCategory")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {byCategory.map((row) => (
                <div key={row.typeName} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{row.typeName}</span>
                    <span className="font-medium">{money(row.totalCost)}</span>
                  </div>
                  <Bar value={Number(row.totalCost ?? 0)} max={maxCategory} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("costByMonth")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {byMonth.map((row) => (
                <div key={row.month} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{row.month}</span>
                    <span className="font-medium">{money(row.totalCost)}</span>
                  </div>
                  <Bar value={Number(row.totalCost ?? 0)} max={maxMonth} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
