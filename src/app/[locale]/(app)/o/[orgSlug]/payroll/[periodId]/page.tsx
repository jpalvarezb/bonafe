import { notFound, redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  getPayrollPeriod,
  listPayrollEntries,
} from "@/server/services/payroll";
import {
  closePayrollPeriodAction,
  generatePayrollEntriesAction,
  updatePayrollEntryAction,
} from "@/server/actions/payroll";
import { periodTotal } from "@/lib/calc/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const GRID_COLS =
  "grid-cols-[1.4fr_0.6fr_0.6fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_auto]";

export default async function PayrollPeriodDetailPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; periodId: string }>;
}>) {
  const { locale, orgSlug, periodId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "payroll")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=payroll`);
  }

  const t = await getTranslations("payroll");
  const format = await getFormatter();

  const period = await getPayrollPeriod(ctx, periodId);
  if (!period) notFound();

  const entries = await listPayrollEntries(ctx, periodId);
  const canManage = can(ctx.role, "payroll", "manage");
  const isOpen = period.status === "open";

  const money = (value: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: period.currencyCode,
    });

  const runningTotal = periodTotal(entries.map(({ entry }) => entry));

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{period.name}</h1>
          <p className="text-sm text-muted-foreground">
            {period.startDate} – {period.endDate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip
            family="life"
            state={period.status as "open" | "closed"}
          >
            {t(`status.${period.status}`)}
          </StatusChip>
          {canManage && isOpen && (
            <>
              <form action={generatePayrollEntriesAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="periodId" value={period.id} />
                <Button type="submit" variant="outline" size="sm">
                  {entries.length === 0
                    ? t("generate")
                    : t("regenerate")}
                </Button>
              </form>
              {entries.length > 0 && (
                <form action={closePayrollPeriodAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="periodId" value={period.id} />
                  <Button type="submit" size="sm">
                    {t("close")}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t("entries.empty")}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("entries.title")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[900px]">
              <div
                className={`grid ${GRID_COLS} gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground`}
              >
                <span>{t("entries.worker")}</span>
                <span>{t("entries.days")}</span>
                <span>{t("entries.hours")}</span>
                <span>{t("entries.base")}</span>
                <span>{t("entries.overtime")}</span>
                <span>{t("entries.bonuses")}</span>
                <span>{t("entries.deductions")}</span>
                <span>{t("entries.net")}</span>
                <span />
              </div>
              {entries.map(({ entry, workerName }) => {
                const editable = canManage && isOpen;
                const rowBody = (
                  <>
                    <div
                      className={`grid ${GRID_COLS} items-center gap-x-3 text-sm`}
                    >
                      <span className="truncate font-medium">
                        {workerName}
                      </span>
                      <span>{entry.daysWorked}</span>
                      <span>{entry.hoursWorked}</span>
                      <span>{money(entry.baseAmount)}</span>
                      <span>{money(entry.overtimeAmount)}</span>
                      {editable ? (
                        <Input
                          name="bonuses"
                          defaultValue={entry.bonuses}
                          className="h-8"
                        />
                      ) : (
                        <span>{money(entry.bonuses)}</span>
                      )}
                      {editable ? (
                        <Input
                          name="deductions"
                          defaultValue={entry.deductions}
                          className="h-8"
                        />
                      ) : (
                        <span>{money(entry.deductions)}</span>
                      )}
                      <span className="font-semibold">
                        {money(entry.netAmount)}
                      </span>
                      {editable ? (
                        <Button type="submit" size="sm" variant="outline">
                          {t("entries.save")}
                        </Button>
                      ) : (
                        <span />
                      )}
                    </div>
                    {editable && (
                      <Input
                        name="notes"
                        defaultValue={entry.notes ?? ""}
                        placeholder={t("entries.notesPlaceholder")}
                        className="h-8 max-w-md"
                      />
                    )}
                    {!editable && entry.notes && (
                      <p className="text-sm text-muted-foreground">
                        {entry.notes}
                      </p>
                    )}
                  </>
                );

                if (!editable) {
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
                    >
                      {rowBody}
                    </div>
                  );
                }

                return (
                  <form
                    key={entry.id}
                    action={updatePayrollEntryAction}
                    className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0"
                  >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="periodId" value={period.id} />
                    <input type="hidden" name="entryId" value={entry.id} />
                    {rowBody}
                  </form>
                );
              })}
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-between font-semibold">
            <span>{t("entries.total")}</span>
            <span>{money(runningTotal)}</span>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
