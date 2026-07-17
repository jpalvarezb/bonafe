import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text/regex parse of src/scripts/seed.ts -- NOT a normal import. seed.ts
// pulls in ../lib/auth and ../lib/db (real drizzle/db-system wiring meant to
// run against a live Postgres), so importing the module in a plain vitest
// unit run would blow up on side effects/env vars that don't exist here.
// Reading it as text and regex-parsing the polygonAround(...) call sites and
// monitoringRecords Point coordinates is the only DB-free way to pin the
// demo farm's seeded lat/lng values.
//
// Mirrors monitoring.test.ts's convention of asserting on literal GeoJSON
// [lng, lat] coordinate pairs, just sourced from seed.ts text instead of a
// runtime helper.

const seedSource = readFileSync(
  path.resolve(__dirname, "../../src/scripts/seed.ts"),
  "utf8",
);

interface PolygonCall {
  lng: number;
  lat: number;
  dLng: number;
  dLat: number;
  seed: number;
  vertexCount: number;
}

function parsePolygonCalls(source: string): PolygonCall[] {
  const re =
    /polygonAround\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(\d+),\s*(\d+)\s*\)/g;
  const calls: PolygonCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    calls.push({
      lng: Number(m[1]),
      lat: Number(m[2]),
      dLng: Number(m[3]),
      dLat: Number(m[4]),
      seed: Number(m[5]),
      vertexCount: Number(m[6]),
    });
  }
  return calls;
}

function findCallBySeed(calls: PolygonCall[], seed: number): PolygonCall {
  const call = calls.find((c) => c.seed === seed);
  if (!call) {
    throw new Error(`no polygonAround(...) call with seed ${seed} found in seed.ts`);
  }
  return call;
}

function parsePointById(source: string, idSuffix: string): [number, number] {
  // Points are authored as:
  //   { id: "...ee01", ... , location: { type: "Point" as const, coordinates: [lng, lat] } }
  // Search for the id literal, then the next "coordinates: [...]" after it --
  // scoped to a bounded window so a later record's coordinates can't
  // accidentally match.
  const idIndex = source.indexOf(idSuffix);
  if (idIndex === -1) {
    throw new Error(`id containing "${idSuffix}" not found in seed.ts`);
  }
  const window = source.slice(idIndex, idIndex + 1000);
  const m = window.match(/coordinates:\s*\[(-?[\d.]+),\s*(-?[\d.]+)\]/);
  if (!m) {
    throw new Error(`no coordinates found near id "${idSuffix}"`);
  }
  return [Number(m[1]), Number(m[2])];
}

const calls = parsePolygonCalls(seedSource);

describe("seeded demo farm coordinates (Finca La Esperanza translation)", () => {
  it("finds all four polygonAround(...) parcel calls", () => {
    expect(calls).toHaveLength(4);
  });

  const parcelA = findCallBySeed(calls, 101);
  const parcelB = findCallBySeed(calls, 102);
  const parcelC = findCallBySeed(calls, 103);
  const parcelD = findCallBySeed(calls, 104);

  // Delta between the (possibly translated) parcelA center and the
  // ORIGINAL town-center coordinates it used to sit on.
  const dLng = parcelA.lng - -85.92;
  const dLat = parcelA.lat - 12.93;

  it("moves parcelA (seed 101) off the original town center (-85.92, 12.93)", () => {
    // This is the crux of the red condition: today parcelA is centered
    // exactly at (-85.92, 12.93), so dLng/dLat both come out to 0 -- which
    // this assertion rejects. It should only pass once the farm has been
    // translated onto vegetation/canopy.
    expect(dLng !== 0 || dLat !== 0).toBe(true);
  });

  it("translates parcelB (seed 102) by the exact same delta as parcelA", () => {
    expect(parcelB.lng).toBeCloseTo(-85.914 + dLng, 9);
    expect(parcelB.lat).toBeCloseTo(12.932 + dLat, 9);
  });

  it("translates parcelC (seed 103) by the exact same delta as parcelA", () => {
    expect(parcelC.lng).toBeCloseTo(-85.917 + dLng, 9);
    expect(parcelC.lat).toBeCloseTo(12.926 + dLat, 9);
  });

  it("leaves parcelA/B/C shape params (half-extents, seed, vertexCount) untouched", () => {
    expect([parcelA.dLng, parcelA.dLat, parcelA.seed, parcelA.vertexCount]).toEqual([
      0.0022, 0.0018, 101, 8,
    ]);
    expect([parcelB.dLng, parcelB.dLat, parcelB.seed, parcelB.vertexCount]).toEqual([
      0.0018, 0.0022, 102, 7,
    ]);
    expect([parcelC.dLng, parcelC.dLat, parcelC.seed, parcelC.vertexCount]).toEqual([
      0.0016, 0.0014, 103, 10,
    ]);
  });

  it("moves the ee01 monitoring point (parcelA) by the same delta", () => {
    const [lng, lat] = parsePointById(seedSource, "00000000ee01");
    expect(lng).toBeCloseTo(-85.9205 + dLng, 9);
    expect(lat).toBeCloseTo(12.9305 + dLat, 9);
  });

  it("moves the ee02 monitoring point (parcelA) by the same delta", () => {
    const [lng, lat] = parsePointById(seedSource, "00000000ee02");
    expect(lng).toBeCloseTo(-85.9192 + dLng, 9);
    expect(lat).toBeCloseTo(12.9295 + dLat, 9);
  });

  it("leaves Finca Vista Hermosa (parcelD, seed 104) completely untouched", () => {
    expect([
      parcelD.lng,
      parcelD.lat,
      parcelD.dLng,
      parcelD.dLat,
      parcelD.seed,
      parcelD.vertexCount,
    ]).toEqual([-86.05, 12.85, 0.003, 0.002, 104, 6]);
  });

  it("leaves the ee03 monitoring point (Vista Hermosa) completely untouched", () => {
    const [lng, lat] = parsePointById(seedSource, "00000000ee03");
    expect([lng, lat]).toEqual([-86.0508, 12.8497]);
  });
});
