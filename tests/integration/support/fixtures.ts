import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { dbSystem } from "@/lib/db";
import {
  activities,
  activityTypes,
  cropCycles,
  crops,
  farms,
  inventoryMovements,
  member,
  organization,
  orgExchangeRates,
  orgSubscriptions,
  parcels,
  pieceRates,
  pieceworkEntries,
  plans,
  products,
  sales,
  stripeEvents,
  user,
  warehouses,
  workers,
} from "@/lib/db/schema";
import type { OrgContext, SubscriptionStatus } from "@/lib/tenancy";
import type { OrgRole } from "@/lib/auth/permissions";
import { PLAN_DEFINITIONS } from "@/lib/plan-limits";

/**
 * Shared integration-test fixtures. Every helper writes through `dbSystem`
 * (the owner/bypasses-RLS connection — same module the seed script and the
 * Stripe webhook use), because setting up fixture data is not itself the
 * behavior under test; the tests exercise the RLS-bound `db` connection
 * (via `withOrgRls`) and the real services/routes on top of it.
 *
 * Isolation strategy: every test gets its OWN freshly-generated org id
 * (and user/worker/etc ids scoped under it), so tests never collide
 * regardless of execution order — and `cleanupOrg` cascades (every
 * org-scoped table's `org_id` FK is `onDelete: "cascade"`, see
 * src/lib/db/schema/helpers.ts `orgId()`) so one call tears down an
 * entire test's fixture tree. Non-org-scoped globals used by a couple of
 * suites (`plans`, `stripe_events`) are cleaned up by those suites
 * directly, keyed by their own test-local ids.
 */

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export type TestOrg = {
  id: string;
  slug: string;
  name: string;
  baseCurrencyCode: string;
};

export async function createTestOrg(
  overrides: Partial<{
    name: string;
    baseCurrencyCode: string;
  }> = {},
): Promise<TestOrg> {
  const id = randomUUID();
  const slug = uniqueSlug("test-org");
  const [created] = await dbSystem
    .insert(organization)
    .values({
      id,
      name: overrides.name ?? `Test Org ${id.slice(0, 8)}`,
      slug,
      baseCurrencyCode: overrides.baseCurrencyCode ?? "USD",
    })
    .returning();
  return {
    id: created.id,
    slug: created.slug,
    name: created.name,
    baseCurrencyCode: created.baseCurrencyCode,
  };
}

/**
 * Deletes a test org and (via ON DELETE CASCADE on every org-scoped table's
 * `org_id` FK) everything under it — EXCEPT `audit_log`, which carries an
 * unconditional `BEFORE UPDATE OR DELETE` trigger
 * (`audit_log_no_update_delete`, drizzle/0015_db-closeout.sql) making it
 * genuinely append-only, even for a cascading delete from its parent org.
 * That immutability is exactly what we want in production; for test
 * teardown we transiently disable just that one trigger, on the isolated
 * test database's owner connection only, then re-enable it immediately —
 * the production guard itself is never touched.
 */
export async function cleanupOrg(orgId: string): Promise<void> {
  await dbSystem.execute(
    sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update_delete`,
  );
  try {
    await dbSystem.delete(organization).where(eq(organization.id, orgId));
  } finally {
    await dbSystem.execute(
      sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update_delete`,
    );
  }
}

export async function createTestUser(
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<{ id: string; name: string; email: string }> {
  const id = `test_user_${randomUUID()}`;
  const email = overrides.email ?? `${id}@example.test`;
  const [created] = await dbSystem
    .insert(user)
    .values({
      id,
      name: overrides.name ?? "Test User",
      email,
    })
    .returning();
  return { id: created.id, name: created.name, email: created.email };
}

export async function addMember(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<string> {
  const id = `test_member_${randomUUID()}`;
  await dbSystem.insert(member).values({
    id,
    organizationId: orgId,
    userId,
    role,
  });
  return id;
}

/** Convenience: org + user + membership + a ready-to-use OrgContext. */
export async function createOrgWithMember(
  role: OrgRole = "owner",
  orgOverrides: Partial<{ name: string; baseCurrencyCode: string }> = {},
): Promise<{ org: TestOrg; userId: string; memberId: string; ctx: OrgContext }> {
  const org = await createTestOrg(orgOverrides);
  const testUser = await createTestUser();
  const memberId = await addMember(org.id, testUser.id, role);
  const ctx = makeOrgContext({
    org,
    userId: testUser.id,
    userName: testUser.name,
    userEmail: testUser.email,
    role,
    memberId,
  });
  return { org, userId: testUser.id, memberId, ctx };
}

export function makeOrgContext(params: {
  org: TestOrg;
  userId: string;
  userName: string;
  userEmail: string;
  role: OrgRole;
  memberId: string;
  subscriptionStatus?: SubscriptionStatus;
}): OrgContext {
  return {
    user: { id: params.userId, name: params.userName, email: params.userEmail },
    org: {
      id: params.org.id,
      name: params.org.name,
      slug: params.org.slug,
      logo: null,
      metadata: null,
      baseCurrencyCode: params.org.baseCurrencyCode,
      country: null,
      timezone: "America/Managua",
      createdAt: new Date(),
    },
    role: params.role,
    memberId: params.memberId,
    subscriptionStatus: params.subscriptionStatus ?? "trialing",
  };
}

// ---------------------------------------------------------------------------
// Minimal per-table scaffolding (raw dbSystem inserts — not the code under
// test, just enough of a valid row graph to satisfy FKs/checks).
// ---------------------------------------------------------------------------

export async function insertFarm(orgId: string, name = "Test Farm") {
  const [row] = await dbSystem
    .insert(farms)
    .values({ orgId, name })
    .returning();
  return row;
}

export async function insertParcel(orgId: string, farmId: string, name = "Test Parcel") {
  const [row] = await dbSystem
    .insert(parcels)
    .values({ orgId, farmId, name })
    .returning();
  return row;
}

export async function insertCrop(orgId: string, name = "Test Crop") {
  const [row] = await dbSystem.insert(crops).values({ orgId, name }).returning();
  return row;
}

export async function insertCropCycle(
  orgId: string,
  params: { farmId: string; parcelId: string; cropId: string; name?: string; startDate?: string; plantedAreaHa?: string },
) {
  const [row] = await dbSystem
    .insert(cropCycles)
    .values({
      orgId,
      farmId: params.farmId,
      parcelId: params.parcelId,
      cropId: params.cropId,
      name: params.name ?? "Test Cycle",
      startDate: params.startDate ?? "2026-01-01",
      plantedAreaHa: params.plantedAreaHa,
    })
    .returning();
  return row;
}

export async function insertWorker(orgId: string, name = "Test Worker") {
  const [row] = await dbSystem.insert(workers).values({ orgId, name }).returning();
  return row;
}

export async function insertPieceRate(
  orgId: string,
  params: { name?: string; unit?: string; rate: string; active?: boolean },
) {
  const [row] = await dbSystem
    .insert(pieceRates)
    .values({
      orgId,
      // piece_rates has a unique (org_id, name) constraint — default to a
      // unique name per call so tests creating several rates in the same
      // org (e.g. an active + an inactive one) don't collide.
      name: params.name ?? `Test Rate ${randomUUID()}`,
      unit: params.unit ?? "unidad",
      rate: params.rate,
      active: params.active ?? true,
    })
    .returning();
  return row;
}

export async function insertActivityType(orgId: string, name = "Test Activity Type") {
  const [row] = await dbSystem
    .insert(activityTypes)
    .values({ orgId, name })
    .returning();
  return row;
}

export async function insertWarehouse(orgId: string, name = "Test Warehouse") {
  const [row] = await dbSystem
    .insert(warehouses)
    .values({ orgId, name })
    .returning();
  return row;
}

export async function insertProduct(orgId: string, name = "Test Product") {
  const [row] = await dbSystem.insert(products).values({ orgId, name }).returning();
  return row;
}

export async function insertOrgExchangeRate(
  orgId: string,
  params: { currencyCode: string; rateToBase: string; validDate: string },
) {
  const [row] = await dbSystem
    .insert(orgExchangeRates)
    .values({
      orgId,
      currencyCode: params.currencyCode,
      rateToBase: params.rateToBase,
      validDate: params.validDate,
      source: "manual",
    })
    .returning();
  return row;
}

/**
 * One row in each of the five org-scoped tables the RLS suite checks
 * (sales, piecework_entries, activities, inventory_movements,
 * org_exchange_rates), plus the parent rows needed to satisfy their FKs.
 * Returns every id the RLS test needs to reference.
 */
export async function seedRlsFixtureRows(orgId: string) {
  const worker = await insertWorker(orgId);
  const rate = await insertPieceRate(orgId, { rate: "1.0000" });
  const activityType = await insertActivityType(orgId);
  const warehouse = await insertWarehouse(orgId);
  const product = await insertProduct(orgId);

  const [sale] = await dbSystem
    .insert(sales)
    .values({ orgId, date: "2026-01-01", buyerName: "Test Buyer" })
    .returning();

  const [pieceworkEntry] = await dbSystem
    .insert(pieceworkEntries)
    .values({
      orgId,
      workerId: worker.id,
      pieceRateId: rate.id,
      date: "2026-01-01",
      quantity: "10.0000",
      rateSnapshot: rate.rate,
      amount: "10.0000",
    })
    .returning();

  const [activity] = await dbSystem
    .insert(activities)
    .values({ orgId, activityTypeId: activityType.id, date: "2026-01-01" })
    .returning();

  const [inventoryMovement] = await dbSystem
    .insert(inventoryMovements)
    .values({
      orgId,
      warehouseId: warehouse.id,
      productId: product.id,
      date: "2026-01-01",
      type: "adjustment_in",
      quantity: "5.0000",
    })
    .returning();

  const exchangeRate = await insertOrgExchangeRate(orgId, {
    currencyCode: "NIO",
    rateToBase: "0.03000000",
    validDate: "2026-01-01",
  });

  return {
    worker,
    rate,
    activityType,
    warehouse,
    product,
    sale,
    pieceworkEntry,
    activity,
    inventoryMovement,
    exchangeRate,
  };
}

// ---------------------------------------------------------------------------
// Billing fixtures (stripe-webhook.test.ts)
// ---------------------------------------------------------------------------

/** Global catalog, not org-scoped — seeded once per test run (idempotent). */
export async function ensurePlansCatalog(): Promise<void> {
  await dbSystem
    .insert(plans)
    .values(
      PLAN_DEFINITIONS.map((def) => ({
        id: def.id,
        name: def.name,
        monthlyPriceUsd: def.monthlyPriceUsd,
        limits: def.limits,
      })),
    )
    .onConflictDoNothing({ target: plans.id });
}

export async function insertOrgSubscription(
  orgId: string,
  params: {
    planId: string;
    status?: SubscriptionStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    lastStripeEventAt?: Date | null;
  },
) {
  const [row] = await dbSystem
    .insert(orgSubscriptions)
    .values({
      orgId,
      planId: params.planId,
      status: params.status ?? "trialing",
      stripeCustomerId: params.stripeCustomerId ?? null,
      stripeSubscriptionId: params.stripeSubscriptionId ?? null,
      lastStripeEventAt: params.lastStripeEventAt ?? null,
    })
    .returning();
  return row;
}

export async function getOrgSubscriptionRow(orgId: string) {
  const [row] = await dbSystem
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.orgId, orgId));
  return row;
}

export async function countStripeEventRows(eventId: string): Promise<number> {
  const rows = await dbSystem
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.id, eventId));
  return rows.length;
}

export async function cleanupStripeEvent(eventId: string): Promise<void> {
  await dbSystem.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
}
