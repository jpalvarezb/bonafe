import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { OrgContext } from "@/lib/tenancy";
import { panelData } from "@/server/reports/panel";
import { Metric } from "@/components/ui/metric";
import { MoneyValue } from "@/components/cockpit/money-value";
import { StatusChip } from "@/components/ui/status-chip";
import { PendingEntries } from "@/components/offline/pending-entries";
import { SyncIssuesList } from "@/components/offline/sync-issues-list";
import { cn } from "@/lib/utils";

// Board-1b density: office row heights (28/24px) via the shared density
// tokens (globals.css [data-mode="field"] overrides these for field mode —
// this dashboard is office-only, same convention as work-orders/page.tsx).
const MICRO_LABEL =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const ROW =
  "flex min-h-[var(--density-row-h)] items-center border-b border-border/60 last:border-b-0";

const SYNC_KINDS = ["activity.create", "monitoring.create", "workorder.complete"] as const;

const WO_CHIP_STATE = {
  draft: "draft",
  assigned: "assigned",
  in_progress: "progress",
} as const;

const PARCEL_COLS = "grid-cols-[1.8fr_0.6fr_0.9fr_0.8fr]";
const ACTIVITY_COLS = "grid-cols-[0.6fr_1.6fr_1fr_0.8fr]";

function Bar({ pct }: Readonly<{ pct: number }>) {
  return (
    <div
      className="flex-1 bg-accent-link/50"
      style={{ height: `${Math.max(pct, 2)}%` }}
    />
  );
}

/**
 * Board 1b — dense "office" panel dashboard. Rebuilt on top of a new
 * ORG-LEVEL aggregator (server/reports/panel.ts) that composes existing
 * report/service functions only (costByParcel, cycleProfitabilityReport,
 * dailyRainfallForFarm, listActivities, listWorkOrders, listAttendanceRange
 * — see panel.ts's doc comments for the Decimal composition and every
 * substitution made where the board asks for data no report exposes yet
 * (CULTIVO / INSUMOS / M.OBRA / OTROS split, activity author, per-sale
 * description). `toggle` keeps the Mapa/Panel switch in its existing spot.
 */
export async function DashboardPanel({
  ctx,
  toggle,
}: Readonly<{ ctx: OrgContext; toggle: ReactNode }>) {
  const t = await getTranslations("dashboard");
  const tCockpit = await getTranslations("cockpit");
  const format = await getFormatter();
  const currency = ctx.org.baseCurrencyCode;

  const data = await panelData(ctx);
  const { kpi, parcelRows, parcelTotals, activityRows, rainfall, openWorkOrders } =
    data;

  const fmtDate = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  const fmtMoney = (value: string | number) =>
    format.number(Number(value), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
  const fmtHa = (value: string | number | null) =>
    value == null ? "—" : Number(value).toFixed(2);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {toggle}
      </div>

      {/* KPI strip — 5 cells, mono microlabel + big mono numeral + mono
          sublabel, per board 1b. JORNALES QUINCENA is real attendance data
          (listAttendanceRange), not a substitute — see panel.ts. */}
      <div className="grid grid-cols-2 border border-border sm:grid-cols-3 lg:grid-cols-5">
        <div className={cn(CELL, "border-b border-border sm:border-b-0 sm:border-r lg:border-b-0")}>
          <div className={MICRO_LABEL}>{t("panel.kpi.income")}</div>
          <div className="mt-0.5 text-[22px] font-semibold">
            <MoneyValue amount={kpi.income} currency={currency} />
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
            {t("panel.kpi.incomeSub", { count: kpi.incomeCycleCount })}
          </div>
        </div>
        <div className={cn(CELL, "border-b border-border sm:border-r sm:border-b-0 lg:border-r")}>
          <div className={MICRO_LABEL}>{t("panel.kpi.costs")}</div>
          <div className="mt-0.5 text-[22px] font-semibold">
            <MoneyValue amount={kpi.costs} currency={currency} />
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
            {t("panel.kpi.costsSub", { count: kpi.totalCycleCount })}
          </div>
        </div>
        <div className={cn(CELL, "border-b border-border sm:border-b sm:border-r lg:border-b-0")}>
          <div className={MICRO_LABEL}>{t("panel.kpi.margin")}</div>
          <div className="mt-0.5 text-[22px] font-semibold">
            <MoneyValue amount={kpi.profit} currency={currency} signed />
          </div>
          <div className="mt-0.5 font-mono text-[10.5px]">
            {kpi.marginPct != null ? (
              <Metric value={`${kpi.marginPct}%`} signed />
            ) : (
              <span className="text-muted-foreground">{t("panel.kpi.marginNoData")}</span>
            )}
          </div>
        </div>
        <div className={cn(CELL, "border-border sm:border-r lg:border-r")}>
          <div className={MICRO_LABEL}>{t("panel.kpi.costHa")}</div>
          <div className="mt-0.5 text-[22px] font-semibold">
            {kpi.costPerHa != null ? (
              <MoneyValue amount={kpi.costPerHa} currency={currency} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
            {t("panel.kpi.costHaSub", { area: kpi.totalAreaHa })}
          </div>
        </div>
        <div className={cn(CELL, "border-t border-border sm:col-span-3 sm:border-t lg:col-span-1 lg:border-t-0")}>
          <div className={MICRO_LABEL}>{t("panel.kpi.jornales")}</div>
          <div className="mt-0.5 text-[22px] font-semibold">
            <Metric value={String(kpi.jornales)} />
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
            {t("panel.kpi.jornalesSub", { count: kpi.activeWorkerCount })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* LEFT: cost-by-parcel + recent activities */}
        <div className="flex flex-col gap-4">
          <div className="border border-border">
            <div className="flex items-baseline gap-2 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                {t("panel.costByParcel.title")}
              </span>
            </div>
            {parcelRows.length === 0 ? (
              <p className="border-t border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                {t("noData")}
              </p>
            ) : (
              <>
                <div
                  className={cn(
                    "grid border-t border-b border-border bg-muted/40",
                    PARCEL_COLS,
                  )}
                >
                  <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                    {t("panel.costByParcel.parcel")}
                  </div>
                  <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                    {t("panel.costByParcel.areaHa")}
                  </div>
                  <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                    {t("panel.costByParcel.total")}
                  </div>
                  <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                    {t("panel.costByParcel.costHa")}
                  </div>
                </div>
                {parcelRows.map((row) => (
                  <div key={row.parcelId} className={cn("grid", PARCEL_COLS, ROW)}>
                    <div className={CELL}>
                      {row.farmId ? (
                        <Link
                          href={`/o/${ctx.org.slug}/dashboard?view=mapa&farm=${row.farmId}`}
                          className="text-accent-link hover:underline"
                        >
                          {row.parcelName}
                        </Link>
                      ) : (
                        <span>{row.parcelName}</span>
                      )}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        · {row.farmName}
                      </span>
                    </div>
                    <div className={cn(CELL, "text-right font-mono tabular")}>
                      {fmtHa(row.areaHa)}
                    </div>
                    <div className={cn(CELL, "text-right font-mono tabular font-medium")}>
                      {fmtMoney(row.totalCost)}
                    </div>
                    <div className={cn(CELL, "text-right font-mono tabular text-muted-foreground")}>
                      {row.costPerHa ? fmtMoney(row.costPerHa) : "—"}
                    </div>
                  </div>
                ))}
                <div className={cn("grid bg-muted/40", PARCEL_COLS)}>
                  <div className={cn(CELL, "font-semibold")}>
                    {t("panel.costByParcel.totalRow")}
                  </div>
                  <div className={cn(CELL, "text-right font-mono tabular font-semibold")}>
                    {fmtHa(parcelTotals.areaHa)}
                  </div>
                  <div className={cn(CELL, "text-right font-mono tabular font-semibold")}>
                    {fmtMoney(parcelTotals.totalCost)}
                  </div>
                  <div className={cn(CELL, "text-right font-mono tabular font-semibold")}>
                    {parcelTotals.costPerHa != null
                      ? fmtMoney(parcelTotals.costPerHa)
                      : "—"}
                  </div>
                </div>
              </>
            )}
            <p className="border-t border-border px-3.5 py-2 text-[10.5px] text-muted-foreground">
              {t("panel.costByParcel.note")}
            </p>
          </div>

          <div className="border border-border">
            <div className="flex items-baseline gap-2 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                {t("panel.activities.title")}
              </span>
            </div>
            {activityRows.length === 0 ? (
              <p className="border-t border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                {t("panel.activities.empty")}
              </p>
            ) : (
              <>
                <div
                  className={cn(
                    "grid border-t border-b border-border bg-muted/40",
                    ACTIVITY_COLS,
                  )}
                >
                  <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                    {t("panel.activities.date")}
                  </div>
                  <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                    {t("panel.activities.activity")}
                  </div>
                  <div className={cn(CELL, "py-1.5", MICRO_LABEL)}>
                    {t("panel.activities.parcel")}
                  </div>
                  <div className={cn(CELL, "py-1.5 text-right", MICRO_LABEL)}>
                    {t("panel.activities.cost")}
                  </div>
                </div>
                {activityRows.map((row) => (
                  <div key={row.id} className={cn("grid", ACTIVITY_COLS, ROW)}>
                    <div className={cn(CELL, "font-mono tabular text-muted-foreground")}>
                      {fmtDate(row.date)}
                    </div>
                    <div className={CELL}>{row.typeName}</div>
                    <div className={CELL}>
                      {row.parcelId && row.farmId ? (
                        <Link
                          href={`/o/${ctx.org.slug}/dashboard?view=mapa&farm=${row.farmId}`}
                          className="text-accent-link hover:underline"
                        >
                          {row.parcelName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {row.parcelName ?? "—"}
                        </span>
                      )}
                    </div>
                    <div className={cn(CELL, "text-right font-mono tabular")}>
                      {fmtMoney(row.cost)}
                    </div>
                  </div>
                ))}
              </>
            )}
            <p className="border-t border-border px-3.5 py-2 text-[10.5px] text-muted-foreground">
              {t("panel.activities.note")}
            </p>
          </div>
        </div>

        {/* RIGHT rail: sync queue / rainfall / open work orders */}
        <div className="flex flex-col gap-4">
          <div className="border border-border">
            <div className="px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                {t("panel.sync.title")}
              </span>
            </div>
            <div className="border-t border-border px-3.5 py-2.5">
              <SyncIssuesList orgSlug={ctx.org.slug} />
              <div className="mt-2 flex flex-col gap-2">
                {SYNC_KINDS.map((kind) => (
                  <PendingEntries key={kind} orgSlug={ctx.org.slug} kind={kind} />
                ))}
              </div>
            </div>
          </div>

          <div className="border border-border">
            <div className="flex items-baseline gap-2 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                {t("panel.rainfall.title")}
              </span>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {t("panel.rainfall.unit")}
              </span>
            </div>
            {!rainfall ? (
              <p className="border-t border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                {t("panel.rainfall.empty")}
              </p>
            ) : rainfall.daysWithData === 0 ? (
              <p className="border-t border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                {t("panel.rainfall.noReadings")}
              </p>
            ) : (
              <div className="border-t border-border px-3.5 py-3">
                <div className="flex h-16 items-end gap-[2px]">
                  {rainfall.daily.map((day) => {
                    const max = Number(rainfall.maxMm);
                    const pct = max > 0 ? (day.mm / max) * 100 : 0;
                    return <Bar key={day.date} pct={pct} />;
                  })}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted-foreground">
                  <span>{fmtDate(rainfall.from)}</span>
                  <span>{t("panel.rainfall.max", { value: rainfall.maxMm })}</span>
                  <span>{fmtDate(rainfall.to)}</span>
                </div>
                <div className="mt-2.5 flex justify-between border-t border-border pt-2 text-[11px]">
                  <span className="text-muted-foreground">
                    {t("panel.rainfall.accumulated")}
                  </span>
                  <span className="font-mono text-[12px] font-medium tabular">
                    {rainfall.totalMm} mm
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{rainfall.farmName}</span>
                  <span className="font-mono">
                    {t("panel.rainfall.daysWithData", {
                      days: rainfall.daysWithData,
                      window: rainfall.windowDays,
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="border border-border">
            <div className="flex items-baseline gap-2 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                {t("panel.openWorkOrders.title")}
              </span>
              <Link
                href={`/o/${ctx.org.slug}/work-orders`}
                className="ml-auto text-[11px] text-accent-link hover:underline"
              >
                {t("panel.openWorkOrders.viewAll")}
              </Link>
            </div>
            {openWorkOrders.length === 0 ? (
              <p className="border-t border-border px-3.5 py-3 text-[12px] text-muted-foreground">
                {t("panel.openWorkOrders.empty")}
              </p>
            ) : (
              <div className="border-t border-border">
                {openWorkOrders.map((wo) => (
                  <div
                    key={wo.id}
                    className="flex items-center gap-2 border-b border-border/60 px-3.5 py-1.5 last:border-b-0"
                  >
                    <Link
                      href={`/o/${ctx.org.slug}/work-orders`}
                      className="shrink-0 font-mono text-[11px] font-medium text-accent-link hover:underline"
                    >
                      {wo.code}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {wo.title}
                    </span>
                    <StatusChip family="wo" state={WO_CHIP_STATE[wo.status]} className="shrink-0">
                      {tCockpit(`workOrder.status.${wo.status}`)}
                    </StatusChip>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
