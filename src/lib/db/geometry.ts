import { customType } from "drizzle-orm/pg-core";
import wkx from "wkx";

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

type GeoJsonPoint = {
  type: "Point";
  coordinates: number[];
};

function fromWkbHex<T>(value: string): T {
  return wkx.Geometry.parse(Buffer.from(value, "hex")).toGeoJSON() as T;
}

function toEwkt(geojson: GeoJsonPolygon | GeoJsonPoint): string {
  const wkt = wkx.Geometry.parseGeoJSON(geojson).toWkt();
  return `SRID=4326;${wkt}`;
}

/** PostGIS geometry(Polygon,4326) marshalled as GeoJSON. */
export const geoPolygon = customType<{
  data: GeoJsonPolygon;
  driverData: string;
}>({
  dataType() {
    return "geometry(Polygon,4326)";
  },
  toDriver(value) {
    return toEwkt(value);
  },
  fromDriver(value) {
    return fromWkbHex<GeoJsonPolygon>(value);
  },
});

/** PostGIS geometry(Point,4326) marshalled as GeoJSON. */
export const geoPoint = customType<{
  data: GeoJsonPoint;
  driverData: string;
}>({
  dataType() {
    return "geometry(Point,4326)";
  },
  toDriver(value) {
    return toEwkt(value);
  },
  fromDriver(value) {
    return fromWkbHex<GeoJsonPoint>(value);
  },
});

export type { GeoJsonPolygon, GeoJsonPoint };
