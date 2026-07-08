import { redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listPayrollPeriods } from "@/server/services/payroll";
import { createPayrollPeriodAction } from "@/server/actions/payroll";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

// Same density building blocks as the period detail / WP-A / WP-B screens.
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

export default async function PayrollPeriodsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "payroll")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=payroll`);
  }

  const t = await getTranslations("payroll");
  const format = await getFormatter();

  const periods = await listPayrollPeriods(ctx);
  const canManage = can(ctx.role, "payroll", "manage");

  const money = (value: string, currencyCode: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: currencyCode,
    });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {periods.length === 0 ? (
        <p className="text-[length:var(--density-font-body)] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col rounded-[3px] border border-border">
          {periods.map((period) => (
            <Link
              key={period.id}
              href={`/o/${orgSlug}/payroll/${period.id}`}
              className={cn(
                CELL,
                "flex min-h-[var(--density-row-h)] items-center justify-between gap-4 border-b border-border transition-colors last:border-b-0 hover:bg-muted/40",
              )}
            >
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="truncate text-[length:var(--density-font-body)] font-medium">
                  {period.name}
                </span>
                <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">
                  {period.startDate} – {period.endDate}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular font-mono text-[length:var(--density-font-body)] font-semibold">
                  {money(period.totalAmount, period.currencyCode)}
                </span>
                <StatusChip
                  family="life"
                  state={period.status as "open" | "closed"}
                >
                  {t(`status.${period.status}`)}
                </StatusChip>
              </div>
            </Link>
          ))}
        </div>
      )}

      {canManage && (
        <section className="flex flex-col rounded-[3px] border border-border">
          <div className={cn(CELL, "border-b border-border")}>
            <h2 className={MICRO_LABEL}>{t("new")}</h2>
          </div>
          <form
            action={createPayrollPeriodAction}
            className="grid gap-4 p-4 sm:grid-cols-3"
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
              <Label htmlFor="startDate" className={MICRO_LABEL}>
                {t("startDate")}
              </Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                required
                className={cn(CONTROL, "tabular font-mono")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate" className={MICRO_LABEL}>
                {t("endDate")}
              </Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                required
                className={cn(CONTROL, "tabular font-mono")}
              />
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
