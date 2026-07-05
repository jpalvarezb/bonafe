import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listMonitoring } from "@/server/services/monitoring";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import {
  createMonitoringAction,
  deleteMonitoringAction,
} from "@/server/actions/monitoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

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
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createMonitoringAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="parcelId">{t("parcel")}</Label>
                <select
                  id="parcelId"
                  name="parcelId"
                  required
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  {parcels.map((parcel) => (
                    <option key={parcel.id} value={parcel.id}>
                      {parcel.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cropCycleId">{t("cycle")}</Label>
                <select
                  id="cropCycleId"
                  name="cropCycleId"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{t("cycleNone")}</option>
                  {cycles.map(({ cycle }) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">{t("date")}</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="type">{t("type")}</Label>
                <select
                  id="type"
                  name="type"
                  required
                  defaultValue="pest"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="pest">{t("types.pest")}</option>
                  <option value="disease">{t("types.disease")}</option>
                  <option value="weed">{t("types.weed")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="agentName">{t("agentName")}</Label>
                <Input
                  id="agentName"
                  name="agentName"
                  required
                  placeholder={t("agentNamePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="severity">{t("severity")}</Label>
                <select
                  id="severity"
                  name="severity"
                  required
                  defaultValue="1"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="incidencePct">{t("incidencePct")}</Label>
                <Input
                  id="incidencePct"
                  name="incidencePct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">{t("notes")}</Label>
                <Input id="notes" name="notes" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="actionsTaken">{t("actionsTaken")}</Label>
                <Input id="actionsTaken" name="actionsTaken" />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
