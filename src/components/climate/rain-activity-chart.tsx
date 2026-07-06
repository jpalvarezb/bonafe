"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RainActivityChartDay = { date: string; rainfallMm: number };
export type RainActivityChartActivity = { date: string; typeName: string };

export function RainActivityChart({
  days,
  activities,
}: Readonly<{
  days: RainActivityChartDay[];
  activities: RainActivityChartActivity[];
}>) {
  const t = useTranslations("climate");

  const activityByDate = new Map<string, string[]>();
  for (const activity of activities) {
    const list = activityByDate.get(activity.date) ?? [];
    list.push(activity.typeName);
    activityByDate.set(activity.date, list);
  }

  const data = days.map((day) => ({
    date: day.date,
    rainfallMm: day.rainfallMm,
    activityLabel: activityByDate.get(day.date)?.join(", ") ?? null,
  }));

  return (
    <div className="flex flex-col gap-2">
      <ResponsiveContainer width="100%" height={288}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" fontSize={12} />
          <YAxis fontSize={12} allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as (typeof data)[number];
              return (
                <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
                  <p className="font-medium">{label}</p>
                  <p>
                    {t("rainfall")}: {point.rainfallMm} mm
                  </p>
                  {point.activityLabel && (
                    <p>
                      {t("timelineActivity")}: {point.activityLabel}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="rainfallMm"
            name={t("rainfall")}
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
          />
          {[...activityByDate.keys()].map((date) => (
            <ReferenceDot
              key={date}
              x={date}
              y={0}
              r={5}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={1}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {activityByDate.size > 0 && (
        <p className="text-xs text-muted-foreground">
          ● {t("timelineActivityHint")}
        </p>
      )}
    </div>
  );
}
