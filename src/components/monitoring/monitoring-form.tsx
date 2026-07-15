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
type CycleOption = Option & { parcelId: string };

type MonitoringType = "pest" | "disease" | "weed";

type GeoLocation = { lat: number; lng: number };

type LocationStatus = "idle" | "capturing" | "success" | "denied" | "unavailable";

/** Mirrors monitoringCreatePayload (src/lib/offline/schemas.ts). */
export type MonitoringPayload = {
  id: string;
  parcelId: string;
  cropCycleId?: string;
  date: string;
  type: MonitoringType;
  agentName: string;
  severity: number;
  incidencePct?: string;
  notes?: string;
  actionsTaken?: string;
  location?: GeoLocation;
};

type Props = {
  readonly locale: string;
  readonly orgSlug: string;
  readonly parcels: Option[];
  readonly cycles: CycleOption[];
  /** Edit-then-retry: prefills from a rejected outbox entry's payload. */
  readonly initialPayload?: MonitoringPayload;
  /** Same outbox row/id — editOutboxEntry never mints a new UUID. */
  readonly editingOutboxId?: string;
  readonly onCancelEdit?: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Device GPS fix — works fully offline, no network round trip needed.
 * enableHighAccuracy trades battery/time for precision; the timeout keeps a
 * denied/unavailable sensor from stalling the form. */
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

// Density-driven building blocks — see activity-form.tsx for the same
// pattern; office mode gets 28/24px sizing, field mode gets 56/48px glove
// targets from the same className strings (globals.css [data-mode="field"]).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";

function chipClass(selected: boolean, extra?: string) {
  return cn(
    "flex items-center justify-center rounded-[3px] border text-[length:var(--density-font-body)] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-2 border-foreground bg-foreground font-semibold text-background"
      : "border-border font-medium text-foreground hover:bg-muted",
    extra,
  );
}

export function MonitoringForm({
  orgSlug,
  parcels,
  cycles,
  initialPayload,
  editingOutboxId,
  onCancelEdit,
}: Props) {
  const t = useTranslations("monitoring");
  const router = useRouter();
  const isEditing = Boolean(editingOutboxId);
  const [parcelId, setParcelId] = useState<string>(
    initialPayload?.parcelId ?? parcels[0]?.id ?? "",
  );
  const [cropCycleId, setCropCycleId] = useState<string>(
    initialPayload?.cropCycleId ?? "",
  );
  const [date, setDate] = useState(initialPayload?.date ?? today());
  const [type, setType] = useState<MonitoringType>(
    initialPayload?.type ?? "pest",
  );
  const [agentName, setAgentName] = useState(initialPayload?.agentName ?? "");
  const [severity, setSeverity] = useState(
    initialPayload ? String(initialPayload.severity) : "1",
  );
  const [incidencePct, setIncidencePct] = useState(
    initialPayload?.incidencePct ?? "",
  );
  const [notes, setNotes] = useState(initialPayload?.notes ?? "");
  const [actionsTaken, setActionsTaken] = useState(
    initialPayload?.actionsTaken ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [location, setLocation] = useState<GeoLocation | null>(
    initialPayload?.location ?? null,
  );
  const [accuracy, setAccuracy] = useState<number | null>(null);
  // A prefilled location (edit mode) has no captured accuracy reading, so the
  // "captured" chip (which requires accuracy) intentionally stays hidden —
  // the coordinates are still carried in `location` and submitted as-is.
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const tOffline = useTranslations("offline");
  const tCommon = useTranslations("common");

  const parcelCycles = cycles.filter(
    (c) => !parcelId || c.parcelId === parcelId,
  );

  function resetForm() {
    setCropCycleId("");
    setDate(today());
    setType("pest");
    setAgentName("");
    setSeverity("1");
    setIncidencePct("");
    setNotes("");
    setActionsTaken("");
    setLocation(null);
    setAccuracy(null);
    setLocationStatus("idle");
  }

  function captureLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("capturing");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setAccuracy(position.coords.accuracy);
        setLocationStatus("success");
      },
      (error) => {
        // Location is optional — the form still submits fine without it.
        setLocationStatus(
          error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      GEOLOCATION_OPTIONS,
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSaveError(false);
    try {
      const payload: MonitoringPayload = {
        id: initialPayload?.id ?? newId(),
        parcelId,
        cropCycleId: cropCycleId || undefined,
        date,
        type,
        agentName,
        severity: Number(severity),
        incidencePct: incidencePct || undefined,
        notes: notes || undefined,
        actionsTaken: actionsTaken || undefined,
        location: location ?? undefined,
      };
      if (editingOutboxId) {
        await editOutboxEntry(editingOutboxId, payload);
      } else {
        await enqueue(orgSlug, "monitoring.create", payload);
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
        {/* Parcel + cycle stay as selects — secondary office-style fields,
            not part of the board 1f chip treatment. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="parcelId" className={MICRO_LABEL}>
              {t("parcel")}
            </Label>
            <select
              id="parcelId"
              value={parcelId}
              onChange={(e) => {
                setParcelId(e.target.value);
                setCropCycleId("");
              }}
              required
              className={cn(CONTROL, "w-full")}
            >
              {parcels.map((parcel) => (
                <option key={parcel.id} value={parcel.id}>
                  {parcel.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cropCycleId" className={MICRO_LABEL}>
              {t("cycle")}
            </Label>
            <select
              id="cropCycleId"
              value={cropCycleId}
              onChange={(e) => setCropCycleId(e.target.value)}
              className={cn(CONTROL, "w-full")}
            >
              <option value="">{t("cycleNone")}</option>
              {parcelCycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
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
            <Label htmlFor="agentName" className={MICRO_LABEL}>
              {t("agentName")}
            </Label>
            <Input
              id="agentName"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              required
              placeholder={t("agentNamePlaceholder")}
              className={cn(CONTROL, "w-full")}
            />
          </div>
        </div>

        {/* Type picker — pest / disease / weed chips. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("type")}</span>
          <div role="group" aria-label={t("type")} className="flex flex-wrap gap-2">
            {(["pest", "disease", "weed"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={chipClass(
                  type === value,
                  "h-[var(--density-control-h)] px-[var(--density-cell-px)]",
                )}
              >
                {t(`types.${value}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Severity picker — 1 (low) .. 5 (high) chips (monochrome selected style). */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("severity")}</span>
          <div
            role="group"
            aria-label={t("severity")}
            className="grid grid-cols-5 gap-2"
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = severity === String(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSeverity(String(value))}
                  className={chipClass(
                    selected,
                    "h-[var(--density-control-h)] font-mono tabular",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="incidencePct" className={MICRO_LABEL}>
              {t("incidencePct")}
            </Label>
            <Input
              id="incidencePct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={incidencePct}
              onChange={(e) => setIncidencePct(e.target.value)}
              className={cn(CONTROL, "w-full text-right font-mono tabular")}
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
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="actionsTaken" className={MICRO_LABEL}>
              {t("actionsTaken")}
            </Label>
            <Input
              id="actionsTaken"
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              className={cn(CONTROL, "w-full")}
            />
          </div>
        </div>

        {/* GPS chip — board 1f/1g treatment: green ±accuracy pill + mono
            lat/lng, using sev-low tokens (green family) via StatusChip's
            palette so it stays theme-aware without a raw color class. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("location")}</span>
          <div
            className={cn(
              "flex flex-wrap items-center gap-[var(--density-cell-py)] rounded-[3px] border border-border",
              "px-[var(--density-cell-px)] py-[var(--density-cell-py)] min-h-[var(--density-control-h)]",
            )}
          >
            <button
              type="button"
              onClick={captureLocation}
              disabled={locationStatus === "capturing"}
              className={cn(
                CONTROL,
                "px-[var(--density-cell-px)] font-medium text-foreground hover:bg-muted disabled:opacity-50",
              )}
            >
              {locationStatus === "capturing"
                ? t("locationCapturing")
                : t("locationUse")}
            </button>
            {locationStatus === "success" && location && accuracy !== null && (
              <>
                <span
                  className="rounded-[3px] border border-sync-ok-border bg-sync-ok-bg px-[7px] py-0.5 font-mono text-[length:var(--density-font-label)] font-semibold text-sync-ok-fg"
                  title={t("locationTitle", {
                    lat: location.lat.toFixed(6),
                    lng: location.lng.toFixed(6),
                  })}
                >
                  {t("locationCaptured", { accuracy: Math.round(accuracy) })}
                </span>
                <span className="font-mono tabular text-[length:var(--density-font-body)] text-muted-foreground">
                  {/* Hemisphere letters derive from the coordinate sign — the
                      demo farms are north/west but nothing guarantees that. */}
                  {Math.abs(location.lat).toFixed(4)}°
                  {location.lat >= 0 ? t("gps.north") : t("gps.south")}{" "}
                  {Math.abs(location.lng).toFixed(4)}°
                  {location.lng >= 0 ? t("gps.east") : t("gps.west")}
                </span>
              </>
            )}
            {locationStatus === "denied" && (
              <span className="text-[length:var(--density-font-body)] text-muted-foreground">
                {t("locationDenied")}
              </span>
            )}
            {locationStatus === "unavailable" && (
              <span className="text-[length:var(--density-font-body)] text-muted-foreground">
                {t("locationUnavailable")}
              </span>
            )}
          </div>
        </div>

        {/* Photos placeholder — decorative only, no upload wired yet. */}
        <div className="flex flex-col gap-2">
          <span className={MICRO_LABEL}>{t("photos")}</span>
          <div className="flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-dashed border-border text-[length:var(--density-font-body)] text-muted-foreground">
            {t("photosPlaceholder")}
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
