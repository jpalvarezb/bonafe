"use client";

import { useCallback, useRef, useState } from "react";
import Map, { NavigationControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type maplibregl from "maplibre-gl";
import { TerraDraw, TerraDrawPolygonMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { GeoJsonPolygon } from "@/lib/db/geometry";
import { DEFAULT_VIEW, SATELLITE_STYLE, STREETS_STYLE } from "./map-styles";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  readonly initialBoundary?: GeoJsonPolygon | null;
  readonly onBoundaryChange: (boundary: GeoJsonPolygon | null) => void;
};

/** Map with a Terra Draw polygon mode for tracing a single parcel boundary. */
export function ParcelDrawMap({ initialBoundary, onBoundaryChange }: Props) {
  const t = useTranslations("farms");
  const [satellite, setSatellite] = useState(true);
  const [hasDrawing, setHasDrawing] = useState(Boolean(initialBoundary));
  const drawRef = useRef<TerraDraw | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  const initDraw = useCallback(
    (map: maplibregl.Map) => {
      if (drawRef.current) return;
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawPolygonMode()],
      });
      draw.start();
      draw.setMode("polygon");

      if (initialBoundary) {
        draw.addFeatures([
          {
            type: "Feature",
            geometry: initialBoundary,
            properties: { mode: "polygon" },
          },
        ]);
        const [lng, lat] = initialBoundary.coordinates[0][0];
        map.jumpTo({ center: [lng, lat], zoom: 15 });
      }

      draw.on("finish", () => {
        const features = draw.getSnapshot();
        const polygon = features.find(
          (f) => f.geometry.type === "Polygon",
        );
        if (polygon) {
          // Keep a single boundary: drop any earlier polygons.
          const extras = features.filter((f) => f.id !== polygon.id);
          if (extras.length > 0) {
            draw.removeFeatures(extras.map((f) => f.id as string));
          }
          onBoundaryChange(polygon.geometry as GeoJsonPolygon);
          setHasDrawing(true);
        }
      });

      drawRef.current = draw;
    },
    [initialBoundary, onBoundaryChange],
  );

  const clearDrawing = useCallback(() => {
    drawRef.current?.clear();
    onBoundaryChange(null);
    setHasDrawing(false);
  }, [onBoundaryChange]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("parcels.drawHint")}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSatellite((s) => !s)}
          >
            {satellite ? t("map.streets") : t("map.satellite")}
          </Button>
          {hasDrawing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearDrawing}
            >
              {t("parcels.clearDrawing")}
            </Button>
          )}
        </div>
      </div>
      <div className="h-96 overflow-hidden rounded-md border">
        <Map
          ref={mapRef}
          initialViewState={DEFAULT_VIEW}
          mapStyle={satellite ? SATELLITE_STYLE : STREETS_STYLE}
          onLoad={(event) => initDraw(event.target as maplibregl.Map)}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" />
        </Map>
      </div>
    </div>
  );
}
