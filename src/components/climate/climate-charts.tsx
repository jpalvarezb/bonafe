import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export type ClimateChartReading = {
  date: string;
  rainfallMm: string | null;
  tempMinC: string | null;
  tempMaxC: string | null;
};

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/** One token-colored bar, height driven by inline style (`pct`) so the
 * className stays a static Tailwind literal — same idiom as the dashboard
 * panel's rainfall strip (dashboard-panel.tsx's `Bar`). A 2% floor keeps
 * zero-value days visible as a hairline instead of vanishing. */
function Bar({
  pct,
  className,
}: Readonly<{ pct: number; className: string }>) {
  return (
    <div
      className={cn("flex-1", className)}
      style={{ height: `${Math.max(pct, 2)}%` }}
    />
  );
}

/**
 * Rainfall + temperature trend strips for the climate page — plain
 * server-rendered token bars (no client JS, no charting library, no raw hex
 * colors), matching the WP-C dashboard-panel rainfall strip aesthetic. Kept
 * as a server component since nothing here is interactive.
 */
export async function ClimateCharts({
  readings,
}: Readonly<{ readings: ClimateChartReading[] }>) {
  const t = await getTranslations("climate");

  if (readings.length === 0) {
    return (
      <p className="text-[length:var(--density-font-body)] text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  const first = readings[0].date;
  const last = readings[readings.length - 1].date;

  const rainfallValues = readings.map((r) =>
    r.rainfallMm !== null ? Number(r.rainfallMm) : 0,
  );
  const maxRainfall = Math.max(0, ...rainfallValues);

  const tempValues = readings
    .flatMap((r) => [r.tempMaxC, r.tempMinC])
    .filter((v): v is string => v !== null)
    .map(Number);
  const maxTemp = Math.max(0, ...tempValues);
  // Axis floor: 0 for the common all-positive case, but extend below zero
  // when frost readings exist so negative bars scale instead of clamping
  // to the visibility floor (a -3C night must not render like a 0C day).
  const minTemp = Math.min(0, ...(tempValues.length ? tempValues : [0]));
  const tempRange = maxTemp - minTemp;

  return (
    <div className="flex flex-col gap-6">
      {/* Rainfall strip */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={MICRO_LABEL}>{t("chartRainfall")}</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {t("axisMax", { value: maxRainfall.toFixed(1) })} mm
          </span>
        </div>
        <div className="mt-2 flex h-20 items-end gap-px border-b border-border">
          {readings.map((r, i) => {
            // A day with no reading renders as a gap; only a real 0 mm dry
            // day gets the hairline floor (null and zero must not look alike).
            if (r.rainfallMm === null) {
              return <div key={`${r.date}-${i}`} className="flex-1" />;
            }
            const value = Number(r.rainfallMm);
            const pct = maxRainfall > 0 ? (value / maxRainfall) * 100 : 0;
            return (
              <Bar key={`${r.date}-${i}`} pct={pct} className="bg-accent-link/50" />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted-foreground">
          <span>{first}</span>
          <span>{last}</span>
        </div>
      </div>

      {/* Temperature strip — max/min as two token-colored bars per day,
          scaled against the fetched range's max so both series share one
          readable baseline. */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={MICRO_LABEL}>{t("chartTemperature")}</span>
          <span className="flex items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-[7px] bg-foreground/70" />
              {t("tempMaxC")}
            </span>
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-[7px] bg-muted-foreground/50" />
              {t("tempMinC")}
            </span>
          </span>
        </div>
        <div className="mt-2 flex h-20 items-end gap-px border-b border-border">
          {readings.map((r, i) => {
            const maxV = r.tempMaxC !== null ? Number(r.tempMaxC) : null;
            const minV = r.tempMinC !== null ? Number(r.tempMinC) : null;
            const maxPct =
              maxV !== null && tempRange > 0
                ? ((maxV - minTemp) / tempRange) * 100
                : 0;
            const minPct =
              minV !== null && tempRange > 0
                ? ((minV - minTemp) / tempRange) * 100
                : 0;
            return (
              <div key={`${r.date}-${i}`} className="flex h-full flex-1 items-end gap-px">
                {maxV !== null && <Bar pct={maxPct} className="bg-foreground/70" />}
                {minV !== null && (
                  <Bar pct={minPct} className="bg-muted-foreground/50" />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted-foreground">
          <span>{first}</span>
          <span>{t("axisMax", { value: maxTemp.toFixed(1) })}°C</span>
          <span>{last}</span>
        </div>
      </div>
    </div>
  );
}
