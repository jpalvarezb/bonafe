import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbSystem } from "@/lib/db";
import { harvestLots, processingRuns } from "@/lib/db/schema";
import { createPieceworkEntry } from "@/server/services/piecework";
import { createSale } from "@/server/services/sales";
import {
  cycleProfitabilityReport,
  orgUnattributedPieceworkCost,
} from "@/server/reports/profitability";
import type { OrgContext } from "@/lib/tenancy";
import {
  cleanupOrg,
  createOrgWithMember,
  insertCrop,
  insertCropCycle,
  insertFarm,
  insertOrgExchangeRate,
  insertParcel,
  insertPieceRate,
  insertWorker,
  type TestOrg,
} from "./support/fixtures";

/**
 * Encodes the money-loop manual verification (Run C: "Close the money
 * loop") as a real, DB-backed assertion. Mirrors the canonical seeded
 * fixture in src/scripts/seed.ts / tests/unit/profitability.test.ts's
 * "reconciles the seeded Café 2026-A fixture" case: José 40 lata + Rosa 35
 * lata @ 1.10 attributed to the cycle (82.50), Ana 50 surcos @ 0.80 left
 * unattributed (40.00) — except here the numbers come from real inserts
 * through the real service layer and a real chain-linked, FX-converted
 * sale, aggregated by the real report queries under RLS, not by calling
 * the pure calc helpers directly.
 *
 * Goes red if: attributed piecework stops flowing into its cycle's cost
 * row, an unattributed entry leaks into a cycle, or the sale's
 * currency x exchangeRate conversion drifts by even a cent.
 */
describe("money-loop reconciliation: cycleProfitabilityReport + orgUnattributedPieceworkCost", () => {
  let org: TestOrg;
  let ctx: OrgContext;
  let cycleId: string;

  beforeAll(async () => {
    const setup = await createOrgWithMember("owner");
    org = setup.org;
    ctx = setup.ctx;

    const farm = await insertFarm(org.id);
    const parcel = await insertParcel(org.id, farm.id);
    const crop = await insertCrop(org.id);
    const cycle = await insertCropCycle(org.id, {
      farmId: farm.id,
      parcelId: parcel.id,
      cropId: crop.id,
      name: "Café 2026-A",
      plantedAreaHa: "5",
    });
    cycleId = cycle.id;

    const jose = await insertWorker(org.id, "José");
    const rosa = await insertWorker(org.id, "Rosa");
    const ana = await insertWorker(org.id, "Ana");
    const rateCorte = await insertPieceRate(org.id, {
      name: "Corte",
      unit: "lata",
      rate: "1.1000",
    });
    const rateChapoda = await insertPieceRate(org.id, {
      name: "Chapoda",
      unit: "surco",
      rate: "0.8000",
    });

    // Attributed: José 40 lata + Rosa 35 lata @ 1.10 = 44.00 + 38.50 = 82.50
    await createPieceworkEntry(ctx, {
      workerId: jose.id,
      pieceRateId: rateCorte.id,
      cropCycleId: cycleId,
      date: "2026-06-20",
      quantity: "40.0000",
    });
    await createPieceworkEntry(ctx, {
      workerId: rosa.id,
      pieceRateId: rateCorte.id,
      cropCycleId: cycleId,
      date: "2026-06-21",
      quantity: "35.0000",
    });
    // Unattributed: Ana 50 surcos @ 0.80 = 40.00 — no cropCycleId.
    await createPieceworkEntry(ctx, {
      workerId: ana.id,
      pieceRateId: rateChapoda.id,
      date: "2026-06-22",
      quantity: "50.0000",
    });

    // Chain-linked sale: harvest lot -> processing run (200kg parchment,
    // 100.00 direct cost) -> sale. The sale carries NO manual cropCycleId;
    // its cycle is derived through the processingRunId chain
    // (resolveSaleCycle, src/lib/calc/profitability.ts).
    const [lot] = await dbSystem
      .insert(harvestLots)
      .values({ orgId: org.id, cropCycleId: cycleId, name: "Lot 1" })
      .returning();
    const [run] = await dbSystem
      .insert(processingRuns)
      .values({
        orgId: org.id,
        cropCycleId: cycleId,
        harvestLotId: lot.id,
        date: "2026-06-25",
        inputQuantity: "1000.0000",
        inputUnit: "kg",
        outputQuantity: "200.0000",
        outputUnit: "kg",
        cost: "100.0000",
      })
      .returning();

    // Sale denominated in EUR: 200kg @ 3.20 = 640.00 EUR, converted at
    // 1.25 -> 800.00 base-currency income. Exercises the same
    // total x exchangeRate conversion cycleProfitabilityReport applies.
    await insertOrgExchangeRate(org.id, {
      currencyCode: "EUR",
      rateToBase: "1.25000000",
      validDate: "2026-06-01",
    });
    await createSale(ctx, {
      processingRunId: run.id,
      date: "2026-06-30",
      buyerName: "Coffee Buyer Co",
      currencyCode: "EUR",
      lines: [
        { description: "200kg parchment", quantity: "200", unit: "kg", unitPrice: "3.20" },
      ],
    });
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("reconciles the cycle row exactly: FX-converted income, chain-linked processing cost, attributed piecework", async () => {
    const rows = await cycleProfitabilityReport(ctx, cycleId);
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.income).toBe("800.0000"); // 640.00 EUR x 1.25
    expect(row.activityCost).toBe("0.0000");
    expect(row.processingCost).toBe("100.0000");
    expect(row.pieceworkCost).toBe("82.5000"); // 44.00 (José) + 38.50 (Rosa)
    expect(row.totalCost).toBe("182.5000");
    expect(row.profit).toBe("617.5000");
    expect(row.marginPct).toBe("77.19");
    expect(row.costPerHa).toBe("36.5000");
    expect(row.incomePerHa).toBe("160.0000");
    expect(row.profitPerHa).toBe("123.5000");
    expect(row.costPerUnit).toBe("0.9125");
    expect(row.profitPerUnit).toBe("3.0875");
  });

  it("keeps Ana's unattributed entry out of the cycle and in the org-wide footnote", async () => {
    const rows = await cycleProfitabilityReport(ctx, cycleId);
    // The 40.00 unattributed entry must NOT have inflated the cycle's own
    // pieceworkCost above 82.50.
    expect(rows[0].pieceworkCost).toBe("82.5000");

    const footnote = await orgUnattributedPieceworkCost(ctx);
    expect(footnote).toBe("40.0000");
  });
});
