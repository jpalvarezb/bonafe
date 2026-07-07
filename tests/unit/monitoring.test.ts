import { describe, expect, it } from "vitest";
import {
  monitoringPhotoSchema,
  monitoringPhotosSchema,
  toPointGeometry,
} from "../../src/server/services/monitoring";

describe("toPointGeometry", () => {
  it("builds a GeoJSON Point with lng-first coordinates", () => {
    // GeoJSON order is [lng, lat] — the opposite of the {lat, lng} device
    // fix — mirroring src/lib/db/geometry.ts and parcel boundary handling.
    expect(toPointGeometry({ lat: 9.9281, lng: -84.0907 })).toEqual({
      type: "Point",
      coordinates: [-84.0907, 9.9281],
    });
  });

  it("round-trips zero coordinates (equator/prime meridian)", () => {
    expect(toPointGeometry({ lat: 0, lng: 0 })).toEqual({
      type: "Point",
      coordinates: [0, 0],
    });
  });
});

describe("monitoringPhotoSchema / monitoringPhotosSchema", () => {
  it("accepts a photo with just a path", () => {
    expect(monitoringPhotoSchema.safeParse({ path: "org/1/photo.jpg" }).success).toBe(
      true,
    );
  });

  it("accepts a photo with a caption", () => {
    expect(
      monitoringPhotoSchema.safeParse({
        path: "org/1/photo.jpg",
        caption: "Underside of leaf",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty path", () => {
    expect(monitoringPhotoSchema.safeParse({ path: "" }).success).toBe(false);
  });

  it("rejects a caption over 200 chars", () => {
    expect(
      monitoringPhotoSchema.safeParse({
        path: "org/1/photo.jpg",
        caption: "x".repeat(201),
      }).success,
    ).toBe(false);
  });

  it("defaults to an empty array", () => {
    expect(monitoringPhotosSchema.parse(undefined)).toEqual([]);
  });

  it("rejects more than 10 photos", () => {
    const photos = Array.from({ length: 11 }, (_, i) => ({
      path: `org/1/photo-${i}.jpg`,
    }));
    expect(monitoringPhotosSchema.safeParse(photos).success).toBe(false);
  });

  it("accepts exactly 10 photos", () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({
      path: `org/1/photo-${i}.jpg`,
    }));
    expect(monitoringPhotosSchema.safeParse(photos).success).toBe(true);
  });
});
