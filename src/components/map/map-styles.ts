import type { StyleSpecification } from "maplibre-gl";

/** Free vector tiles, no API key required. */
export const STREETS_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Esri World Imagery raster tiles (attribution required). */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      maxzoom: 19,
    },
  },
  layers: [{ id: "esri-imagery", type: "raster", source: "esri" }],
};

/** Default view: Nicaragua / Central America. */
export const DEFAULT_VIEW = {
  longitude: -85.5,
  latitude: 12.5,
  zoom: 6.5,
};
