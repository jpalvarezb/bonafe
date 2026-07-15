import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { withOrgRls } from "@/lib/db/rls";
import { workers as workersTable } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listHarvests } from "@/server/services/harvests";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import { deleteHarvestAction } from "@/server/actions/harvests";
import { HarvestForm } from "@/components/harvests/harvest-form";
import { PendingEntries } from "@/components/offline/pending-entries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** The five units offered by the capture form; anything else is legacy/free text. */
const KNOWN_UNITS = ["kg", "lb", "qq", "lata", "saco"];

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

export default async function HarvestsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ parcelId?: string; cycleId?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "harvest")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=harvest`);
  }

  const t = await getTranslations("harvests");
  const tImporter = await getTranslations("importer");
  const sp = await searchParams;

  function unitLabel(unit: string): string {
    return KNOWN_UNITS.includes(unit) ? t(`units.${unit}`) : unit;
  }

  const [parcels, cycles, activeWorkers] = await Promise.all([
    listParcels(ctx),
    listCycles(ctx, { status: "active" }),
    withOrgRls(ctx.org.id, (tx) =>
      tx
        .select({ id: workersTable.id, name: workersTable.name })
        .from(workersTable)
        .where(
          and(
            eq(workersTable.orgId, ctx.org.id),
            eq(workersTable.active, true),
          ),
        )
        .orderBy(workersTable.name),
    ),
  ]);

  const rows = await listHarvests(ctx, {
    parcelId: sp.parcelId || undefined,
    cropCycleId: sp.cycleId || undefined,
  });

  const canCreate = can(ctx.role, "harvest", "create");
  const canDelete = can(ctx.role, "harvest", "delete");
  const canExport = can(ctx.role, "report", "view");

  const totalsByUnit = new Map<string, Decimal>();
  for (const row of rows) {
    const prev = totalsByUnit.get(row.harvest.unit) ?? new Decimal(0);
    totalsByUnit.set(row.harvest.unit, prev.plus(row.harvest.quantity));
  }
  const totalsDisplay = [...totalsByUnit.entries()].map(
    ([unit, total]) => `${total.toFixed(2)} ${unitLabel(unit)}`,
  );

  const filteredCycles = cycles.filter(
    ({ cycle }) => !sp.parcelId || cycle.parcelId === sp.parcelId,
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canExport && (
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/export?type=harvests&org=${orgSlug}&locale=${locale}`}
            >
              {tImporter("exportCsv")}
            </a>
          </Button>
        )}
      </div>

      <PendingEntries orgSlug={orgSlug} kind="harvest.create" />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="parcelId">{t("parcel")}</Label>
          <select
            id="parcelId"
            name="parcelId"
            defaultValue={sp.parcelId ?? ""}
            className={selectClass}
          >
            <option value="">{t("filters.allParcels")}</option>
            {parcels.map((parcel) => (
              <option key={parcel.id} value={parcel.id}>
                {parcel.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cycleId">{t("cycle")}</Label>
          <select
            id="cycleId"
            name="cycleId"
            defaultValue={sp.cycleId ?? ""}
            className={selectClass}
          >
            <option value="">{t("filters.allCycles")}</option>
            {filteredCycles.map(({ cycle }) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          {t("filters.apply")}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{t("summary.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {totalsDisplay.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("summary.empty")}
            </p>
          ) : (
            <p className="text-lg font-medium">{totalsDisplay.join(" · ")}</p>
          )}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("table.date")}</th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.parcel")}
                  </th>
                  <th className="px-4 py-2 font-medium">{t("table.cycle")}</th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.worker")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.quantity")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.quality")}
                  </th>
                  <th className="px-4 py-2 font-medium">{t("table.notes")}</th>
                  {canDelete && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ harvest, parcelName, cycleName, workerName }) => (
                  <tr key={harvest.id}>
                    <td className="px-4 py-2">{harvest.date}</td>
                    <td className="px-4 py-2">{parcelName}</td>
                    <td className="px-4 py-2">{cycleName ?? "—"}</td>
                    <td className="px-4 py-2">{workerName ?? "—"}</td>
                    <td className="px-4 py-2">
                      {harvest.quantity} {unitLabel(harvest.unit)}
                    </td>
                    <td className="px-4 py-2">
                      {harvest.qualityGrade ?? "—"}
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-2">
                      {harvest.notes ?? "—"}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-2 text-right">
                        <form action={deleteHarvestAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input
                            type="hidden"
                            name="orgSlug"
                            value={orgSlug}
                          />
                          <input type="hidden" name="id" value={harvest.id} />
                          <Button variant="ghost" size="sm" type="submit">
                            {t("delete")}
                          </Button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canCreate && parcels.length > 0 && (
        <HarvestForm
          orgSlug={orgSlug}
          parcels={parcels.map((p) => ({ id: p.id, name: p.name }))}
          cycles={cycles.map(({ cycle }) => ({
            id: cycle.id,
            name: cycle.name,
            parcelId: cycle.parcelId,
          }))}
          workers={activeWorkers}
        />
      )}
    </div>
  );
}
