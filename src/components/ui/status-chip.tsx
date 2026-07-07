import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusFamily = "sev" | "sync" | "wo" | "att" | "life";

type StatusStateMap = {
  sev: "low" | "medium" | "high";
  sync: "pending" | "ok" | "error" | "offline";
  wo: "draft" | "assigned" | "progress" | "done" | "cancelled";
  att: "present" | "half" | "absent" | "sick" | "leave";
  life:
    | "active"
    | "open"
    | "converted"
    | "draft"
    | "planned"
    | "inactive"
    | "closed"
    | "cancelled";
};

// Tailwind v4 requires statically analyzable class names — no dynamic
// `bg-${family}-${state}-bg` string construction. Every valid family+state
// combo is spelled out explicitly here.
const CHIP_CLASSES: {
  [F in StatusFamily]: Record<StatusStateMap[F], string>;
} = {
  sev: {
    low: "bg-sev-low-bg text-sev-low-fg border-sev-low-border",
    medium: "bg-sev-medium-bg text-sev-medium-fg border-sev-medium-border",
    high: "bg-sev-high-bg text-sev-high-fg border-sev-high-border",
  },
  sync: {
    pending:
      "bg-sync-pending-bg text-sync-pending-fg border-sync-pending-border",
    ok: "bg-sync-ok-bg text-sync-ok-fg border-sync-ok-border",
    error: "bg-sync-error-bg text-sync-error-fg border-sync-error-border",
    offline:
      "bg-sync-offline-bg text-sync-offline-fg border-sync-offline-border",
  },
  wo: {
    draft: "bg-wo-draft-bg text-wo-draft-fg border-wo-draft-border",
    assigned:
      "bg-wo-assigned-bg text-wo-assigned-fg border-wo-assigned-border",
    progress:
      "bg-wo-progress-bg text-wo-progress-fg border-wo-progress-border",
    done: "bg-wo-done-bg text-wo-done-fg border-wo-done-border",
    cancelled:
      "bg-wo-cancelled-bg text-wo-cancelled-fg border-wo-cancelled-border",
  },
  att: {
    present: "bg-att-present-bg text-att-present-fg border-att-present-border",
    half: "bg-att-half-bg text-att-half-fg border-att-half-border",
    absent: "bg-att-absent-bg text-att-absent-fg border-att-absent-border",
    sick: "bg-att-sick-bg text-att-sick-fg border-att-sick-border",
    leave: "bg-att-leave-bg text-att-leave-fg border-att-leave-border",
  },
  life: {
    active: "bg-life-active-bg text-life-active-fg border-life-active-border",
    open: "bg-life-open-bg text-life-open-fg border-life-open-border",
    converted:
      "bg-life-converted-bg text-life-converted-fg border-life-converted-border",
    draft: "bg-life-draft-bg text-life-draft-fg border-life-draft-border",
    planned:
      "bg-life-planned-bg text-life-planned-fg border-life-planned-border",
    inactive:
      "bg-life-inactive-bg text-life-inactive-fg border-life-inactive-border",
    closed: "bg-life-closed-bg text-life-closed-fg border-life-closed-border",
    cancelled:
      "bg-life-cancelled-bg text-life-cancelled-fg border-life-cancelled-border",
  },
};

function chipClasses(family: StatusFamily, state: string): string {
  const familyMap: Record<string, string | undefined> = CHIP_CLASSES[family];
  return familyMap[state] ?? "";
}

/**
 * Small status pill for severity/sync/work-order/attendance states. Does
 * NOT translate — callers pass the already-translated label as children.
 */
export function StatusChip({
  family,
  state,
  children,
  className,
}: {
  family: StatusFamily;
  state: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] border px-[7px] py-0.5 font-mono text-[11px] leading-none",
        chipClasses(family, state),
        className,
      )}
    >
      {children}
    </span>
  );
}
