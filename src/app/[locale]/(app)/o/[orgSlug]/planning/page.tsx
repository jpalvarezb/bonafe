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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

// Calendar-cell mini badge is too small/dense for the standard StatusChip
// shape (font-mono, larger padding) — this keeps the compact custom layout
// while pulling colors from the same life-* tokens StatusChip uses.
const CALENDAR_CHIP_CLASS: Record<PlannedActivityStatus, string> = {
  planned: "bg-life-planned-bg text-life-planned-fg",
  converted: "bg-life-converted-bg text-life-converted-fg",
  cancelled: "bg-life-cancelled-bg text-life-cancelled-fg line-through",
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
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/o/${orgSlug}/planning?year=${prev.year}&month=${prev.month}`}
            >
              {t("prevMonth")}
            </Link>
          </Button>
          <span className="min-w-32 text-center font-medium capitalize">
            {monthLabel}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/o/${orgSlug}/planning?year=${next.year}&month=${next.month}`}
            >
              {t("nextMonth")}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("summary.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">
              {t("summary.items")}:{" "}
            </span>
            <span className="font-medium">{rows.length}</span>
          </p>
          <p>
            <span className="text-muted-foreground">
              {t("summary.estimatedCost")}:{" "}
            </span>
            <span className="font-medium">
              {formatCost(totalEstimatedCost.toFixed(4))}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">
              {t("status.planned")}:{" "}
            </span>
            <span className="font-medium">{counts.planned}</span>
          </p>
          <p>
            <span className="text-muted-foreground">
              {t("status.converted")}:{" "}
            </span>
            <span className="font-medium">{counts.converted}</span>
          </p>
          <p>
            <span className="text-muted-foreground">
              {t("status.cancelled")}:{" "}
            </span>
            <span className="font-medium">{counts.cancelled}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAY_KEYS.map((key) => (
              <div key={key} className="py-1">
                {t(`weekdays.${key}`)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => (
              <div
                key={i}
                className={
                  day === null
                    ? "min-h-20 rounded-md"
                    : "min-h-20 rounded-md border p-1"
                }
              >
                {day !== null && (
                  <>
                    <p className="text-xs text-muted-foreground">{day}</p>
                    <div className="mt-1 flex flex-col gap-1">
                      {(rowsByDay.get(day) ?? []).map((row) => (
                        <span
                          key={row.plan.id}
                          title={`${row.typeName}${
                            row.parcelName ? " · " + row.parcelName : ""
                          }`}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            CALENDAR_CHIP_CLASS[
                              row.plan.status as PlannedActivityStatus
                            ]
                          }`}
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
            ))}
          </div>
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
                  <th className="px-4 py-2 font-medium">{t("table.type")}</th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.parcel")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.cycle")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.estimatedCost")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("table.status")}
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ plan: item, typeName, parcelName, cycleName }) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2">{item.plannedDate}</td>
                    <td className="px-4 py-2">{typeName}</td>
                    <td className="px-4 py-2">{parcelName ?? "—"}</td>
                    <td className="px-4 py-2">{cycleName ?? "—"}</td>
                    <td className="px-4 py-2">
                      {formatCost(item.estimatedCost)}
                    </td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-right">
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
                            <Button variant="outline" size="sm" type="submit">
                              {t("convert")}
                            </Button>
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
                            <Button variant="ghost" size="sm" type="submit">
                              {t("cancel")}
                            </Button>
                          </form>
                        )}
                        {item.status === "converted" && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/o/${orgSlug}/activities`}>
                              {t("viewActivity")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
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
