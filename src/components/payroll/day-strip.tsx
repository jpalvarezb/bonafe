import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/calc/payroll";

/**
 * Board-1i "Días marcados": one small solid square per calendar day of the
 * payroll period, colored by the worker's attendance status that day. Days
 * with no attendance row render neutral ("sin registro" / rest day).
 *
 * Tailwind v4 requires statically analyzable class names — every status is
 * spelled out (StatusChip idiom). Solid squares use the att `-fg` tokens
 * (the saturated member of each att triplet, theme-aware in dark mode);
 * "none" uses the neutral border token.
 */
const SQUARE_CLASSES: Record<AttendanceStatus | "none", string> = {
  present: "bg-att-present-fg",
  half_day: "bg-att-half-fg",
  absent: "bg-att-absent-fg",
  sick: "bg-att-sick-fg",
  leave: "bg-att-leave-fg",
  none: "bg-border",
};

/** Raw square tone class for a status — for the legend swatches. */
export function dayStripClass(status: AttendanceStatus | "none"): string {
  return SQUARE_CLASSES[status];
}

export type DayStripDay = {
  /** ISO date (YYYY-MM-DD) — used as the key and in the hover title. */
  date: string;
  /** Attendance status that day, or null when no record exists. */
  status: AttendanceStatus | null;
};

/**
 * Pure presentational; does NOT translate — the page passes the
 * already-translated status labels once (StatusChip idiom).
 */
export function DayStrip({
  days,
  labels,
  label,
  className,
}: Readonly<{
  days: ReadonlyArray<DayStripDay>;
  labels: Record<AttendanceStatus | "none", string>;
  /** Accessible name for the whole strip (e.g. "Días marcados"). */
  label: string;
  className?: string;
}>) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-[2px]", className)}
    >
      {days.map((day) => {
        const status = day.status ?? "none";
        return (
          <span
            key={day.date}
            aria-hidden
            title={`${day.date} · ${labels[status]}`}
            className={cn("h-[14px] w-[8px] shrink-0", SQUARE_CLASSES[status])}
          />
        );
      })}
    </div>
  );
}
