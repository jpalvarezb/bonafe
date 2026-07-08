import { getTranslations } from "next-intl/server";
import type { OrgContext } from "@/lib/tenancy";
import {
  activitiesForTimeline,
  cycleRainfallAccumulation,
} from "@/server/reports/climate";
import { RainActivityChart } from "./rain-activity-chart";

const MICRO_LABEL =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** Every calendar day in [from, to] inclusive, as YYYY-MM-DD strings. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function RainActivityTimeline({
  ctx,
  cycleId,
}: Readonly<{ ctx: OrgContext; cycleId: string }>) {
  const t = await getTranslations("climate");

  const [accumulation, cycleActivities] = await Promise.all([
    cycleRainfallAccumulation(ctx, cycleId),
    activitiesForTimeline(ctx, cycleId),
  ]);

  const rainByDate = new Map(
    accumulation.daily.map((row) => [row.date, Number(row.rainfallMm ?? 0)]),
  );
  const days = dateRange(accumulation.from, accumulation.to).map((date) => ({
    date,
    rainfallMm: rainByDate.get(date) ?? 0,
  }));

  return (
    <div className="border border-border">
      <div className="px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">{t("timelineTitle")}</span>
      </div>
      <div className="flex flex-col gap-4 border-t border-border px-3.5 py-3">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className={MICRO_LABEL}>{t("accumulatedTotal")}</p>
            <p className="tabular mt-0.5 font-mono text-[22px] font-semibold">
              {accumulation.totalMm} mm
            </p>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {t("accumulatedRange", {
              from: accumulation.from,
              to: accumulation.to,
            })}{" "}
            · {t("accumulatedDays", { days: accumulation.days })}
          </p>
        </div>

        {accumulation.days === 0 ? (
          <div className="rounded-[3px] border border-border bg-muted/40 p-4 text-[length:var(--density-font-body)] text-muted-foreground">
            <p>{t("timelineEmpty")}</p>
            <p>{t("timelineEmptyHint")}</p>
          </div>
        ) : (
          <RainActivityChart days={days} activities={cycleActivities} />
        )}
      </div>
    </div>
  );
}
