import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listBudgets } from "@/server/services/budgets";
import { listFarms } from "@/server/services/farms";
import { listCycles } from "@/server/services/cycles";
import {
  createBudgetAction,
  deleteBudgetAction,
} from "@/server/actions/budgets";
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

const selectClass =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

export default async function BudgetsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "budgets")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=budgets`);
  }

  const t = await getTranslations("budgets");

  const [rows, farms, cycles] = await Promise.all([
    listBudgets(ctx),
    listFarms(ctx),
    listCycles(ctx),
  ]);
  const canManage = can(ctx.role, "budget", "manage");

  function scopeLabel(farmName: string | null, cycleName: string | null) {
    if (farmName && cycleName) {
      return t("scope.farmAndCycle", { farm: farmName, cycle: cycleName });
    }
    if (farmName) return t("scope.farm", { name: farmName });
    if (cycleName) return t("scope.cycle", { name: cycleName });
    return t("scope.org");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {rows.map(({ budget, farmName, cycleName }) => (
              <div
                key={budget.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <Link
                  href={`/o/${orgSlug}/budgets/${budget.id}`}
                  className="min-w-0 flex-1"
                >
                  <p className="font-medium">
                    {budget.name}{" "}
                    <span className="text-muted-foreground">
                      ({budget.year})
                    </span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {scopeLabel(farmName, cycleName)} · {budget.currencyCode}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusChip
                    family="life"
                    state={budget.status as "draft" | "active"}
                  >
                    {t(`status.${budget.status}`)}
                  </StatusChip>
                  {canManage && (
                    <form action={deleteBudgetAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="id" value={budget.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        {t("delete")}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createBudgetAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="year">{t("year")}</Label>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  required
                  defaultValue={new Date().getFullYear()}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="farmId">{t("farm")}</Label>
                <select
                  id="farmId"
                  name="farmId"
                  defaultValue=""
                  className={selectClass}
                >
                  <option value="">{t("farmNone")}</option>
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cropCycleId">{t("cycle")}</Label>
                <select
                  id="cropCycleId"
                  name="cropCycleId"
                  defaultValue=""
                  className={selectClass}
                >
                  <option value="">{t("cycleNone")}</option>
                  {cycles.map(({ cycle, farmName }) => (
                    <option key={cycle.id} value={cycle.id}>
                      {farmName} — {cycle.name}
                    </option>
                  ))}
                </select>
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
