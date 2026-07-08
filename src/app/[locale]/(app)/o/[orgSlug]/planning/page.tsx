import Decimal from "decimal.js";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import {
  listPlannedActivities,
  type PlannedActivityRow,
  type PlannedActivityStatus,
} from "@/server/services/planning";
import {
  cancelPlannedActivityAction,
  convertPlannedActivityAction,
} from "@/server/actions/planning";
import { listParcels } from "@/server/services/parcels";
import { listCycles } from "@/server/services/cycles";
import { listActivityTypes } from "@/server/services/catalog";
import { PlanningForm } from "@/components/planning/planning-form";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

// Same density building blocks as the payroll/work-orders/dashboard screens
// (globals.css [data-mode="field"] retunes these for field mode).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

// Calendar-cell mini badge is too small/dense for the standard StatusChip
// shape (font-mono, larger padding) — this keeps the compact custom layout
// while pulling colors from the same life-* tokens StatusChip uses.
const CALENDAR_CHIP_CLASS: Record<PlannedActivityStatus, string> = {
  planned: "bg-life-planned-bg text-life-planned-fg",
  converted: "bg-life-converted-bg text-life-converted-fg",
  cancelled: "bg-life-cancelled-bg text-life-cancelled-fg line-through",
};

const SUMMARY_COUNT_CLASS: Record<PlannedActivityStatus, string> = {
  planned: "text-life-planned-fg",
  converted: "text-life-converted-fg",
  cancelled: "text-life-cancelled-fg",
};

// Monday-first week, labelled explicitly in messages/planning.json.
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function clampMonth(value: number, fallback: number): number {
  if (!value || value < 1 || value > 12) return fallback;
  return Math.trunc(value);
}

function clampYear(value: number, fallback: number): number {
  if (!value || value < 1970 || value > 2999) return fallback;
  return Math.trunc(value);
}

/** Previous/next month (1-12), wrapping the year — plain integer math. */
function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

/** Days in `month` (1-12) of `year`, via the "day 0 of next month" trick. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday, for the first day of the month (UTC). */
function firstWeekdayMondayFirst(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sun
  return (jsDay + 6) % 7;
}

function parcelAbbreviation(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

export default async function PlanningPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "planning")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=planning`);
  }

  const t = await getTranslations("planning");
  const format = await getFormatter();
  const sp = await searchParams;

  const today = new Date();
  const year = clampYear(Number(sp.year), today.getUTCFullYear());
  const month = clampMonth(Number(sp.month), today.getUTCMonth() + 1);
  const isCurrentMonth =
    year === today.getUTCFullYear() && month === today.getUTCMonth() + 1;
  const todayDate = today.getUTCDate();

  const [{ rows, counts }, parcels, cycles, activityTypes] =
    await Promise.all([
      listPlannedActivities(ctx, { year, month }),
      listParcels(ctx),
      listCycles(ctx, { status: "active" }),
      listActivityTypes(ctx),
    ]);

  const canManage = can(ctx.role, "planning", "manage");

  const rowsByDay = new Map<number, PlannedActivityRow[]>();
  for (const row of rows) {
    const day = Number(row.plan.plannedDate.slice(8, 10));
    const existing = rowsByDay.get(day);
    if (existing) existing.push(row);
    else rowsByDay.set(day, [row]);
  }

  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstWeekdayMondayFirst(year, month);
  const cells: Array<number | null> = [
    ...Array<null>(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  // Only "planned" (not yet executed) items carry a meaningful pending
  // estimate — converted activities track real costs on the activity itself.
  // Decimal throughout — money never floats.
  const totalEstimatedCost = rows
    .filter((row) => row.plan.status === "planned")
    .reduce((sum, row) => sum.plus(row.plan.estimatedCost), new Decimal(0));

  function formatCost(value: string): string {
    return format.number(Number(value), {
      style: "currency",
      currency: ctx.org.baseCurrencyCode,
      maximumFractionDigits: 2,
    });
  }

  const monthLabel = new Date(
    Date.UTC(year, month - 1, 1),
  ).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/o/${orgSlug}/planning?year=${prev.year}&month=${prev.month}`}
            className={BTN}
          >
            {t("prevMonth")}
          </Link>
          <span className="min-w-32 text-center font-mono text-[length:var(--density-font-body)] font-semibold capitalize">
            {monthLabel}
          </span>
          <Link
            href={`/o/${orgSlug}/planning?year=${next.year}&month=${next.month}`}
            className={BTN}
          >
            {t("nextMonth")}
          </Link>
        </div>
      </div>

      {/* Month summary — same KPI-strip idiom as the dashboard panel: mono
          microlabel + mono numeral per cell. */}
      <div className="grid grid-cols-2 border border-border sm:grid-cols-3 lg:grid-cols-5">
        <div
          className={cn(
            CELL,
            "border-b border-border sm:border-r sm:border-b-0",
          )}
        >
          <div className={MICRO_LABEL}>{t("summary.items")}</div>
          <div className="tabular mt-0.5 font-mono text-[18px] font-semibold">
            {rows.length}
          </div>
        </div>
        <div
          className={cn(
            CELL,
            "border-b border-border sm:border-r sm:border-b-0",
          )}
        >
          <div className={MICRO_LABEL}>{t("summary.estimatedCost")}</div>
          <div className="tabular mt-0.5 font-mono text-[18px] font-semibold">
            {formatCost(totalEstimatedCost.toFixed(4))}
          </div>
        </div>
        <div
          className={cn(
            CELL,
            "border-b border-border sm:border-b sm:border-r lg:border-b-0",
          )}
        >
          <div className={MICRO_LABEL}>{t("status.planned")}</div>
          <div
            className={cn(
              "tabular mt-0.5 font-mono text-[18px] font-semibold",
              SUMMARY_COUNT_CLASS.planned,
            )}
          >
            {counts.planned}
          </div>
        </div>
        <div
          className={cn(
            CELL,
            "border-border sm:border-b sm:border-r lg:border-b-0 lg:border-r",
          )}
        >
          <div className={MICRO_LABEL}>{t("status.converted")}</div>
          <div
            className={cn(
              "tabular mt-0.5 font-mono text-[18px] font-semibold",
              SUMMARY_COUNT_CLASS.converted,
            )}
          >
            {counts.converted}
          </div>
        </div>
        <div className={cn(CELL, "border-border")}>
          <div className={MICRO_LABEL}>{t("status.cancelled")}</div>
          <div
            className={cn(
              "tabular mt-0.5 font-mono text-[18px] font-semibold",
              SUMMARY_COUNT_CLASS.cancelled,
            )}
          >
            {counts.cancelled}
          </div>
        </div>
      </div>

      {/* Month grid — 1px-bordered day cells, mono day numbers, today
          subtly marked with the accent-link token. */}
      <div className="rounded-[3px] border border-border p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_KEYS.map((key) => (
            <div key={key} className={cn(MICRO_LABEL, "py-1 text-center")}>
              {t(`weekdays.${key}`)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            const isToday = isCurrentMonth && day === todayDate;
            return (
              <div
                key={i}
                className={cn(
                  "min-h-20 rounded-[3px]",
                  day !== null && "border border-border p-1",
                  isToday && "border-accent-link bg-accent-link/5",
                )}
              >
                {day !== null && (
                  <>
                    <p className="tabular font-mono text-[10px] text-muted-foreground">
                      {String(day).padStart(2, "0")}
                    </p>
                    <div className="mt-1 flex flex-col gap-1">
                      {(rowsByDay.get(day) ?? []).map((row) => (
                        <span
                          key={row.plan.id}
                          title={`${row.typeName}${
                            row.parcelName ? " · " + row.parcelName : ""
                          }`}
                          className={cn(
                            "truncate rounded-[3px] px-1 py-0.5 font-mono text-[9.5px] font-medium",
                            CALENDAR_CHIP_CLASS[
                              row.plan.status as PlannedActivityStatus
                            ],
                          )}
                        >
                          {row.typeName}
                          {row.parcelName
                            ? ` · ${parcelAbbreviation(row.parcelName)}`
                            : ""}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[length:var(--density-font-body)] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-border">
          <table className="w-full min-w-[760px] text-[length:var(--density-font-body)]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("table.date")}
                </th>
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("table.type")}
                </th>
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("table.parcel")}
                </th>
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("table.cycle")}
                </th>
                <th
                  className={cn(
                    MICRO_LABEL,
                    CELL,
                    "text-right font-semibold",
                  )}
                >
                  {t("table.estimatedCost")}
                </th>
                <th
                  className={cn(MICRO_LABEL, CELL, "text-left font-semibold")}
                >
                  {t("table.status")}
                </th>
                <th className={CELL} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ plan: item, typeName, parcelName, cycleName }) => (
                <tr
                  key={item.id}
                  className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <td
                    className={cn(
                      CELL,
                      "tabular font-mono text-muted-foreground",
                    )}
                  >
                    {item.plannedDate}
                  </td>
                  <td className={CELL}>{typeName}</td>
                  <td className={CELL}>{parcelName ?? "—"}</td>
                  <td className={CELL}>{cycleName ?? "—"}</td>
                  <td
                    className={cn(CELL, "tabular text-right font-mono")}
                  >
                    {formatCost(item.estimatedCost)}
                  </td>
                  <td className={CELL}>
                    <StatusChip
                      family="life"
                      state={item.status as PlannedActivityStatus}
                      className={
                        item.status === "cancelled"
                          ? "line-through"
                          : undefined
                      }
                    >
                      {t(`status.${item.status}`)}
                    </StatusChip>
                  </td>
                  <td className={cn(CELL, "text-right")}>
                    <div className="flex justify-end gap-2">
                      {canManage && item.status === "planned" && (
                        <form action={convertPlannedActivityAction}>
                          <input
                            type="hidden"
                            name="locale"
                            value={locale}
                          />
                          <input
                            type="hidden"
                            name="orgSlug"
                            value={orgSlug}
                          />
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className={BTN}>
                            {t("convert")}
                          </button>
                        </form>
                      )}
                      {canManage && item.status === "planned" && (
                        <form action={cancelPlannedActivityAction}>
                          <input
                            type="hidden"
                            name="locale"
                            value={locale}
                          />
                          <input
                            type="hidden"
                            name="orgSlug"
                            value={orgSlug}
                          />
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            className="inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {t("cancel")}
                          </button>
                        </form>
                      )}
                      {item.status === "converted" && (
                        <Link
                          href={`/o/${orgSlug}/activities`}
                          className="inline-flex h-[var(--density-control-h)] items-center px-[var(--density-cell-px)] text-[length:var(--density-font-body)] text-accent-link hover:underline"
                        >
                          {t("viewActivity")}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && activityTypes.length > 0 && (
        <PlanningForm
          locale={locale}
          orgSlug={orgSlug}
          year={year}
          month={month}
          activityTypes={activityTypes.map((a) => ({
            id: a.id,
            name: a.name,
          }))}
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
