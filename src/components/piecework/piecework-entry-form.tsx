"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { enqueue, editOutboxEntry, flushOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/ids";

type Option = { id: string; name: string };
type RateOption = Option & { unit: string };

/** Mirrors pieceworkEntryCreatePayload (src/lib/offline/schemas.ts). */
export type PieceworkEntryPayload = {
  id: string;
  workerId: string;
  pieceRateId: string;
  cropCycleId?: string;
  date: string;
  quantity: string;
  notes?: string;
};

type Props = {
  readonly orgSlug: string;
  readonly workers: Option[];
  readonly rates: RateOption[];
  readonly cycles: Option[];
  /** Edit-then-retry: prefills from a rejected outbox entry's payload. */
  readonly initialPayload?: PieceworkEntryPayload;
  /** Same outbox row/id — editOutboxEntry never mints a new UUID. */
  readonly editingOutboxId?: string;
  readonly onCancelEdit?: () => void;
};

// Density-driven building blocks — see harvest-form.tsx for the same
// pattern; office mode gets 28/24px sizing, field mode gets 56/48px glove
// targets from the same className strings (globals.css [data-mode="field"]).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function chipClass(selected: boolean, extra?: string) {
  return cn(
    "flex items-center rounded-[3px] border text-left text-[length:var(--density-font-body)] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-2 border-foreground bg-foreground font-semibold text-background"
      : "border-border font-medium text-foreground hover:bg-muted",
    extra,
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PieceworkEntryForm({
  orgSlug,
  workers,
  rates,
  cycles,
  initialPayload,
  editingOutboxId,
  onCancelEdit,
}: Props) {
  const t = useTranslations("piecework");
  const tOffline = useTranslations("offline");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const isEditing = Boolean(editingOutboxId);
  const [workerId, setWorkerId] = useState(
    initialPayload?.workerId ?? workers[0]?.id ?? "",
  );
  const [pieceRateId, setPieceRateId] = useState(
    initialPayload?.pieceRateId ?? rates[0]?.id ?? "",
  );
  const [cropCycleId, setCropCycleId] = useState(
    initialPayload?.cropCycleId ?? "",
  );
  const [date, setDate] = useState(initialPayload?.date ?? today());
  const [quantity, setQuantity] = useState(initialPayload?.quantity ?? "");
  const [notes, setNotes] = useState(initialPayload?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);

  function resetForm() {
    setCropCycleId("");
    setDate(today());
    setQuantity("");
    setNotes("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaveError(false);
    try {
      const payload: PieceworkEntryPayload = {
        id: initialPayload?.id ?? newId(),
        workerId,
        pieceRateId,
        cropCycleId: cropCycleId || undefined,
        date,
        quantity,
        notes: notes || undefined,
      };
      if (editingOutboxId) {
        await editOutboxEntry(editingOutboxId, payload);
      } else {
        await enqueue(orgSlug, "piecework.create", payload);
      }
      if (navigator.onLine) {
        await flushOutbox(orgSlug).catch(() => null);
        router.refresh();
      }
      // Offline: skip refresh — navigation would fail without a network, and
      // the PendingEntries live query already shows the queued record.
      if (editingOutboxId) {
        onCancelEdit?.();
      } else {
        resetForm();
      }
    } catch {
      // enqueue()/editOutboxEntry() zod-reject invalid payloads before
      // anything is stored.
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[3px] border border-border">
      <div className="border-b border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
        <span className={MICRO_LABEL}>
          {isEditing ? tOffline("issues.edit") : t("entries.form.create")}
        </span>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 p-[var(--density-cell-px)]"
      >
        {/* Worker picker — board chip grid. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("entries.form.worker")}</span>
          <div
            role="group"
            aria-label={t("entries.form.worker")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {workers.map((worker) => (
              <button
                key={worker.id}
                type="button"
                aria-pressed={workerId === worker.id}
                onClick={() => setWorkerId(worker.id)}
                className={chipClass(
                  workerId === worker.id,
                  "min-h-[var(--density-row-h)] px-[var(--density-cell-px)]",
                )}
              >
                {worker.name}
              </button>
            ))}
          </div>
        </div>

        {/* Rate picker — same chip treatment. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("entries.form.rate")}</span>
          <div
            role="group"
            aria-label={t("entries.form.rate")}
            className="flex flex-wrap gap-2"
          >
            {rates.map((rate) => (
              <button
                key={rate.id}
                type="button"
                aria-pressed={pieceRateId === rate.id}
                onClick={() => setPieceRateId(rate.id)}
                className={chipClass(
                  pieceRateId === rate.id,
                  "h-[var(--density-control-h)] px-[var(--density-cell-px)]",
                )}
              >
                {rate.name} ({rate.unit})
              </button>
            ))}
          </div>
        </div>

        {/* Cycle picker — includes "no cycle". */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("entries.form.cycle")}</span>
          <div
            role="group"
            aria-label={t("entries.form.cycle")}
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              aria-pressed={cropCycleId === ""}
              onClick={() => setCropCycleId("")}
              className={chipClass(
                cropCycleId === "",
                "h-[var(--density-control-h)] px-[var(--density-cell-px)]",
              )}
            >
              {t("entries.form.noCycle")}
            </button>
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                aria-pressed={cropCycleId === cycle.id}
                onClick={() => setCropCycleId(cycle.id)}
                className={chipClass(
                  cropCycleId === cycle.id,
                  "h-[var(--density-control-h)] px-[var(--density-cell-px)]",
                )}
              >
                {cycle.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date" className={MICRO_LABEL}>
              {t("entries.form.date")}
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={cn(CONTROL, "w-full")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quantity" className={MICRO_LABEL}>
              {t("entries.form.quantity")}
            </Label>
            <input
              id="quantity"
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className={cn(
                CONTROL,
                "w-full text-right font-mono tabular",
              )}
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="notes" className={MICRO_LABEL}>
              {t("entries.form.notes")}
            </Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(CONTROL, "w-full")}
            />
          </div>
        </div>

        {saveError && <Notice variant="error">{tOffline("saveError")}</Notice>}

        <div className="flex gap-2 sm:self-start">
          <button
            type="submit"
            disabled={submitting}
            className="h-[var(--density-control-h)] flex-1 rounded-[3px] bg-foreground px-6 text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none"
          >
            {isEditing ? tOffline("issues.retry") : t("entries.form.create")}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="h-[var(--density-control-h)] rounded-[3px] border border-border px-6 text-[length:var(--density-font-body)] font-medium text-foreground hover:bg-muted"
            >
              {tCommon("actions.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
