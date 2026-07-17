import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Text/regex parse of src/scripts/seed.ts -- NOT a normal import. seed.ts
// pulls in ../lib/auth and ../lib/db (real drizzle/db-system wiring meant to
// run against a live Postgres), so importing the module in a plain vitest
// unit run would blow up on side effects/env vars that don't exist here.
// Reading it as text and regex-parsing the monitoring_records `date:` field
// is the only DB-free way to pin how the demo's monitoring pins stay inside
// the cockpit's rolling MONITORING_WINDOW_DAYS window (see
// src/server/reports/cockpit.ts) without the dates going stale/fixed.
//
// Mirrors seed-demo-coordinates.test.ts's convention: read seed.ts as text,
// scope a bounded window after each record's id literal, and regex out the
// field under test. This file only asserts on `date:`, never on
// `location`/`coordinates`, so it can't collide with the coordinate test.

const seedSource = readFileSync(
  path.resolve(__dirname, "../../src/scripts/seed.ts"),
  "utf8",
);

const MONITORING_WINDOW_DAYS = 60;

function findDaysAgoCallById(source: string, idSuffix: string): number {
  const idIndex = source.indexOf(idSuffix);
  if (idIndex === -1) {
    throw new Error(`id containing "${idSuffix}" not found in seed.ts`);
  }
  const window = source.slice(idIndex, idIndex + 1000);
  const m = window.match(/date:\s*daysAgo\((\d+)\)/);
  if (!m) {
    throw new Error(
      `no "date: daysAgo(N)" call found near id "${idSuffix}" -- ` +
        `seed.ts still uses a fixed date string literal for this record`,
    );
  }
  return Number(m[1]);
}

describe("seeded monitoring records use evergreen relative dates", () => {
  it("defines a local daysAgo(days) helper in seed.ts", () => {
    // Matches `function daysAgo(` or `const daysAgo = (` style declarations,
    // mirroring the existing fortnightDate(index) helper convention.
    const hasHelper =
      /function\s+daysAgo\s*\(/.test(seedSource) ||
      /const\s+daysAgo\s*=/.test(seedSource);
    expect(hasHelper).toBe(true);
  });

  const nBroca = findDaysAgoCallById(seedSource, "00000000ee01");
  const nRoya = findDaysAgoCallById(seedSource, "00000000ee02");
  const nCoyolillo = findDaysAgoCallById(seedSource, "00000000ee03");

  it("sets ee01 (Broca del café) date via daysAgo(N)", () => {
    expect(Number.isFinite(nBroca)).toBe(true);
  });

  it("sets ee02 (Roya) date via daysAgo(N)", () => {
    expect(Number.isFinite(nRoya)).toBe(true);
  });

  it("sets ee03 (Coyolillo) date via daysAgo(N)", () => {
    expect(Number.isFinite(nCoyolillo)).toBe(true);
  });

  it("keeps every monitoring pin strictly inside the cockpit's rolling window", () => {
    for (const n of [nBroca, nRoya, nCoyolillo]) {
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(MONITORING_WINDOW_DAYS);
    }
  });

  it("preserves relative ordering: Broca newest, then Coyolillo, then Roya oldest", () => {
    expect(nBroca).toBeLessThan(nCoyolillo);
    expect(nCoyolillo).toBeLessThan(nRoya);
  });
});
