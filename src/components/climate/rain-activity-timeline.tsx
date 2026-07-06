import { getTranslations } from "next-intl/server";
import type { OrgContext } from "@/lib/tenancy";
import {
  activitiesForTimeline,
  cycleRainfallAccumulation,
} from "@/server/reports/climate";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RainActivityChart } from "./rain-activity-chart";

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
    <Card>
      <CardHeader>
        <CardTitle>{t("timelineTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {t("accumulatedTotal")}
            </p>
            <p className="text-3xl font-semibold">
              {accumulation.totalMm} mm
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("accumulatedRange", {
              from: accumulation.from,
              to: accumulation.to,
            })}{" "}
            · {t("accumulatedDays", { days: accumulation.days })}
          </p>
        </div>

        {accumulation.days === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <p>{t("timelineEmpty")}</p>
            <p>{t("timelineEmptyHint")}</p>
          </div>
        ) : (
          <RainActivityChart days={days} activities={cycleActivities} />
        )}
      </CardContent>
    </Card>
  );
}
