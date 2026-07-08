import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/ui/status-chip";
import type { WorkOrderStatus } from "@/server/services/work-orders";

/** The happy-path chain, in order. `cancelled` is rendered as a muted chain
 * plus a cancelled chip instead of a position on the line. */
const STEPS = ["draft", "assigned", "in_progress", "done"] as const;

type Step = (typeof STEPS)[number];

// Current-step dot/label tone comes from the matching wo-* status tokens
// (same palette the StatusChip uses). Tailwind v4 needs static literals, so
// every step is spelled out — no `bg-wo-${state}-fg` construction.
const CURRENT_DOT: Record<Step, string> = {
  draft: "bg-wo-draft-fg ring-wo-draft-bg",
  assigned: "bg-wo-assigned-fg ring-wo-assigned-bg",
  in_progress: "bg-wo-progress-fg ring-wo-progress-bg",
  done: "bg-wo-done-fg ring-wo-done-bg",
};

const CURRENT_LABEL: Record<Step, string> = {
  draft: "text-wo-draft-fg",
  assigned: "text-wo-assigned-fg",
  in_progress: "text-wo-progress-fg",
  done: "text-wo-done-fg",
};

type Props = {
  readonly status: WorkOrderStatus;
  /** Already-translated step labels (this component does NOT translate,
   * mirroring StatusChip). `cancelled` feeds the chip shown for that state. */
  readonly labels: Record<WorkOrderStatus, string>;
  readonly className?: string;
};

/**
 * Board-1h lifecycle stepper: Borrador — Asignada — En progreso — Completada
 * as dots joined by 2px connector lines. Past steps are filled dark, the
 * current step is filled with its wo-status token color (with a soft ring),
 * future steps are hollow. A cancelled order renders the whole chain muted
 * with a cancelled StatusChip instead of a current position.
 *
 * Pure presentation — no state, no handlers.
 */
export function LifecycleStepper({ status, labels, className }: Props) {
  const cancelled = status === "cancelled";
  const currentIndex = cancelled
    ? -1
    : STEPS.indexOf(status as Step);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start" aria-hidden>
        {STEPS.map((step, index) => {
          const isPast = !cancelled && index < currentIndex;
          const isCurrent = !cancelled && index === currentIndex;
          return (
            <div key={step} className="contents">
              {index > 0 && (
                // mt-1.5 centers the 2px line on the 14px dots (6 + 1 ≈ 7),
                // independent of the label size below the dots.
                <div
                  className={cn(
                    "mt-1.5 h-[2px] flex-1",
                    isPast || isCurrent ? "bg-foreground" : "bg-border",
                  )}
                />
              )}
              <div className="flex w-16 flex-none flex-col items-center">
                <span
                  className={cn(
                    "rounded-full",
                    isCurrent
                      ? cn("size-4 ring-[3px]", CURRENT_DOT[step])
                      : "size-3.5",
                    isPast && "bg-foreground",
                    !isPast && !isCurrent && "border-2 border-border bg-background",
                    cancelled && "border-2 border-border bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "mt-1.5 font-mono text-[length:var(--density-font-label)]",
                    isCurrent
                      ? cn("font-semibold", CURRENT_LABEL[step])
                      : "text-muted-foreground",
                    !isPast && !isCurrent && "opacity-70",
                  )}
                >
                  {labels[step]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Announces the current status to screen readers (the chain itself is decorative). */}
      <span className="sr-only">{labels[status]}</span>

      {cancelled && (
        <StatusChip family="wo" state="cancelled" className="self-start line-through">
          {labels.cancelled}
        </StatusChip>
      )}
    </div>
  );
}
