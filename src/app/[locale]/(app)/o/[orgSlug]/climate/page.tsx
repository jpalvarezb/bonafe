import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listFarms } from "@/server/services/farms";
import { listClimateReadings } from "@/server/services/climate";
import {
  deleteClimateAction,
  upsertClimateAction,
} from "@/server/actions/climate";
import { ingestClimateAction } from "@/server/actions/climate-ingest";
import { ClimateCharts } from "@/components/climate/climate-charts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

// Same density building blocks as payroll/planning/work-orders/budgets
// (globals.css [data-mode="field"] retunes these for field-mode capture —
// climate readings, like attendance, are often logged from the field).
const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL =
  "h-[var(--density-control-h)] w-full rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN_PRIMARY =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] bg-foreground px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-semibold text-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const BTN_GHOST =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] px-2 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";

// Board-order: fecha / lluvia / t.min / t.max / humedad / fuente / acción.
const READINGS_COLS =
  "grid-cols-[96px_84px_84px_84px_84px_104px_60px]";

const INGEST_ERROR_KEYS = [
  "farmNotFound",
  "noParcels",
  "invalidRange",
  "rangeTooLong",
  "providerUnavailable",
];

const SOURCE_LABEL_KEYS: Record<string, string> = {
  manual: "sourceManual",
  open_meteo: "sourceOpenMeteo",
  chirps: "sourceChirps",
  station: "sourceStation",
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function ClimatePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{
    farm?: string;
    ingested?: string;
    provider?: string;
    error?: string;
  }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("climate");
  const sp = await searchParams;

  const farmsList = await listFarms(ctx, { includeInactive: true });

  if (farmsList.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("noFarms")}</p>
      </div>
    );
  }

  const activeFarmId =
    farmsList.find((farm) => farm.id === sp.farm)?.id ?? farmsList[0].id;

  const readings = await listClimateReadings(ctx, activeFarmId, {
    days: 90,
  });
  const latestReadings = [...readings].reverse().slice(0, 15);

  const canCreate = can(ctx.role, "climate", "create");
  const canDelete = can(ctx.role, "climate", "delete");
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = isoDaysAgo(30);

  const ingestErrorKey =
    sp.error && INGEST_ERROR_KEYS.includes(sp.error) ? sp.error : sp.error ? "unknown" : null;
  const parsedIngested = sp.ingested ? Number(sp.ingested) : null;
  const ingestedCount = Number.isFinite(parsedIngested) ? parsedIngested : null;
  const ingestedProviderKey =
    sp.provider === "chirps" ? "sourceChirps" : "sourceOpenMeteo";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {ingestErrorKey && (
        <Notice variant="error">{t(`ingest.errors.${ingestErrorKey}`)}</Notice>
      )}

      {ingestedCount !== null && !ingestErrorKey && (
        <Notice variant="success">
          {t("ingest.success", { count: ingestedCount })} —{" "}
          {t(ingestedProviderKey)}
        </Notice>
      )}

      {/* Farm switcher — bordered mono pill control, same idiom as the map
          cockpit's farm picker (map-cockpit.tsx). Preserves the ?farm=
          param-driven switching untouched. */}
      {farmsList.length > 1 && (
        <div className="flex flex-wrap gap-1 rounded-[3px] border border-border p-1">
          {farmsList.map((farm) => (
            <Link
              key={farm.id}
              href={`/o/${orgSlug}/climate?farm=${farm.id}`}
              className={cn(
                "rounded-[3px] px-2 py-1 font-mono text-[11px] font-medium transition-colors",
                farm.id === activeFarmId
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {farm.name}
            </Link>
          ))}
        </div>
      )}

      <div className="border border-border">
        <div className="px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">{t("charts")}</span>
        </div>
        <div className="border-t border-border px-3.5 py-3">
          <ClimateCharts
            readings={readings.map((reading) => ({
              date: reading.date,
              rainfallMm: reading.rainfallMm,
              tempMinC: reading.tempMinC,
              tempMaxC: reading.tempMaxC,
            }))}
          />
        </div>
      </div>

      {canCreate && (
        <div className="border border-border">
          <div className="px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">
              {t("ingest.title")}
            </span>
          </div>
          <div className="border-t border-border px-3.5 py-3">
            <form
              action={ingestClimateAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ingestFarmId" className={MICRO_LABEL}>
                  {t("ingest.farm")}
                </Label>
                <select
                  id="ingestFarmId"
                  name="farmId"
                  required
                  defaultValue={activeFarmId}
                  className={CONTROL}
                >
                  {farmsList.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ingestProvider" className={MICRO_LABEL}>
                  {t("ingest.provider")}
                </Label>
                <select
                  id="ingestProvider"
                  name="provider"
                  required
                  defaultValue="open_meteo"
                  className={CONTROL}
                >
                  <option value="open_meteo">
                    {t("ingest.providerOpenMeteo")}
                  </option>
                  <option value="chirps">{t("ingest.providerChirps")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ingestFrom" className={MICRO_LABEL}>
                  {t("ingest.from")}
                </Label>
                <Input
                  id="ingestFrom"
                  name="from"
                  type="date"
                  required
                  defaultValue={thirtyDaysAgo}
                  className={CONTROL}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ingestTo" className={MICRO_LABEL}>
                  {t("ingest.to")}
                </Label>
                <Input
                  id="ingestTo"
                  name="to"
                  type="date"
                  required
                  defaultValue={today}
                  className={CONTROL}
                />
              </div>
              <button
                type="submit"
                className={cn(BTN_PRIMARY, "self-end justify-self-start")}
              >
                {t("ingest.submit")}
              </button>
            </form>
          </div>
        </div>
      )}

      {canCreate && (
        <div className="border border-border">
          <div className="px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">
              {t("newReading")}
            </span>
          </div>
          <div className="border-t border-border px-3.5 py-3">
            <form
              action={upsertClimateAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="farmId" value={activeFarmId} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="date" className={MICRO_LABEL}>
                  {t("date")}
                </Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  required
                  defaultValue={today}
                  className={CONTROL}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rainfallMm" className={MICRO_LABEL}>
                  {t("rainfall")}
                </Label>
                <Input
                  id="rainfallMm"
                  name="rainfallMm"
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(CONTROL, "tabular font-mono")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tempMinC" className={MICRO_LABEL}>
                  {t("tempMinC")}
                </Label>
                <Input
                  id="tempMinC"
                  name="tempMinC"
                  type="number"
                  step="0.01"
                  className={cn(CONTROL, "tabular font-mono")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tempMaxC" className={MICRO_LABEL}>
                  {t("tempMaxC")}
                </Label>
                <Input
                  id="tempMaxC"
                  name="tempMaxC"
                  type="number"
                  step="0.01"
                  className={cn(CONTROL, "tabular font-mono")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="humidityPct" className={MICRO_LABEL}>
                  {t("humidity")}
                </Label>
                <Input
                  id="humidityPct"
                  name="humidityPct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className={cn(CONTROL, "tabular font-mono")}
                />
              </div>
              <button
                type="submit"
                className={cn(BTN_PRIMARY, "self-end justify-self-start")}
              >
                {t("save")}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="border border-border">
        <div className="flex items-baseline justify-between gap-2 px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">{t("recent")}</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {latestReadings.length}
          </span>
        </div>
        {latestReadings.length === 0 ? (
          <p className="border-t border-border px-3.5 py-3 text-[length:var(--density-font-body)] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div
                className={cn(
                  "grid border-t border-b border-border bg-muted/40",
                  READINGS_COLS,
                )}
              >
                <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                  {t("date")}
                </div>
                <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                  {t("rainfall")}
                </div>
                <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                  {t("tempMinC")}
                </div>
                <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                  {t("tempMaxC")}
                </div>
                <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                  {t("humidity")}
                </div>
                <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                  {t("source")}
                </div>
                <div className={CELL} />
              </div>
              {latestReadings.map((reading) => (
                <div
                  key={reading.id}
                  className={cn(
                    "grid items-center border-b border-border transition-colors last:border-b-0 hover:bg-muted/40",
                    READINGS_COLS,
                  )}
                >
                  <div
                    className={cn(
                      CELL,
                      "tabular font-mono text-[11px] text-muted-foreground",
                    )}
                  >
                    {reading.date}
                  </div>
                  <div className={cn(CELL, "tabular text-right font-mono text-[length:var(--density-font-body)]")}>
                    {reading.rainfallMm ?? "—"}
                  </div>
                  <div
                    className={cn(
                      CELL,
                      "tabular text-right font-mono text-[length:var(--density-font-body)] text-muted-foreground",
                    )}
                  >
                    {reading.tempMinC ?? "—"}
                  </div>
                  <div
                    className={cn(
                      CELL,
                      "tabular text-right font-mono text-[length:var(--density-font-body)] text-muted-foreground",
                    )}
                  >
                    {reading.tempMaxC ?? "—"}
                  </div>
                  <div
                    className={cn(
                      CELL,
                      "tabular text-right font-mono text-[length:var(--density-font-body)] text-muted-foreground",
                    )}
                  >
                    {reading.humidityPct ?? "—"}
                  </div>
                  <div className={cn(CELL, "font-mono text-[10px] text-muted-foreground")}>
                    {t(SOURCE_LABEL_KEYS[reading.source] ?? "sourceManual")}
                  </div>
                  <div className={cn(CELL, "text-right")}>
                    {canDelete && (
                      <form action={deleteClimateAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orgSlug" value={orgSlug} />
                        <input type="hidden" name="id" value={reading.id} />
                        <button type="submit" className={BTN_GHOST}>
                          {t("delete")}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
