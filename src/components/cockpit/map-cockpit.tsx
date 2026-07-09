"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import type { CockpitData, CockpitParcel } from "@/server/reports/cockpit";
import type { GeoJsonPoint, GeoJsonPolygon } from "@/lib/db/geometry";
import { DEFAULT_VIEW, SATELLITE_STYLE } from "@/components/map/map-styles";
import { severityBand } from "@/lib/severity";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Metric } from "@/components/ui/metric";
import { ViewToggle } from "./view-toggle";
import { CockpitRail } from "./cockpit-rail";
import { MoneyValue } from "./money-value";
import {
  assignCategoricalColors,
  readColorToken,
} from "./color-utils";
import "maplibre-gl/dist/maplibre-gl.css";

type LayerKey = "costHa" | "margin" | "crop" | "stage";
const LAYER_KEYS: readonly LayerKey[] = ["costHa", "margin", "crop", "stage"];

const NEUTRAL_FILL = "rgba(160, 160, 160, 0.35)";
const NEUTRAL_LINE = "rgba(210, 210, 210, 0.9)";

type Props = {
  readonly data: CockpitData;
  readonly orgSlug: string;
  readonly currencyCode: string;
  readonly farms: { id: string; name: string }[];
};

/** Terciles of cost/ha over parcels that have a value; [t1, t2] such that
 * low <= t1, mid <= t2, high > t2. Returns [0, 0] when nothing has data. */
function costThresholds(parcels: CockpitParcel[]): [number, number] {
  const values = parcels
    .map((p) => (p.costPerHa != null ? Number(p.costPerHa) : null))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (values.length === 0) return [0, 0];
  const at = (fraction: number) =>
    values[Math.min(values.length - 1, Math.floor(fraction * values.length))];
  return [at(1 / 3), at(2 / 3)];
}

/** Builds a MapLibre `["match", ["get","id"], id1, v1, id2, v2, ..., fallback]`
 * expression. Kept as a small typed helper since hand-rolled expression
 * arrays never structurally satisfy react-map-gl's strict paint types —
 * every call site casts the result with `as never` at the point of use
 * (safe: `never` is assignable to every declared paint-property type). */
function idMatchExpr(
  pairs: ReadonlyArray<readonly [string, string | number]>,
  fallback: string | number,
): unknown {
  // MapLibre rejects a match with no branches ("expected at least 4
  // arguments") — a farm whose parcels have no drawn boundaries produces
  // exactly that. A bare literal is the degenerate-but-valid equivalent.
  if (pairs.length === 0) return fallback;
  const flat: Array<string | number> = [];
  for (const [id, value] of pairs) flat.push(id, value);
  return ["match", ["get", "id"], ...flat, fallback];
}

export function MapCockpit({ data, orgSlug, currencyCode, farms }: Props) {
  const t = useTranslations("cockpit");
  const { resolvedTheme } = useTheme();
  const [layer, setLayer] = useState<LayerKey>("costHa");
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const didFitRef = useRef(false);

  // Re-reads the CSS custom properties (and re-converts oklch -> rgb) any
  // time the resolved theme flips, so dark/light recolors the map without a
  // reload — resolvedTheme itself isn't read inside, it's purely the
  // invalidation signal for the DOM read.
  const tokens = useMemo(
    () => ({
      good: readColorToken("--metric-good", "#2f9e6e"),
      mid: readColorToken("--metric-mid", "#e0912b"),
      bad: readColorToken("--metric-bad", "#c0392b"),
      sevLow: readColorToken("--sev-low-fg", "#2f9e6e"),
      sevMedium: readColorToken("--sev-medium-fg", "#e0912b"),
      sevHigh: readColorToken("--sev-high-fg", "#c0392b"),
      woDraft: readColorToken("--wo-draft-fg", "#8c8c8c"),
      woAssigned: readColorToken("--wo-assigned-fg", "#3f7fbf"),
      woProgress: readColorToken("--wo-progress-fg", "#e0912b"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedTheme triggers the re-read; the values themselves come from the DOM, not props/state.
    [resolvedTheme],
  );

  const cropColors = useMemo(
    () =>
      assignCategoricalColors(
        data.parcels
          .map((p) => p.primaryCycle?.cropName)
          .filter((v): v is string => v != null),
      ),
    [data.parcels],
  );
  const stageColors = useMemo(
    () =>
      assignCategoricalColors(
        data.parcels
          .map((p) => p.primaryCycle?.stageName)
          .filter((v): v is string => v != null),
      ),
    [data.parcels],
  );
  const [costLow, costHigh] = useMemo(
    () => costThresholds(data.parcels),
    [data.parcels],
  );

  const selectedParcel = useMemo(
    () => data.parcels.find((p) => p.id === selectedParcelId) ?? null,
    [data.parcels, selectedParcelId],
  );

  function styleForParcel(parcel: CockpitParcel): { color: string; hasData: boolean } {
    if (layer === "costHa") {
      const v = parcel.costPerHa != null ? Number(parcel.costPerHa) : null;
      if (v == null) return { color: "", hasData: false };
      const color = v <= costLow ? tokens.good : v <= costHigh ? tokens.mid : tokens.bad;
      return { color, hasData: true };
    }
    if (layer === "margin") {
      const pct = parcel.margin?.marginPct != null ? Number(parcel.margin.marginPct) : null;
      if (pct == null) return { color: "", hasData: false };
      const color = pct < 0 ? tokens.bad : pct <= 25 ? tokens.mid : tokens.good;
      return { color, hasData: true };
    }
    if (layer === "crop") {
      const name = parcel.primaryCycle?.cropName ?? null;
      if (!name) return { color: "", hasData: false };
      return { color: cropColors.get(name) ?? tokens.mid, hasData: true };
    }
    const name = parcel.primaryCycle?.stageName ?? null;
    if (!name) return { color: "", hasData: false };
    return { color: stageColors.get(name) ?? tokens.mid, hasData: true };
  }

  const withBoundary = useMemo(
    () => data.parcels.filter((p) => p.boundary),
    [data.parcels],
  );

  const parcelCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: withBoundary.map((p) => ({
        type: "Feature" as const,
        geometry: p.boundary as GeoJsonPolygon,
        properties: { id: p.id, name: p.name },
      })),
    }),
    [withBoundary],
  );

  const anySelected = selectedParcelId != null;
  const fillColorExpr = useMemo(() => {
    const pairs = withBoundary.map((p): [string, string] => {
      const { color, hasData } = styleForParcel(p);
      return [p.id, hasData ? color : NEUTRAL_FILL];
    });
    return idMatchExpr(pairs, NEUTRAL_FILL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withBoundary, layer, costLow, costHigh, cropColors, stageColors, tokens]);

  const lineColorExpr = useMemo(() => {
    const pairs = withBoundary.map((p): [string, string] => {
      const { color, hasData } = styleForParcel(p);
      return [p.id, hasData ? color : NEUTRAL_LINE];
    });
    return idMatchExpr(pairs, NEUTRAL_LINE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withBoundary, layer, costLow, costHigh, cropColors, stageColors, tokens]);

  const fillOpacityExpr = useMemo(() => {
    const pairs = withBoundary.map((p): [string, number] => [
      p.id,
      p.id === selectedParcelId ? 0.55 : anySelected ? 0.14 : 0.3,
    ]);
    return idMatchExpr(pairs, 0.3);
  }, [withBoundary, selectedParcelId, anySelected]);

  const lineWidthExpr = useMemo(() => {
    const pairs = withBoundary.map((p): [string, number] => [
      p.id,
      p.id === selectedParcelId ? 3.5 : 1.5,
    ]);
    return idMatchExpr(pairs, 1.5);
  }, [withBoundary, selectedParcelId]);

  const monitoringCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: data.monitoringPins.map((pin) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [pin.lng, pin.lat] } as GeoJsonPoint,
        properties: {
          id: pin.id,
          parcelId: pin.parcelId,
          label: `${pin.agentName} · ${t(`severity.${severityBand(pin.severity)}`)}`,
          severity: severityBand(pin.severity),
        },
      })),
    }),
    [data.monitoringPins, t],
  );

  const workOrderCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: data.workOrders.map((wo) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [wo.lng, wo.lat] } as GeoJsonPoint,
        properties: { id: wo.id, parcelId: wo.parcelId, code: wo.code, status: wo.status },
      })),
    }),
    [data.workOrders],
  );

  const bounds = useMemo(() => {
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const p of withBoundary) {
      const ring = (p.boundary as GeoJsonPolygon).coordinates[0];
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return minLng === Infinity
      ? null
      : ([
          [minLng, minLat],
          [maxLng, maxLat],
        ] as [[number, number], [number, number]]);
  }, [withBoundary]);

  // Fit-bounds runs exactly once, on the map's first `load` — a stable ref
  // (not an inline callback ref) so re-renders from clicking a parcel don't
  // detach/reattach the ref and re-run fitBounds, which would fight the
  // user's own pan/zoom every time selection state changes.
  const handleLoad = useCallback(() => {
    if (didFitRef.current) return;
    didFitRef.current = true;
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 96, left: 60, right: 360, bottom: 40 },
        duration: 0,
      });
    }
  }, [bounds]);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) {
      setSelectedParcelId(null);
      return;
    }
    const properties = feature.properties as
      | { id?: string; parcelId?: string }
      | undefined;
    // Parcel features key their own id under "id"; monitoring-pin and
    // work-order features carry the parcel they belong to under
    // "parcelId" instead (their own record id also happens to be under
    // "id", so the parcel layer must be checked first).
    const parcelId =
      feature.layer?.id === "cockpit-parcels-fill"
        ? (properties?.id ?? null)
        : (properties?.parcelId ?? null);
    setSelectedParcelId(parcelId);
  }, []);

  const totalAreaHa = data.parcels.reduce(
    (acc, p) => acc + Number(p.areaHa ?? 0),
    0,
  );
  const activeCyclesCount = data.parcels.reduce(
    (acc, p) => acc + p.cycles.length,
    0,
  );

  const kpiScope = selectedParcel
    ? {
        label: t("kpi.parcelScope"),
        title: selectedParcel.name,
        income: selectedParcel.margin?.income ?? "0",
        costs: selectedParcel.margin?.costs ?? selectedParcel.totalCost,
        marginPct: selectedParcel.margin?.marginPct ?? null,
        costHa: selectedParcel.costPerHa,
      }
    : {
        label: t("kpi.farmScope"),
        title: data.farmName,
        income: data.kpi.income,
        costs: data.kpi.costs,
        marginPct: data.kpi.marginPct,
        costHa: data.kpi.costPerHa,
      };

  if (data.parcels.length === 0) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-muted/30">
        <div className="absolute top-4 left-4">
          <ViewToggle
            orgSlug={orgSlug}
            active="mapa"
            farmId={data.farmId}
            labels={{ mapa: t("toggle.mapa"), panel: t("toggle.panel") }}
          />
        </div>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t("empty.noParcels")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        onLoad={handleLoad}
        initialViewState={DEFAULT_VIEW}
        mapStyle={SATELLITE_STYLE}
        interactiveLayerIds={["cockpit-parcels-fill", "cockpit-monitoring", "cockpit-wo-diamond"]}
        onClick={handleClick}
        style={{ width: "100%", height: "100%" }}
      >
        <ScaleControl position="bottom-left" unit="metric" />

        <Source id="cockpit-parcels" type="geojson" data={parcelCollection}>
          <Layer
            id="cockpit-parcels-fill"
            type="fill"
            paint={
              {
                "fill-color": fillColorExpr,
                "fill-opacity": fillOpacityExpr,
              } as never
            }
          />
          <Layer
            id="cockpit-parcels-line"
            type="line"
            paint={
              {
                "line-color": lineColorExpr,
                "line-width": lineWidthExpr,
              } as never
            }
          />
          <Layer
            id="cockpit-parcels-label"
            type="symbol"
            layout={
              {
                "text-field": ["get", "name"],
                "text-size": 11.5,
                "text-font": ["Noto Sans Bold"],
              } as never
            }
            paint={
              {
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.85)",
                "text-halo-width": 1.2,
              } as never
            }
          />
        </Source>

        <Source id="cockpit-monitoring" type="geojson" data={monitoringCollection}>
          <Layer
            id="cockpit-monitoring"
            type="circle"
            paint={
              {
                "circle-radius": 6,
                "circle-color": [
                  "match",
                  ["get", "severity"],
                  "low",
                  tokens.sevLow,
                  "medium",
                  tokens.sevMedium,
                  "high",
                  tokens.sevHigh,
                  tokens.sevMedium,
                ],
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#ffffff",
              } as never
            }
          />
          <Layer
            id="cockpit-monitoring-label"
            type="symbol"
            layout={
              {
                "text-field": ["get", "label"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 9.5,
                "text-offset": [0, -1.4],
                "text-anchor": "bottom",
              } as never
            }
            paint={
              {
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.9)",
                "text-halo-width": 1.1,
              } as never
            }
          />
        </Source>

        <Source id="cockpit-wo" type="geojson" data={workOrderCollection}>
          <Layer
            id="cockpit-wo-diamond"
            type="symbol"
            layout={
              {
                "text-field": "◆",
                "text-font": ["Noto Sans Regular"],
                "text-size": 15,
                "text-offset": [0.6, 0],
              } as never
            }
            paint={
              {
                "text-color": [
                  "match",
                  ["get", "status"],
                  "draft",
                  tokens.woDraft,
                  "assigned",
                  tokens.woAssigned,
                  "in_progress",
                  tokens.woProgress,
                  tokens.woAssigned,
                ],
                "text-halo-color": "#ffffff",
                "text-halo-width": 1,
              } as never
            }
          />
          <Layer
            id="cockpit-wo-label"
            type="symbol"
            layout={
              {
                "text-field": ["get", "code"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 9.5,
                "text-offset": [2, 0],
                "text-anchor": "left",
              } as never
            }
            paint={
              {
                "text-color": "#ffffff",
                "text-halo-color": "rgba(0,0,0,0.9)",
                "text-halo-width": 1.1,
              } as never
            }
          />
        </Source>
      </Map>

      {/* Top-left: view toggle + farm picker + layer switcher */}
      <div className="absolute top-4 left-4 flex w-[220px] flex-col gap-2">
        <ViewToggle
          orgSlug={orgSlug}
          active="mapa"
          farmId={data.farmId}
          labels={{ mapa: t("toggle.mapa"), panel: t("toggle.panel") }}
        />
        {farms.length > 1 && (
          <div className="flex flex-wrap gap-1 border border-border bg-background/95 p-1.5">
            {farms.map((farm) => (
              <Link
                key={farm.id}
                href={`/o/${orgSlug}/dashboard?view=mapa&farm=${farm.id}`}
                className={cn(
                  "px-2 py-0.5 font-mono text-[10.5px]",
                  farm.id === data.farmId
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {farm.name}
              </Link>
            ))}
          </div>
        )}
        <div className="border border-border bg-background/95">
          <div className="border-b border-border px-2.5 py-1.5 font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
            {t("layers.title")}
          </div>
          <div className="grid grid-cols-2">
            {LAYER_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setLayer(key)}
                className={cn(
                  "border-r border-b border-border px-2.5 py-2 text-left text-[11px] font-medium [&:nth-child(2n)]:border-r-0",
                  layer === key
                    ? "bg-foreground text-background"
                    : "text-foreground/80 hover:bg-muted",
                )}
              >
                {t(`layers.${key}`)}
              </button>
            ))}
          </div>
          <LayerLegend
            layer={layer}
            costLow={costLow}
            costHigh={costHigh}
            cropColors={cropColors}
            stageColors={stageColors}
          />
        </div>
      </div>

      {/* Top-center: KPI strip */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 border border-border bg-background/95">
        <div className="flex items-center gap-2 border-b border-border px-4 py-1">
          <span className="font-mono text-[8.5px] tracking-wide text-muted-foreground uppercase">
            {kpiScope.label}
          </span>
          <span className="font-mono text-[11px] font-semibold">{kpiScope.title}</span>
        </div>
        <div className="flex">
          <div className="border-r border-border px-4 py-1.5">
            <div className="font-mono text-[8.5px] tracking-wide text-muted-foreground uppercase">
              {t("kpi.income")}
            </div>
            <MoneyValue amount={kpiScope.income} currency={currencyCode} className="mt-0.5 text-[15px] font-semibold" />
          </div>
          <div className="border-r border-border px-4 py-1.5">
            <div className="font-mono text-[8.5px] tracking-wide text-muted-foreground uppercase">
              {t("kpi.costs")}
            </div>
            <MoneyValue amount={kpiScope.costs} currency={currencyCode} className="mt-0.5 text-[15px] font-semibold" />
          </div>
          <div className="border-r border-border px-4 py-1.5">
            <div className="font-mono text-[8.5px] tracking-wide text-muted-foreground uppercase">
              {t("kpi.margin")}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold">
              {kpiScope.marginPct != null ? (
                <Metric value={`${kpiScope.marginPct}%`} signed />
              ) : (
                <span title={t("rail.noMargin")} className="text-muted-foreground">
                  —
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-1.5">
            <div className="font-mono text-[8.5px] tracking-wide text-muted-foreground uppercase">
              {t("kpi.costHa")}
            </div>
            {kpiScope.costHa != null ? (
              <MoneyValue
                amount={kpiScope.costHa}
                currency={currencyCode}
                className="mt-0.5 text-[15px] font-semibold"
              />
            ) : (
              <span className="mt-0.5 block text-[15px] font-semibold text-muted-foreground">
                —
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right rail */}
      <div className="absolute top-4 right-4 max-h-[calc(100%-2rem)]">
        <CockpitRail
          orgSlug={orgSlug}
          currencyCode={currencyCode}
          farmName={data.farmName}
          parcelCount={data.parcels.length}
          totalAreaHa={totalAreaHa}
          activeCyclesCount={activeCyclesCount}
          selected={selectedParcel}
          planning={data.planning}
          labor={data.labor}
        />
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 font-mono text-[9px] text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        {t("basemapAttribution")}
      </div>
    </div>
  );
}

function LayerLegend({
  layer,
  costLow,
  costHigh,
  cropColors,
  stageColors,
}: {
  readonly layer: LayerKey;
  readonly costLow: number;
  readonly costHigh: number;
  readonly cropColors: Map<string, string>;
  readonly stageColors: Map<string, string>;
}) {
  const t = useTranslations("cockpit");

  // DOM swatches use var() references, NOT the converted token values the
  // map layers need — the browser resolves these identically on server and
  // client, so the SSR'd style attribute never mismatches on hydration.
  const cssVar = { good: "var(--metric-good)", mid: "var(--metric-mid)", bad: "var(--metric-bad)" };

  let items: Array<{ color: string; label: string }>;
  if (layer === "costHa") {
    items = [
      { color: cssVar.good, label: `≤ ${costLow.toFixed(0)} · ${t("legend.costLow")}` },
      {
        color: cssVar.mid,
        label: `${costLow.toFixed(0)}–${costHigh.toFixed(0)} · ${t("legend.costMid")}`,
      },
      { color: cssVar.bad, label: `> ${costHigh.toFixed(0)} · ${t("legend.costHigh")}` },
    ];
  } else if (layer === "margin") {
    items = [
      { color: cssVar.bad, label: `< 0% · ${t("legend.marginLow")}` },
      { color: cssVar.mid, label: `0–25% · ${t("legend.marginMid")}` },
      { color: cssVar.good, label: `> 25% · ${t("legend.marginHigh")}` },
    ];
  } else if (layer === "crop") {
    items = [...cropColors.entries()].map(([name, color]) => ({ color, label: name }));
  } else {
    items = [...stageColors.entries()].map(([name, color]) => ({ color, label: name }));
  }

  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-2">
      <div className="font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase">
        {t(`legend.titles.${layer}`)}
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("legend.noActiveCycle")}</p>
      ) : (
        items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[11px]">
            <span className="h-2.5 w-2.5 flex-none" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))
      )}
    </div>
  );
}
