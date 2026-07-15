import { describe, expect, it } from "vitest";
import {
  activityCreatePayload,
  monitoringCreatePayload,
  OUTBOX_KINDS,
  pieceworkEntryCreatePayload,
  workOrderCompletePayload,
} from "../../src/lib/offline/schemas";

/**
 * These payloads are shared verbatim by the client outbox (src/lib/offline/
 * outbox.ts) and the server sync route (src/app/api/sync/route.ts). Values
 * that pass here but violate a DB CHECK constraint still get rejected safely
 * (each per-item handler is wrapped in try/catch), but the rejection reads
 * as a raw Postgres error instead of a validation message — so zod should
 * mirror the DB bounds exactly.
 */
describe("activityCreatePayload input quantity", () => {
  const base = {
    id: "018f0000-0000-7000-8000-000000000001",
    activityTypeId: "018f0000-0000-7000-8000-000000000002",
    date: "2026-07-06",
    labor: [],
  };

  it("rejects a zero quantity (inventory_movements_quantity_nonzero_check)", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      inputs: [
        {
          productId: "018f0000-0000-7000-8000-000000000003",
          quantity: "0",
          unitCost: "10",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a positive quantity", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      inputs: [
        {
          productId: "018f0000-0000-7000-8000-000000000003",
          quantity: "0.01",
          unitCost: "10",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an omitted unitCost (server derives it from the default-warehouse WAC)", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      inputs: [
        {
          productId: "018f0000-0000-7000-8000-000000000003",
          quantity: "2",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty-string unitCost", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      inputs: [
        {
          productId: "018f0000-0000-7000-8000-000000000003",
          quantity: "2",
          unitCost: "",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("activityCreatePayload labor lines", () => {
  const base = {
    id: "018f0000-0000-7000-8000-000000000001",
    activityTypeId: "018f0000-0000-7000-8000-000000000002",
    date: "2026-07-06",
    inputs: [],
  };

  it("accepts a piecework line with a real worker link and quantity", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      labor: [
        {
          workerId: "018f0000-0000-7000-8000-000000000007",
          workersCount: 1,
          rateType: "piecework",
          quantity: "250",
          rate: "0.85",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid workerId", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      labor: [
        {
          workerId: "not-a-uuid",
          workersCount: 1,
          rateType: "daily",
          rate: "200",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("makes workerId and quantity optional (free-text-only labor still works)", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      labor: [
        {
          workerName: "Crew A",
          workersCount: 3,
          rateType: "daily",
          rate: "200",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rateType outside daily/hourly/piecework", () => {
    const result = activityCreatePayload.safeParse({
      ...base,
      labor: [
        {
          workersCount: 1,
          rateType: "weekly",
          rate: "200",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("monitoringCreatePayload incidencePct", () => {
  const base = {
    id: "018f0000-0000-7000-8000-000000000004",
    parcelId: "018f0000-0000-7000-8000-000000000005",
    date: "2026-07-06",
    type: "pest" as const,
    agentName: "aphid",
    severity: 3,
  };

  it("rejects a value above 100 (monitoring_records_incidence_pct_check)", () => {
    const result = monitoringCreatePayload.safeParse({
      ...base,
      incidencePct: "150",
    });
    expect(result.success).toBe(false);
  });

  it("accepts 100 (upper bound inclusive)", () => {
    const result = monitoringCreatePayload.safeParse({
      ...base,
      incidencePct: "100",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty string and omission", () => {
    expect(
      monitoringCreatePayload.safeParse({ ...base, incidencePct: "" })
        .success,
    ).toBe(true);
    expect(monitoringCreatePayload.safeParse(base).success).toBe(true);
  });
});

describe("monitoringCreatePayload location", () => {
  const base = {
    id: "018f0000-0000-7000-8000-000000000004",
    parcelId: "018f0000-0000-7000-8000-000000000005",
    date: "2026-07-06",
    type: "pest" as const,
    agentName: "aphid",
    severity: 3,
  };

  it("accepts a valid device GPS fix", () => {
    const result = monitoringCreatePayload.safeParse({
      ...base,
      location: { lat: 9.9281, lng: -84.0907 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts omission (location is optional — capture may be denied/offline)", () => {
    expect(monitoringCreatePayload.safeParse(base).success).toBe(true);
  });

  it("rejects latitude out of range", () => {
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: 90.1, lng: 0 },
      }).success,
    ).toBe(false);
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: -90.1, lng: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects longitude out of range", () => {
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: 0, lng: 180.1 },
      }).success,
    ).toBe(false);
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: 0, lng: -180.1 },
      }).success,
    ).toBe(false);
  });

  it("accepts the boundary values (±90 lat, ±180 lng)", () => {
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: 90, lng: 180 },
      }).success,
    ).toBe(true);
    expect(
      monitoringCreatePayload.safeParse({
        ...base,
        location: { lat: -90, lng: -180 },
      }).success,
    ).toBe(true);
  });
});

describe("workOrderCompletePayload", () => {
  const base = {
    workOrderId: "018f0000-0000-7000-8000-000000000006",
    checkedItemIds: ["item-1", "item-2"],
  };

  it("requires a uuid workOrderId", () => {
    expect(
      workOrderCompletePayload.safeParse({ ...base, workOrderId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("rejects more than 20 checked item ids (checklist max)", () => {
    const result = workOrderCompletePayload.safeParse({
      ...base,
      checkedItemIds: Array.from({ length: 21 }, (_, i) => `item-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 20 checked item ids", () => {
    const result = workOrderCompletePayload.safeParse({
      ...base,
      checkedItemIds: Array.from({ length: 20 }, (_, i) => `item-${i}`),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty checkedItemIds array", () => {
    expect(
      workOrderCompletePayload.safeParse({ ...base, checkedItemIds: [] })
        .success,
    ).toBe(true);
  });

  it("rejects an empty-string item id", () => {
    expect(
      workOrderCompletePayload.safeParse({ ...base, checkedItemIds: [""] })
        .success,
    ).toBe(false);
  });

  it("makes code/title optional display-only fields", () => {
    expect(workOrderCompletePayload.safeParse(base).success).toBe(true);
    expect(
      workOrderCompletePayload.safeParse({
        ...base,
        code: "OT-0001",
        title: "Spray north block",
      }).success,
    ).toBe(true);
  });
});

/**
 * Piecework capture (offline outbox kind "piecework.create"). Mirrors
 * createPieceworkEntry's org-ownership validation (worker/pieceRate/
 * cropCycle) — the amount is NEVER accepted from the client: it is always
 * computed server-side from the pieceRate snapshot at apply time.
 */
describe("pieceworkEntryCreatePayload", () => {
  const base = {
    id: "018f0000-0000-7000-8000-000000000101",
    workerId: "018f0000-0000-7000-8000-000000000102",
    pieceRateId: "018f0000-0000-7000-8000-000000000103",
    date: "2026-07-13",
    quantity: "125.5",
    notes: "Row 4-7, clean picking",
  };

  it("accepts a hand-computed valid fixture with all fields", () => {
    const result = pieceworkEntryCreatePayload.safeParse({
      ...base,
      cropCycleId: "018f0000-0000-7000-8000-000000000104",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an omitted cropCycleId (attribution is optional)", () => {
    expect(pieceworkEntryCreatePayload.safeParse(base).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({ ...base, id: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-uuid workerId", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({
        ...base,
        workerId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid pieceRateId", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({
        ...base,
        pieceRateId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid cropCycleId when provided", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({
        ...base,
        cropCycleId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects a comma-decimal quantity ('12,5')", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({ ...base, quantity: "12,5" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-numeric quantity ('abc')", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({ ...base, quantity: "abc" })
        .success,
    ).toBe(false);
  });

  it("rejects a negative quantity", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({ ...base, quantity: "-5" })
        .success,
    ).toBe(false);
  });

  it("rejects a zero quantity (no piecework units captured)", () => {
    expect(
      pieceworkEntryCreatePayload.safeParse({ ...base, quantity: "0" })
        .success,
    ).toBe(false);
  });

  it("parsed output never carries an amount field (server-computed only)", () => {
    const result = pieceworkEntryCreatePayload.safeParse({
      ...base,
      cropCycleId: "018f0000-0000-7000-8000-000000000104",
      // Attempt to smuggle a client-supplied amount through.
      amount: "999999.99",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).amount).toBeUndefined();
    }
  });

  it("registers under the 'piecework.create' outbox kind", () => {
    expect(Object.keys(OUTBOX_KINDS)).toContain("piecework.create");
    expect(OUTBOX_KINDS["piecework.create"]).toBe(pieceworkEntryCreatePayload);
  });
});
