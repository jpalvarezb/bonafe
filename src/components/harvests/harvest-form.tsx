"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Metric } from "@/components/ui/metric";
import { cn } from "@/lib/utils";
import { enqueue, editOutboxEntry, flushOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/ids";

type Option = { id: string; name: string };
type CycleOption = Option & { parcelId: string };

type Unit = "kg" | "lb" | "qq" | "lata" | "saco";

const UNITS: Unit[] = ["kg", "lb", "qq", "lata", "saco"];

/** Mirrors harvestCreatePayload (src/lib/offline/schemas.ts). */
export type HarvestPayload = {
  id: string;
  parcelId: string;
  cropCycleId?: string;
  workerId?: string;
  date: string;
  quantity: string;
  unit: string;
  qualityGrade?: string;
  notes?: string;
};

type Props = {
  readonly orgSlug: string;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
  readonly workers: Option[];
  /** Edit-then-retry: prefills from a rejected outbox entry's payload. */
  readonly initialPayload?: HarvestPayload;
  /** Same outbox row/id — editOutboxEntry never mints a new UUID. */
  readonly editingOutboxId?: string;
  readonly onCancelEdit?: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Density-driven building blocks — see activity-form.tsx for the same
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

export function HarvestForm({
  orgSlug,
  parcels,
  cycles,
  workers,
  initialPayload,
  editingOutboxId,
  onCancelEdit,
}: Props) {
  const t = useTranslations("harvests");
  const tOffline = useTranslations("offline");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const isEditing = Boolean(editingOutboxId);
  const [parcelId, setParcelId] = useState<string>(
    initialPayload?.parcelId ?? parcels[0]?.id ?? "",
  );
  const [cropCycleId, setCropCycleId] = useState<string>(
    initialPayload?.cropCycleId ?? "",
  );
  const [workerId, setWorkerId] = useState<string>(
    initialPayload?.workerId ?? "",
  );
  const [date, setDate] = useState(initialPayload?.date ?? today());
  const [quantity, setQuantity] = useState(initialPayload?.quantity ?? "");
  const [unit, setUnit] = useState<Unit>((initialPayload?.unit as Unit) ?? "kg");
  const [qualityGrade, setQualityGrade] = useState(
    initialPayload?.qualityGrade ?? "",
  );
  const [notes, setNotes] = useState(initialPayload?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  function resetForm() {
    setCropCycleId("");
    setWorkerId("");
    setDate(today());
    setQuantity("");
    setUnit("kg");
    setQualityGrade("");
    setNotes("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaveError(false);
    try {
      const payload: HarvestPayload = {
        id: initialPayload?.id ?? newId(),
        parcelId,
        cropCycleId: cropCycleId || undefined,
        workerId: workerId || undefined,
        date,
        quantity,
        unit,
        qualityGrade: qualityGrade || undefined,
        notes: notes || undefined,
      };
      if (editingOutboxId) {
        await editOutboxEntry(editingOutboxId, payload);
      } else {
        await enqueue(orgSlug, "harvest.create", payload);
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
      // enqueue() zod-rejects invalid payloads before anything is stored.
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[3px] border border-border">
      <div className="border-b border-border px-[var(--density-cell-px)] py-[var(--density-cell-py)]">
        <span className={MICRO_LABEL}>
          {isEditing ? tOffline("issues.edit") : t("new")}
        </span>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 p-[var(--density-cell-px)]"
      >
        {/* Parcel picker — board chip grid, same setParcelId state the
            previous <select> drove. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("parcel")}</span>
          <div
            role="group"
            aria-label={t("parcel")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {parcels.map((parcel) => (
              <button
                key={parcel.id}
                type="button"
                aria-pressed={parcelId === parcel.id}
                onClick={() => {
                  setParcelId(parcel.id);
                  setCropCycleId("");
                }}
                className={chipClass(
                  parcelId === parcel.id,
                  "min-h-[var(--density-row-h)] px-[var(--density-cell-px)]",
                )}
              >
                {parcel.name}
              </button>
            ))}
          </div>
        </div>

        {/* Cycle picker — same chip treatment, includes "no cycle". */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("cycle")}</span>
          <div
            role="group"
            aria-label={t("cycle")}
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
              {t("cycleNone")}
            </button>
            {parcelCycles.map((cycle) => (
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

        {/* Big numeric entry — board treatment: large mono quantity input
            with a live formatted total underneath. */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="quantity" className={MICRO_LABEL}>
            {t("quantity")}
          </Label>
          <div className="flex items-center gap-2">
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
                "h-[var(--density-control-h)] w-full flex-1 text-right font-mono text-[length:calc(var(--density-font-body)*1.4)] font-semibold tabular",
              )}
            />
            <select
              aria-label={t("unit")}
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              required
              className={cn(CONTROL, "w-24")}
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {t(`units.${value}`)}
                </option>
              ))}
            </select>
          </div>
          {quantity && (
            <Metric
              value={`${Number(quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t(`units.${unit}`)}`}
              className="text-[length:var(--density-font-body)] text-muted-foreground"
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workerId" className={MICRO_LABEL}>
              {t("worker")}
            </Label>
            <select
              id="workerId"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className={cn(CONTROL, "w-full")}
            >
              <option value="">{t("workerNone")}</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="date" className={MICRO_LABEL}>
              {t("date")}
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
            <Label htmlFor="qualityGrade" className={MICRO_LABEL}>
              {t("qualityGrade")}
            </Label>
            <Input
              id="qualityGrade"
              value={qualityGrade}
              onChange={(e) => setQualityGrade(e.target.value)}
              className={cn(CONTROL, "w-full")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes" className={MICRO_LABEL}>
              {t("notes")}
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
            {isEditing ? tOffline("issues.retry") : t("create")}
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
