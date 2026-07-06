import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listMonitoring } from "@/server/services/monitoring";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import { deleteMonitoringAction } from "@/server/actions/monitoring";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonitoringForm } from "@/components/monitoring/monitoring-form";
import { PendingEntries } from "@/components/offline/pending-entries";

function severityChipClass(severity: number): string {
  if (severity <= 2) {
    return "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100";
  }
  if (severity === 3) {
    return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-100";
  }
  return "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-100";
}

export default async function MonitoringPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("monitoring");

  const [records, parcels, cycles] = await Promise.all([
    listMonitoring(ctx),
    listParcels(ctx),
    listCycles(ctx, { status: "active" }),
  ]);
  const canCreate = can(ctx.role, "monitoring", "create");
  const canDelete = can(ctx.role, "monitoring", "delete");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <PendingEntries orgSlug={orgSlug} kind="monitoring.create" />

      {records.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {records.map(({ record, parcelName, cycleName }) => (
              <div
                key={record.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t(`types.${record.type}`)}
                    </span>
                    <span className={severityChipClass(record.severity)}>
                      {t("severity")} {record.severity}
                    </span>
                    <span className="font-medium">{record.agentName}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {record.date} · {parcelName}
                    {cycleName ? ` · ${cycleName}` : ""}
                    {record.incidencePct ? ` · ${record.incidencePct}%` : ""}
                    {record.notes ? ` · ${record.notes}` : ""}
                  </p>
                </div>
                {canDelete && (
                  <form action={deleteMonitoringAction} className="shrink-0">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="id" value={record.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      {t("delete")}
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canCreate && parcels.length > 0 && (
        <MonitoringForm
          locale={locale}
          orgSlug={orgSlug}
          parcels={parcels.map((p) => ({ id: p.id, name: p.name }))}
          cycles={cycles.map(({ cycle }) => ({
            id: cycle.id,
            name: cycle.name,
            parcelId: cycle.parcelId,
          }))}
        />
      )}
    </div>
  );
}
