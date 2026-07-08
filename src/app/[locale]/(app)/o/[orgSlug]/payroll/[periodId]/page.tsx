import { notFound, redirect } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import Decimal from "decimal.js";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  getPayrollPeriod,
  listPayrollEntries,
} from "@/server/services/payroll";
import { listAttendanceRange } from "@/server/services/attendance";
import { listWorkers } from "@/server/services/workers";
import {
  closePayrollPeriodAction,
  generatePayrollEntriesAction,
  updatePayrollEntryAction,
} from "@/server/actions/payroll";
import { periodTotal, type AttendanceStatus } from "@/lib/calc/payroll";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { DayStrip, dayStripClass } from "@/components/payroll/day-strip";
import { cn } from "@/lib/utils";

// Density-driven building blocks — office mode gets 28/24px sizing, field
// mode gets 56/48px glove targets, from the same className strings
// (globals.css [data-mode="field"]). Mirrors WP-A/WP-B so the payroll book
// reads as one system with attendance and work orders.
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CELL_X = "px-[var(--density-cell-px)]";
const NUM_CELL = `tabular text-right font-mono text-[length:var(--density-font-body)] ${CELL_X}`;

// Board-1i column order: # / trabajador / jornales / h. extra / devengado /
// extra / destajo / bonif. / deducc. / neto / días marcados. Two static
// templates (Tailwind v4 statically analyzable strings): the read-only book
// and the open+manage book whose bonif./deducc. cells are inputs plus a
// trailing save column.
const GRID_RO =
  "grid grid-cols-[30px_minmax(150px,1.6fr)_0.7fr_0.7fr_0.9fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr_minmax(130px,1.4fr)]";
const GRID_EDIT =
  "grid grid-cols-[30px_minmax(150px,1.6fr)_0.7fr_0.7fr_0.9fr_0.8fr_0.8fr_minmax(90px,1fr)_minmax(90px,1fr)_1fr_minmax(130px,1.4fr)_auto]";

const STRIP_STATUSES: ReadonlyArray<AttendanceStatus | "none"> = [
  "present",
  "half_day",
  "absent",
  "sick",
  "leave",
  "none",
];

/**
 * Calendar days of the period, inclusive, as ISO strings. Date-only values
 * walked in UTC so the strip never gains/loses a day to the server TZ.
 * Capped at 62 squares — beyond two months a per-day strip stops being
 * legible and a pathological custom range shouldn't render thousands of
 * cells.
 */
function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return days;
  for (let ts = start; ts <= end && days.length < 62; ts += 86_400_000) {
    days.push(new Date(ts).toISOString().slice(0, 10));
  }
  return days;
}

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
  const ta = await getTranslations("attendance");
  const format = await getFormatter();

  const period = await getPayrollPeriod(ctx, periodId);
  if (!period) notFound();

  // Existing withOrgRls-wrapped reads only: the entries book, the period's
  // attendance window (feeds the días-marcados strip), and the worker
  // roster (T-codes; includeInactive so historic entries keep their code).
  const [entries, attendanceRows, allWorkers] = await Promise.all([
    listPayrollEntries(ctx, periodId),
    listAttendanceRange(ctx, {
      from: period.startDate,
      to: period.endDate,
    }),
    listWorkers(ctx, { includeInactive: true }),
  ]);

  const canManage = can(ctx.role, "payroll", "manage");
  const isOpen = period.status === "open";
  const editable = canManage && isOpen;
  const grid = editable ? GRID_EDIT : GRID_RO;

  const money = (value: string) =>
    format.number(Number(value), {
      style: "currency",
      currency: period.currencyCode,
    });

  const workerCodeById = new Map(
    allWorkers.map((worker) => [worker.id, worker.code]),
  );

  const statusByWorkerDay = new Map<string, AttendanceStatus>();
  for (const row of attendanceRows) {
    statusByWorkerDay.set(
      `${row.record.workerId}|${row.record.date}`,
      row.record.status as AttendanceStatus,
    );
  }
  const periodDays = enumerateDays(period.startDate, period.endDate);
  const stripDays = (workerId: string) =>
    periodDays.map((date) => ({
      date,
      status: statusByWorkerDay.get(`${workerId}|${date}`) ?? null,
    }));

  // DayStrip does NOT translate (StatusChip idiom) — the page hands it the
  // already-translated status labels once.
  const stripLabels: Record<AttendanceStatus | "none", string> = {
    present: ta("statuses.present"),
    half_day: ta("statuses.half_day"),
    absent: ta("statuses.absent"),
    sick: ta("statuses.sick"),
    leave: ta("statuses.leave"),
    none: t("entries.noRecord"),
  };

  // Column totals composed with Decimal in the RSC (money never floats).
  const sumOf = (pick: (entry: (typeof entries)[number]["entry"]) => string) =>
    entries
      .reduce((acc, row) => acc.add(new Decimal(pick(row.entry))), new Decimal(0))
      .toFixed(2);
  const totals = {
    days: sumOf((entry) => entry.daysWorked),
    hours: sumOf((entry) => entry.hoursWorked),
    base: sumOf((entry) => entry.baseAmount),
    overtime: sumOf((entry) => entry.overtimeAmount),
    piecework: sumOf((entry) => entry.pieceworkAmount),
    bonuses: sumOf((entry) => entry.bonuses),
    deductions: sumOf((entry) => entry.deductions),
    net: periodTotal(entries.map(({ entry }) => entry)),
  };

  const deduction = (value: string, className?: string) => {
    const zero = new Decimal(value).isZero();
    return (
      <span
        className={cn(
          NUM_CELL,
          zero ? "text-muted-foreground" : "text-fin-negative",
          className,
        )}
      >
        {/* abs() guards a hypothetical negative correction from rendering −−5 */}
        {zero ? money(value) : `−${money(new Decimal(value).abs().toString())}`}
      </span>
    );
  };

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      {/* Board-1i header row: Planilla / period name · mono range · chip,
          actions right. "Exportar CSV / Ver recibos" from the board have no
          backing routes/actions — not rendered (no dead controls). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <span aria-hidden className="text-border">
          /
        </span>
        <span className="text-sm text-muted-foreground">{period.name}</span>
        <span className="tabular font-mono text-[11px] text-muted-foreground">
          {period.startDate} – {period.endDate}
        </span>
        <StatusChip family="life" state={period.status as "open" | "closed"}>
          {t(`status.${period.status}`)}
        </StatusChip>
        {canManage && isOpen && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <form action={generatePayrollEntriesAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="periodId" value={period.id} />
              <button
                type="submit"
                className="h-[var(--density-control-h)] rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {entries.length === 0 ? t("generate") : t("regenerate")}
              </button>
            </form>
            {entries.length > 0 && (
              <form action={closePayrollPeriodAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="periodId" value={period.id} />
                <button
                  type="submit"
                  className="h-[var(--density-control-h)] rounded-[3px] bg-foreground px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t("close")}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Closed-period banner. Schema has closedAt but no closedBy, and no
          reopen action exists — so no "por M. Castillo" and no reopen hint
          from the board (nothing rendered that the system can't do). */}
      {!isOpen && (
        <div className="flex items-center gap-2 rounded-[3px] border border-border bg-muted/50 px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
          <span
            aria-hidden
            className="size-[6px] shrink-0 bg-muted-foreground"
          />
          <span className="text-[length:var(--density-font-body)] text-muted-foreground">
            {period.closedAt
              ? t("closedBanner", {
                  date: format.dateTime(period.closedAt, {
                    dateStyle: "medium",
                  }),
                })
              : t("closedReadOnly")}
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-[length:var(--density-font-body)] text-muted-foreground">
          {t("entries.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-border">
          <div className={editable ? "min-w-[1120px]" : "min-w-[1020px]"}>
            {/* column heads */}
            <div
              className={cn(
                grid,
                "items-center border-b border-border bg-muted/40 py-[var(--density-cell-py)]",
              )}
            >
              <span className={cn(MICRO_LABEL, "pl-[var(--density-cell-px)]")}>
                #
              </span>
              <span className={cn(MICRO_LABEL, CELL_X)}>
                {t("entries.worker")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.days")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.hoursShort")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.base")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.overtime")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.piecework")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.bonusesShort")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.deductionsShort")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X, "text-right")}>
                {t("entries.netShort")}
              </span>
              <span className={cn(MICRO_LABEL, CELL_X)}>
                {t("entries.daysMarked")}
              </span>
              {editable && <span />}
            </div>

            {/* worker rows */}
            {entries.map(({ entry, workerName }, index) => {
              const workerCode = workerCodeById.get(entry.workerId);
              const rowBody = (
                <>
                  <div
                    className={cn(
                      grid,
                      "min-h-[var(--density-row-h)] items-center",
                    )}
                  >
                    <span className="tabular pl-[var(--density-cell-px)] font-mono text-[10px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        CELL_X,
                        "flex min-w-0 items-baseline gap-1.5 text-[length:var(--density-font-body)]",
                      )}
                    >
                      <Link
                        href={`/o/${orgSlug}/workers/${entry.workerId}`}
                        className="truncate text-accent-link hover:underline"
                      >
                        {workerName}
                      </Link>
                      {workerCode && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {workerCode}
                        </span>
                      )}
                    </span>
                    <span className={NUM_CELL}>{entry.daysWorked}</span>
                    <span className={cn(NUM_CELL, "text-muted-foreground")}>
                      {entry.hoursWorked}
                    </span>
                    <span className={NUM_CELL}>{money(entry.baseAmount)}</span>
                    <span className={cn(NUM_CELL, "text-muted-foreground")}>
                      {money(entry.overtimeAmount)}
                    </span>
                    <span className={cn(NUM_CELL, "text-muted-foreground")}>
                      {money(entry.pieceworkAmount)}
                    </span>
                    {editable ? (
                      <span className={CELL_X}>
                        <Input
                          name="bonuses"
                          defaultValue={entry.bonuses}
                          className={cn(
                            CONTROL,
                            "tabular w-full min-w-0 text-right font-mono",
                          )}
                        />
                      </span>
                    ) : (
                      <span className={cn(NUM_CELL, "text-muted-foreground")}>
                        {money(entry.bonuses)}
                      </span>
                    )}
                    {editable ? (
                      <span className={CELL_X}>
                        <Input
                          name="deductions"
                          defaultValue={entry.deductions}
                          className={cn(
                            CONTROL,
                            "tabular w-full min-w-0 text-right font-mono",
                          )}
                        />
                      </span>
                    ) : (
                      deduction(entry.deductions)
                    )}
                    <span className={cn(NUM_CELL, "font-semibold")}>
                      {money(entry.netAmount)}
                    </span>
                    <DayStrip
                      days={stripDays(entry.workerId)}
                      labels={stripLabels}
                      label={t("entries.daysMarked")}
                      className={CELL_X}
                    />
                    {editable && (
                      <span className="pr-[var(--density-cell-px)]">
                        <button
                          type="submit"
                          className="h-[var(--density-control-h)] rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {t("entries.save")}
                        </button>
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className={cn(CELL_X, "pb-[var(--density-cell-py)]")}>
                      <Input
                        name="notes"
                        defaultValue={entry.notes ?? ""}
                        placeholder={t("entries.notesPlaceholder")}
                        className={cn(CONTROL, "w-full max-w-md")}
                      />
                    </div>
                  )}
                  {!editable && entry.notes && (
                    <p
                      className={cn(
                        CELL_X,
                        "pb-[var(--density-cell-py)] text-[length:var(--density-font-label)] text-muted-foreground",
                      )}
                    >
                      {entry.notes}
                    </p>
                  )}
                </>
              );

              if (!editable) {
                return (
                  <div
                    key={entry.id}
                    className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    {rowBody}
                  </div>
                );
              }

              return (
                <form
                  key={entry.id}
                  action={updatePayrollEntryAction}
                  className="border-b border-border py-1 transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="periodId" value={period.id} />
                  <input type="hidden" name="entryId" value={entry.id} />
                  {rowBody}
                </form>
              );
            })}

            {/* totals row */}
            <div
              className={cn(
                grid,
                "min-h-[var(--density-row-h)] items-center border-t border-border bg-muted/40 font-semibold",
              )}
            >
              <span />
              <span
                className={cn(
                  CELL_X,
                  "text-[length:var(--density-font-body)]",
                )}
              >
                {t("entries.totalRow", { count: entries.length })}
              </span>
              <span className={NUM_CELL}>{totals.days}</span>
              <span className={cn(NUM_CELL, "text-muted-foreground")}>
                {totals.hours}
              </span>
              <span className={NUM_CELL}>{money(totals.base)}</span>
              <span className={cn(NUM_CELL, "text-muted-foreground")}>
                {money(totals.overtime)}
              </span>
              <span className={cn(NUM_CELL, "text-muted-foreground")}>
                {money(totals.piecework)}
              </span>
              <span className={cn(NUM_CELL, "text-muted-foreground")}>
                {money(totals.bonuses)}
              </span>
              {deduction(totals.deductions, "font-semibold")}
              <span className={cn(NUM_CELL, "font-bold")}>
                {money(totals.net)}
              </span>
              <span />
              {editable && <span />}
            </div>

            {/* legend. The board's "Tarifa base L 140.00/jornal · extra
                ×1.25" is omitted: rates are per-attendance-row snapshots
                and vary per worker — no single period rate exists. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
              <span className={MICRO_LABEL}>{t("entries.daysMarked")}</span>
              {STRIP_STATUSES.map((status) => (
                <span
                  key={status}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className={cn("h-[12px] w-[8px]", dayStripClass(status))}
                  />
                  {stripLabels[status]}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
