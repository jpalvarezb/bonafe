import { describe, expect, it } from "vitest";
import {
  NAV_PINNED_TOP,
  NAV_PINNED_BOTTOM,
  NAV_SECTIONS,
} from "../../src/components/app-shell/nav-config";
import { PLAN_DEFINITIONS } from "../../src/lib/plan-limits";

// Pure data test — imports no client code (nav-config.ts has no "use client"
// pragma and no next-intl/i18n-navigation imports), so it can run under
// plain vitest without any React/DOM/next-intl test harness.

const ALL_ITEMS = [
  NAV_PINNED_TOP,
  ...NAV_SECTIONS.flatMap((section) => section.items),
  NAV_PINNED_BOTTOM,
];

// Exact expected route set per the IA Phase 1 spec: pinned Panel + the 24
// section items (Campo 5, Terreno 4, Gente 4, Inventario y activos 4,
// Comercial 4, Catálogo 3) + pinned Configuración = 26 routes.
const EXPECTED_HREFS = [
  "dashboard",
  "activities",
  "monitoring",
  "work-orders",
  "attendance",
  "harvests",
  "farms",
  "cycles",
  "climate",
  "planning",
  "workers",
  "payroll",
  "piecework",
  "reports/labor",
  "purchases",
  "inventory",
  "warehouses",
  "machinery",
  "processing",
  "sales",
  "budgets",
  "reports/profitability",
  "catalog/crops",
  "catalog/products",
  "cost-centers",
  "settings/general",
];

describe("sidebar nav structure", () => {
  it("exposes exactly the expected route set, with no duplicates", () => {
    const hrefs = ALL_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length); // no duplicates
    expect(hrefs.sort()).toEqual([...EXPECTED_HREFS].sort());
  });

  it("no longer menus map or settings/members (routes stay alive, just off the nav)", () => {
    const hrefs = ALL_ITEMS.map((item) => item.href);
    expect(hrefs).not.toContain("map");
    expect(hrefs).not.toContain("settings/members");
  });

  it("gates every item on a feature that actually exists in the Cosecha tier (no typo'd feature keys)", () => {
    const cosecha = PLAN_DEFINITIONS.find((def) => def.id === "cosecha");
    expect(cosecha).toBeDefined();
    const cosechaFeatures = new Set(cosecha!.limits.features);

    for (const item of ALL_ITEMS) {
      if (item.feature == null) continue;
      expect(
        cosechaFeatures.has(item.feature),
        `nav item "${item.key}" gates on feature "${item.feature}", which is not in the Cosecha tier's feature list`,
      ).toBe(true);
    }
  });

  it("gates each item on the exact feature its target page checks (verified in IA Phase 0)", () => {
    // route -> feature, from Phase 0's per-page hasFeature() verification.
    // Ungated routes are asserted to carry NO feature key (a spurious gate
    // would wrongly badge/lock an all-tiers screen).
    const EXPECTED_FEATURE: Record<string, string | undefined> = {
      dashboard: undefined,
      activities: undefined,
      monitoring: undefined,
      "work-orders": undefined,
      attendance: "labor",
      harvests: "harvest",
      farms: undefined,
      cycles: undefined,
      climate: undefined,
      planning: "planning",
      workers: "labor",
      payroll: "payroll",
      piecework: "payroll",
      "reports/labor": "labor",
      purchases: "inventory",
      inventory: "inventory",
      warehouses: "warehouses",
      machinery: "machinery",
      processing: "sales",
      sales: "sales",
      budgets: "budgets",
      "reports/profitability": "sales",
      "catalog/crops": undefined,
      "catalog/products": undefined,
      "cost-centers": undefined,
      "settings/general": undefined,
    };
    for (const item of ALL_ITEMS) {
      expect(
        item.feature,
        `nav item "${item.key}" (${item.href}) feature mismatch`,
      ).toBe(EXPECTED_FEATURE[item.href]);
    }
  });

  it("is data (arrays), not accordion state — every section has a non-empty items array", () => {
    expect(Array.isArray(NAV_SECTIONS)).toBe(true);
    expect(NAV_SECTIONS.length).toBeGreaterThan(0);
    for (const section of NAV_SECTIONS) {
      expect(Array.isArray(section.items)).toBe(true);
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("pins Panel above and Configuración below the sections", () => {
    expect(NAV_PINNED_TOP.href).toBe("dashboard");
    expect(NAV_PINNED_BOTTOM.href).toBe("settings/general");
  });
});
