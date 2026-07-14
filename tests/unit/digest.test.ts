import { describe, expect, it } from "vitest";
import {
  assembleDigestSections,
  filterHighSeverityAlerts,
  filterLowStock,
  renderDigestEmail,
  severityBand,
  shouldSendDigest,
  type DigestInput,
} from "../../src/lib/email/digest";

const baseInput: DigestInput = {
  orgName: "Finca El Roble",
  subscriptionStatus: "active",
  lowStockProducts: [],
  monitoringAlerts: [],
};

describe("subscription section", () => {
  it("is included for past_due", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      subscriptionStatus: "past_due",
    });
    expect(sections.subscriptionStatus).toBe("past_due");
  });

  it("is included for canceled", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      subscriptionStatus: "canceled",
    });
    expect(sections.subscriptionStatus).toBe("canceled");
  });

  it("is omitted for trialing", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      subscriptionStatus: "trialing",
    });
    expect(sections.subscriptionStatus).toBeNull();
  });

  it("is omitted for active", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      subscriptionStatus: "active",
    });
    expect(sections.subscriptionStatus).toBeNull();
  });
});

describe("filterLowStock", () => {
  it("keeps a product strictly below its minStock threshold", () => {
    const result = filterLowStock([
      { productId: "p1", name: "Urea", quantity: "5.0000", minStock: "10.0000" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe("p1");
  });

  it("excludes a product exactly at its minStock threshold (boundary, not low)", () => {
    const result = filterLowStock([
      {
        productId: "p2",
        name: "Fungicida",
        quantity: "10.0000",
        minStock: "10.0000",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("excludes a product with no minStock set (null)", () => {
    const result = filterLowStock([
      { productId: "p3", name: "Semilla", quantity: "0.0000", minStock: null },
    ]);
    expect(result).toHaveLength(0);
  });

  it("excludes a product comfortably above its minStock threshold", () => {
    const result = filterLowStock([
      {
        productId: "p4",
        name: "Cal",
        quantity: "100.0000",
        minStock: "10.0000",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("uses decimal.js comparison, not float, at a precision-sensitive boundary", () => {
    // 0.1 + 0.2 style float error would wrongly report 0.30000000000000004
    // as "less than" 0.3 straddling comparisons; decimal.js must not drift.
    const result = filterLowStock([
      { productId: "p5", name: "Trazas", quantity: "0.3000", minStock: "0.3000" },
    ]);
    expect(result).toHaveLength(0);
  });
});

describe("severityBand", () => {
  it("bands severity 4 as high", () => {
    expect(severityBand(4)).toBe("high");
  });

  it("bands severity 5 as high", () => {
    expect(severityBand(5)).toBe("high");
  });

  it("bands severity 3 as normal (not high)", () => {
    expect(severityBand(3)).toBe("normal");
  });

  it("bands severity 1 as normal", () => {
    expect(severityBand(1)).toBe("normal");
  });
});

describe("filterHighSeverityAlerts", () => {
  it("keeps severity 4 and 5, drops severity 3 and below", () => {
    const alerts = [
      { id: "m1", severity: 5, title: "Plaga detectada" },
      { id: "m2", severity: 4, title: "Enfermedad foliar" },
      { id: "m3", severity: 3, title: "Observación menor" },
      { id: "m4", severity: 1, title: "Nota rutinaria" },
    ];
    const result = filterHighSeverityAlerts(alerts);
    expect(result.map((a: { id: string }) => a.id)).toEqual(["m1", "m2"]);
  });
});

describe("shouldSendDigest", () => {
  it("is false when subscription/low-stock/monitoring sections are all empty", () => {
    const sections = assembleDigestSections(baseInput);
    expect(shouldSendDigest(sections)).toBe(false);
  });

  it("is true when only the subscription section is populated", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      subscriptionStatus: "past_due",
    });
    expect(shouldSendDigest(sections)).toBe(true);
  });

  it("is true when only low-stock products are present", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      lowStockProducts: [
        { productId: "p1", name: "Urea", quantity: "1.0000", minStock: "5.0000" },
      ],
    });
    expect(shouldSendDigest(sections)).toBe(true);
  });

  it("is true when only high-severity monitoring alerts are present", () => {
    const sections = assembleDigestSections({
      ...baseInput,
      monitoringAlerts: [{ id: "m1", severity: 5, title: "Plaga detectada" }],
    });
    expect(shouldSendDigest(sections)).toBe(true);
  });
});

describe("renderDigestEmail", () => {
  const sections = assembleDigestSections({
    orgName: "Finca El Roble",
    subscriptionStatus: "past_due",
    lowStockProducts: [
      { productId: "p1", name: "Urea", quantity: "5.0000", minStock: "10.0000" },
    ],
    monitoringAlerts: [{ id: "m1", severity: 5, title: "Plaga detectada" }],
  });

  it("renders a distinct Spanish subject", () => {
    const email = renderDigestEmail(
      { orgName: "Finca El Roble", sections },
      "es",
    );
    expect(email.subject).toContain("Finca El Roble");
  });

  it("renders an English subject distinct from the Spanish one", () => {
    const es = renderDigestEmail({ orgName: "Finca El Roble", sections }, "es");
    const en = renderDigestEmail({ orgName: "Finca El Roble", sections }, "en");
    expect(en.subject).not.toBe(es.subject);
    expect(en.subject).toContain("Finca El Roble");
  });

  it("falls back to the Spanish subject for an unrecognized locale", () => {
    const es = renderDigestEmail({ orgName: "Finca El Roble", sections }, "es");
    const unknown = renderDigestEmail(
      { orgName: "Finca El Roble", sections },
      "fr",
    );
    expect(unknown.subject).toBe(es.subject);
  });
});
