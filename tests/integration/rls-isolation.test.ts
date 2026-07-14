import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withOrgRls } from "@/lib/db/rls";
import {
  activities,
  inventoryMovements,
  orgExchangeRates,
  pieceworkEntries,
  sales,
} from "@/lib/db/schema";
import {
  cleanupOrg,
  createTestOrg,
  seedRlsFixtureRows,
  type TestOrg,
} from "./support/fixtures";

/**
 * Runtime RLS tenant isolation — the flagship invariant. `pnpm db:verify-rls`
 * only checks (via static introspection) that a policy EXISTS; nothing
 * before this suite actually opened a connection as `agropeq_app` and
 * proved a row from org B is unreachable from org A's context.
 *
 * Every assertion here goes red if:
 *  - any drizzle/0018 policy is dropped or weakened (reads/writes would
 *    start crossing org boundaries),
 *  - the `agropeq_app` role ever gains BYPASSRLS (drizzle/0017), or
 *  - the fail-closed `org_id = current_setting('app.org_id', true)` NULL
 *    comparison is replaced with a default/fallback org id.
 */
describe("RLS tenant isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let fixturesA: Awaited<ReturnType<typeof seedRlsFixtureRows>>;
  let fixturesB: Awaited<ReturnType<typeof seedRlsFixtureRows>>;

  beforeAll(async () => {
    orgA = await createTestOrg();
    orgB = await createTestOrg();
    fixturesA = await seedRlsFixtureRows(orgA.id);
    fixturesB = await seedRlsFixtureRows(orgB.id);
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  describe("reads under org A's context never surface org B rows", () => {
    it("sales", async () => {
      const rows = await withOrgRls(orgA.id, (tx) => tx.select().from(sales));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.orgId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.id === fixturesB.sale.id)).toBe(false);
      expect(rows.some((r) => r.id === fixturesA.sale.id)).toBe(true);
    });

    it("piecework_entries", async () => {
      const rows = await withOrgRls(orgA.id, (tx) =>
        tx.select().from(pieceworkEntries),
      );
      expect(rows.every((r) => r.orgId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.id === fixturesB.pieceworkEntry.id)).toBe(
        false,
      );
      expect(rows.some((r) => r.id === fixturesA.pieceworkEntry.id)).toBe(
        true,
      );
    });

    it("activities", async () => {
      const rows = await withOrgRls(orgA.id, (tx) =>
        tx.select().from(activities),
      );
      expect(rows.every((r) => r.orgId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.id === fixturesB.activity.id)).toBe(false);
      expect(rows.some((r) => r.id === fixturesA.activity.id)).toBe(true);
    });

    it("inventory_movements", async () => {
      const rows = await withOrgRls(orgA.id, (tx) =>
        tx.select().from(inventoryMovements),
      );
      expect(rows.every((r) => r.orgId === orgA.id)).toBe(true);
      expect(
        rows.some((r) => r.id === fixturesB.inventoryMovement.id),
      ).toBe(false);
      expect(
        rows.some((r) => r.id === fixturesA.inventoryMovement.id),
      ).toBe(true);
    });

    it("org_exchange_rates", async () => {
      const rows = await withOrgRls(orgA.id, (tx) =>
        tx.select().from(orgExchangeRates),
      );
      expect(rows.every((r) => r.orgId === orgA.id)).toBe(true);
      expect(rows.some((r) => r.id === fixturesB.exchangeRate.id)).toBe(
        false,
      );
      expect(rows.some((r) => r.id === fixturesA.exchangeRate.id)).toBe(
        true,
      );
    });
  });

  describe("writes targeting org B's rows under org A's context are no-ops, not errors", () => {
    it("UPDATE affects 0 rows and leaves org B's row untouched", async () => {
      const updated = await withOrgRls(orgA.id, (tx) =>
        tx
          .update(sales)
          .set({ buyerName: "Hijacked by org A" })
          .where(eq(sales.id, fixturesB.sale.id))
          .returning(),
      );
      expect(updated).toHaveLength(0);

      const [stillThere] = await withOrgRls(orgB.id, (tx) =>
        tx.select().from(sales).where(eq(sales.id, fixturesB.sale.id)),
      );
      expect(stillThere.buyerName).toBe("Test Buyer");
    });

    it("DELETE affects 0 rows and leaves org B's row in place", async () => {
      const deleted = await withOrgRls(orgA.id, (tx) =>
        tx
          .delete(pieceworkEntries)
          .where(eq(pieceworkEntries.id, fixturesB.pieceworkEntry.id))
          .returning(),
      );
      expect(deleted).toHaveLength(0);

      const [stillThere] = await withOrgRls(orgB.id, (tx) =>
        tx
          .select()
          .from(pieceworkEntries)
          .where(eq(pieceworkEntries.id, fixturesB.pieceworkEntry.id)),
      );
      expect(stillThere).toBeDefined();
    });

    it("INSERT claiming org B's org_id is refused (WITH CHECK violation)", async () => {
      await expect(
        withOrgRls(orgA.id, (tx) =>
          tx.insert(orgExchangeRates).values({
            orgId: orgB.id,
            currencyCode: "HNL",
            rateToBase: "1.00000000",
            validDate: "2026-02-01",
          }),
        ),
      ).rejects.toThrow();

      // Confirm nothing was smuggled in under org B either.
      const rows = await withOrgRls(orgB.id, (tx) =>
        tx
          .select()
          .from(orgExchangeRates)
          .where(eq(orgExchangeRates.currencyCode, "HNL")),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("fail-closed behavior on the agropeq_app role directly", () => {
    it("a raw connection with NO app.org_id set returns zero rows, even though rows exist", async () => {
      const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
      try {
        const { rows } = await pool.query(
          "select * from sales where org_id = $1",
          [orgA.id],
        );
        expect(rows).toHaveLength(0);
      } finally {
        await pool.end();
      }
    });

    it("NOBYPASSRLS: an explicit cross-org WHERE clause under org A's context still returns zero rows", async () => {
      const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('app.org_id', $1, true)", [
          orgA.id,
        ]);
        // A hostile/buggy query explicitly asking for org B's rows by id —
        // RLS must intersect this predicate with the policy, not let a
        // client-supplied WHERE override it.
        const { rows } = await client.query(
          "select * from sales where org_id = $1",
          [orgB.id],
        );
        expect(rows).toHaveLength(0);
        await client.query("commit");
      } finally {
        client.release();
        await pool.end();
      }
    });
  });
});
