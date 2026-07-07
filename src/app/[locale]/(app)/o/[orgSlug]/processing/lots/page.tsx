import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listCycles } from "@/server/services/cycles";
import { listLots } from "@/server/services/processing";
import { createLotAction } from "@/server/actions/processing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const KNOWN_UNITS = ["kg", "lb", "qq", "lata", "saco"];

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

export default async function ProcessingLotsPage({
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

  function unitLabel(unit: string): string {
    return KNOWN_UNITS.includes(unit) ? t(`units.${unit}`) : unit;
  }

  const [cycles, lots] = await Promise.all([listCycles(ctx), listLots(ctx)]);
  const canManage = can(ctx.role, "processing", "manage");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("lots.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("lots.subtitle")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/o/${orgSlug}/processing`}>{t("lots.backToRuns")}</Link>
        </Button>
      </div>

      {lots.length === 0 ? (
        <p className="text-muted-foreground">{t("lots.empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {lots.map(({ lot, cycleName, unitTotals, itemCount }) => (
              <Link
                key={lot.id}
                href={`/o/${orgSlug}/processing/lots/${lot.id}`}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{lot.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {cycleName} ·{" "}
                    {t("lots.itemCount", { count: itemCount })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {unitTotals.length === 0
                      ? "—"
                      : unitTotals
                          .map(
                            (total) =>
                              `${total.quantity} ${unitLabel(total.unit)}`,
                          )
                          .join(" · ")}
                  </span>
                  <StatusChip
                    family="life"
                    state={lot.status as "open" | "closed"}
                  >
                    {t(`lots.status.${lot.status}`)}
                  </StatusChip>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {canManage && cycles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("lots.new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createLotAction}
              className="grid gap-4 sm:grid-cols-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="cropCycleId">{t("lots.cycle")}</Label>
                <select
                  id="cropCycleId"
                  name="cropCycleId"
                  required
                  className={selectClass}
                >
                  {cycles.map(({ cycle }) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("lots.name")}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder={t("lots.namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">{t("lots.notes")}</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("lots.create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
