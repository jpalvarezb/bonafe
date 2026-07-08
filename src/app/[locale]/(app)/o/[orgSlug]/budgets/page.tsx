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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

// Same density building blocks as the payroll periods list / work-orders
// screens (globals.css [data-mode="field"] retunes these for field mode).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

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
        <p className="text-[length:var(--density-font-body)] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col rounded-[3px] border border-border">
          {rows.map(({ budget, farmName, cycleName }) => (
            <div
              key={budget.id}
              className={cn(
                CELL,
                "flex min-h-[var(--density-row-h)] items-center justify-between gap-4 border-b border-border transition-colors last:border-b-0 hover:bg-muted/40",
              )}
            >
              <Link
                href={`/o/${orgSlug}/budgets/${budget.id}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-[length:var(--density-font-body)] font-medium">
                  {budget.name}{" "}
                  <span className="font-mono text-muted-foreground">
                    ({budget.year})
                  </span>
                </p>
                <p className="tabular truncate font-mono text-[11px] text-muted-foreground">
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
                    <button
                      type="submit"
                      className="inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      {t("delete")}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <section className="flex flex-col rounded-[3px] border border-border">
          <div className={cn(CELL, "border-b border-border")}>
            <h2 className={MICRO_LABEL}>{t("new")}</h2>
          </div>
          <form
            action={createBudgetAction}
            className="grid gap-4 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name" className={MICRO_LABEL}>
                {t("name")}
              </Label>
              <Input
                id="name"
                name="name"
                required
                placeholder={t("namePlaceholder")}
                className={CONTROL}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="year" className={MICRO_LABEL}>
                {t("year")}
              </Label>
              <Input
                id="year"
                name="year"
                type="number"
                min={2000}
                max={2100}
                step={1}
                required
                defaultValue={new Date().getFullYear()}
                className={cn(CONTROL, "tabular font-mono")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="farmId" className={MICRO_LABEL}>
                {t("farm")}
              </Label>
              <select
                id="farmId"
                name="farmId"
                defaultValue=""
                className={CONTROL}
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
              <Label htmlFor="cropCycleId" className={MICRO_LABEL}>
                {t("cycle")}
              </Label>
              <select
                id="cropCycleId"
                name="cropCycleId"
                defaultValue=""
                className={CONTROL}
              >
                <option value="">{t("cycleNone")}</option>
                {cycles.map(({ cycle, farmName }) => (
                  <option key={cycle.id} value={cycle.id}>
                    {farmName} — {cycle.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-[var(--density-control-h)] self-end justify-self-start rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90"
            >
              {t("create")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
