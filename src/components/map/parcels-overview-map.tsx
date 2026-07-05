"use client";

import { useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { GeoJsonPolygon } from "@/lib/db/geometry";
import { DEFAULT_VIEW, SATELLITE_STYLE, STREETS_STYLE } from "./map-styles";
import "maplibre-gl/dist/maplibre-gl.css";

export type ParcelFeatureInput = {
  id: string;
  name: string;
  farmName?: string;
  boundary: GeoJsonPolygon | null;
};

type Props = {
  readonly parcels: ParcelFeatureInput[];
  readonly heightClass?: string;
};

export function ParcelsOverviewMap({
  parcels,
  heightClass = "h-[70vh]",
}: Props) {
  const t = useTranslations("farms");
  const [satellite, setSatellite] = useState(true);

  const { collection, initialView } = useMemo(() => {
    const withBoundary = parcels.filter((p) => p.boundary);
    const features = withBoundary.map((p) => ({
      type: "Feature" as const,
      geometry: p.boundary as GeoJsonPolygon,
      properties: { id: p.id, name: p.name, farmName: p.farmName ?? "" },
    }));

    let view = DEFAULT_VIEW;
    const first = withBoundary[0]?.boundary;
    if (first) {
      const ring = first.coordinates[0];
      const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      view = { longitude: lng, latitude: lat, zoom: 14 };
    }
    return {
      collection: { type: "FeatureCollection" as const, features },
      initialView: view,
    };
  }, [parcels]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSatellite((s) => !s)}
        >
          {satellite ? t("map.streets") : t("map.satellite")}
        </Button>
      </div>
      <div className={`overflow-hidden rounded-md border ${heightClass}`}>
        <Map
          initialViewState={initialView}
          mapStyle={satellite ? SATELLITE_STYLE : STREETS_STYLE}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" />
          <Source id="parcels" type="geojson" data={collection}>
            <Layer
              id="parcels-fill"
              type="fill"
              paint={{ "fill-color": "#22c55e", "fill-opacity": 0.25 }}
            />
            <Layer
              id="parcels-line"
              type="line"
              paint={{ "line-color": "#16a34a", "line-width": 2 }}
            />
            <Layer
              id="parcels-label"
              type="symbol"
              layout={{
                "text-field": ["get", "name"],
                "text-size": 12,
              }}
              paint={{
                "text-color": "#ffffff",
                "text-halo-color": "#166534",
                "text-halo-width": 1,
              }}
            />
          </Source>
        </Map>
      </div>
    </div>
  );
}
