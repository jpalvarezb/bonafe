import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  getLot,
  listLotHarvests,
  listUnattachedHarvestsForCycle,
} from "@/server/services/processing";
import {
  addHarvestsToLotAction,
  closeLotAction,
  removeHarvestFromLotAction,
} from "@/server/actions/processing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const KNOWN_UNITS = ["kg", "lb", "qq", "lata", "saco"];

const STATUS_CHIP_CLASS: Record<"open" | "closed", string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  closed:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

export default async function ProcessingLotDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; lotId: string }>;
}>) {
  const { locale, orgSlug, lotId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "sales")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=sales`);
  }

  const t = await getTranslations("processing");

  function unitLabel(unit: string): string {
    return KNOWN_UNITS.includes(unit) ? t(`units.${unit}`) : unit;
  }

  const row = await getLot(ctx, lotId);
  if (!row) notFound();
  const { lot, cycleName } = row;

  const [memberHarvests, unattachedHarvests] = await Promise.all([
    listLotHarvests(ctx, lotId),
    listUnattachedHarvestsForCycle(ctx, lot.cropCycleId),
  ]);

  const canManage = can(ctx.role, "processing", "manage");
  const isOpen = lot.status === "open";

  const totalsByUnit = new Map<string, number>();
  for (const { harvest } of memberHarvests) {
    const prev = totalsByUnit.get(harvest.unit) ?? 0;
    totalsByUnit.set(harvest.unit, prev + Number(harvest.quantity));
  }
  const totalsDisplay = [...totalsByUnit.entries()].map(
    ([unit, total]) => `${total.toFixed(2)} ${unitLabel(unit)}`,
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{lot.name}</h1>
          <p className="text-sm text-muted-foreground">{cycleName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP_CLASS[lot.status as "open" | "closed"]}`}
          >
            {t(`lots.status.${lot.status}`)}
          </span>
          {canManage && isOpen && (
            <form action={closeLotAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="lotId" value={lot.id} />
              <Button type="submit" size="sm">
                {t("lots.close")}
              </Button>
            </form>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/o/${orgSlug}/processing/lots`}>
              {t("lots.backToLots")}
            </Link>
          </Button>
        </div>
      </div>

      {lot.notes && <p className="text-sm text-muted-foreground">{lot.notes}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t("lots.totalsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {totalsDisplay.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("lots.totalsEmpty")}
            </p>
          ) : (
            <p className="text-lg font-medium">{totalsDisplay.join(" · ")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("lots.membersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {memberHarvests.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {t("lots.membersEmpty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t("lots.table.date")}</th>
                  <th className="px-4 py-2 font-medium">
                    {t("lots.table.parcel")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("lots.table.worker")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("lots.table.quantity")}
                  </th>
                  {canManage && isOpen && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {memberHarvests.map(({ harvest, parcelName, workerName }) => (
                  <tr key={harvest.id}>
                    <td className="px-4 py-2">{harvest.date}</td>
                    <td className="px-4 py-2">{parcelName}</td>
                    <td className="px-4 py-2">{workerName ?? "—"}</td>
                    <td className="px-4 py-2">
                      {harvest.quantity} {unitLabel(harvest.unit)}
                    </td>
                    {canManage && isOpen && (
                      <td className="px-4 py-2 text-right">
                        <form action={removeHarvestFromLotAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="orgSlug" value={orgSlug} />
                          <input type="hidden" name="lotId" value={lot.id} />
                          <input
                            type="hidden"
                            name="harvestId"
                            value={harvest.id}
                          />
                          <Button variant="ghost" size="sm" type="submit">
                            {t("lots.remove")}
                          </Button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {canManage && isOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{t("lots.attachTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {unattachedHarvests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("lots.attachEmpty")}
              </p>
            ) : (
              <form action={addHarvestsToLotAction} className="flex flex-col gap-3">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="lotId" value={lot.id} />
                <div className="flex flex-col divide-y">
                  {unattachedHarvests.map(
                    ({ harvest, parcelName, workerName }) => (
                      <label
                        key={harvest.id}
                        className="flex items-center gap-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="harvestIds"
                          value={harvest.id}
                          className="size-4"
                        />
                        <span className="flex-1">
                          {harvest.date} · {parcelName} · {workerName ?? "—"} ·{" "}
                          {harvest.quantity} {unitLabel(harvest.unit)}
                        </span>
                      </label>
                    ),
                  )}
                </div>
                <Button type="submit" className="self-start">
                  {t("lots.attach")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
