"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
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
  const [saveError, setSaveError] = useState(false);
  const [localPending, setLocalPending] = useState(false);

  const allChecked = checklist.every((item) => checked[item.id]);

  function toggle(item: ChecklistItemProp) {
    if (item.done) return; // already done server-side — can't un-check
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
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2">
      {checklist.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground">
            {t("checklist.title")}
          </p>
          {checklist.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.done}
              onClick={() => toggle(item)}
              className="flex items-center gap-2 text-left text-sm hover:underline disabled:pointer-events-none disabled:no-underline"
            >
              <span aria-hidden>{checked[item.id] ? "☑" : "☐"}</span>
              <span
                className={
                  checked[item.id]
                    ? "text-muted-foreground line-through"
                    : ""
                }
              >
                {item.label}
              </span>
            </button>
          ))}
        </>
      )}

      <Button
        type="button"
        size="sm"
        disabled={!allChecked || submitting}
        onClick={handleComplete}
        className="self-start"
      >
        {t("transition.done")}
      </Button>

      {localPending && (
        <p className="rounded-md bg-sync-pending-bg px-3 py-1.5 text-xs text-sync-pending-fg">
          {tOffline("pendingNote")}
        </p>
      )}
      {saveError && (
        <p className="text-xs text-destructive">{tOffline("saveError")}</p>
      )}
    </div>
  );
}
