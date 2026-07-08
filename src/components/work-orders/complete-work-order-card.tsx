"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { enqueue, flushOutbox } from "@/lib/offline/outbox";
import { toggleChecklistItemAction } from "@/server/actions/work-orders";
import type { WorkOrderStatus } from "@/server/services/work-orders";

type ChecklistItemProp = { id: string; label: string; done: boolean };

type WorkOrderProp = {
  id: string;
  code: string;
  title: string;
  /** Only ever "assigned" | "in_progress" in practice — the page only
   * mounts this card for those two statuses — kept as the full status type
   * so the caller doesn't need to re-narrow it. Unused for logic here. */
  status: WorkOrderStatus;
};

type Props = {
  readonly orgSlug: string;
  readonly locale: string;
  readonly workOrder: WorkOrderProp;
  readonly checklist: ChecklistItemProp[];
};

// Density-driven building blocks — office mode gets 28/24px sizing, field
// mode gets 56/48px glove targets, from the same className strings
// (globals.css [data-mode="field"]).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

/**
 * Offline-capable "complete my work order" card. Replaces the plain
 * checklist-toggle buttons and the "Completar" transition form for rows the
 * field supervisor can complete — everything here works offline via the
 * outbox, unlike the other transition buttons on the page (assign/start/
 * cancel), which stay online-only server-action forms.
 */
export function CompleteWorkOrderCard({
  orgSlug,
  locale,
  workOrder,
  checklist,
}: Props) {
  const t = useTranslations("workorders");
  const tOffline = useTranslations("offline");
  const router = useRouter();

  // Seeded from server state; toggling never un-checks a server-done item
  // (mirrors the monotone merge the service enforces).
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(checklist.map((item) => [item.id, item.done])),
  );
  const [submitting, setSubmitting] = useState(false);
  // The blocked-completion notice only appears once the user engages with
  // the checklist (or tries to complete) — a red error on first paint,
  // before any interaction, reads as a fault rather than guidance.
  const [interacted, setInteracted] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [localPending, setLocalPending] = useState(false);

  const allChecked = checklist.every((item) => checked[item.id]);

  function toggle(item: ChecklistItemProp) {
    if (item.done) return; // already done server-side — can't un-check
    setInteracted(true);
    const next = !checked[item.id];
    setChecked((prev) => ({ ...prev, [item.id]: next }));

    // Best-effort incremental persistence while online, exactly like the
    // previous server-action checklist buttons. Offline, this is skipped —
    // toggles stay session-local (in `checked` state) until "Completar" is
    // pressed, at which point the whole checked set is sent in one shot.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const formData = new FormData();
      formData.set("locale", locale);
      formData.set("orgSlug", orgSlug);
      formData.set("workOrderId", workOrder.id);
      formData.set("itemId", item.id);
      formData.set("done", String(next));
      toggleChecklistItemAction(formData).catch(() => {
        // Fire-and-forget: local `checked` state is the UX source of truth
        // for this session regardless of whether the incremental save lands.
      });
    }
  }

  async function handleComplete() {
    setSubmitting(true);
    setSaveError(false);
    try {
      await enqueue(orgSlug, "workorder.complete", {
        workOrderId: workOrder.id,
        checkedItemIds: Object.entries(checked)
          .filter(([, isChecked]) => isChecked)
          .map(([id]) => id),
        code: workOrder.code,
        title: workOrder.title,
      });
      if (navigator.onLine) {
        await flushOutbox(orgSlug).catch(() => null);
        router.refresh();
      } else {
        // Offline: a refresh would fail without a network — show the
        // pending state instead; the outbox flushes when back online.
        setLocalPending(true);
      }
    } catch {
      // enqueue() zod-rejects invalid payloads before anything is stored.
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[3px] border border-border">
      {checklist.length > 0 && (
        <>
          <div className="border-b border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
            <span className={MICRO_LABEL}>{t("checklist.title")}</span>
          </div>
          <div className="flex flex-col">
            {checklist.map((item) => {
              const isChecked = Boolean(checked[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  disabled={item.done}
                  onClick={() => toggle(item)}
                  className={cn(
                    "flex min-h-[var(--density-row-h)] w-full items-center gap-3 border-b border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)] text-left last:border-b-0",
                    "text-[length:var(--density-font-body)] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:hover:bg-transparent",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[calc(var(--density-control-h)*0.55)] shrink-0 items-center justify-center rounded-[3px] border-2 font-mono",
                      isChecked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-transparent",
                    )}
                  >
                    ✓
                  </span>
                  <span
                    className={
                      isChecked ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 p-[var(--density-cell-px)]">
        {checklist.length > 0 && !allChecked && interacted && (
          <Notice variant="error">{t("errors.checklistIncomplete")}</Notice>
        )}

        <button
          type="button"
          disabled={!allChecked || submitting}
          onClick={handleComplete}
          className="h-[var(--density-control-h)] w-full rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {t("transition.done")}
        </button>

        {localPending && (
          <p className={cn(MICRO_LABEL, "rounded-[3px] bg-sync-pending-bg px-[var(--density-cell-px)] py-[var(--density-cell-py)] text-sync-pending-fg normal-case")}>
            {tOffline("pendingNote")}
          </p>
        )}
        {saveError && (
          <p className="text-[length:var(--density-font-label)] text-destructive">
            {tOffline("saveError")}
          </p>
        )}
      </div>
    </div>
  );
}
