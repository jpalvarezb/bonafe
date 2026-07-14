import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Only resolveOrgContext is mocked (to a real, DB-backed OrgContext) — the
// route, the piecework service, RLS, and classifyRejection are all real.
// Fully replacing the module (no importOriginal) so `@/lib/tenancy`'s real
// top-level imports (better-auth, next/headers) never execute here — the
// route only ever imports `resolveOrgContext` from this module.
vi.mock("@/lib/tenancy", () => ({ resolveOrgContext: vi.fn() }));

import { resolveOrgContext } from "@/lib/tenancy";
import { POST } from "@/app/api/sync/route";
import { withOrgRls } from "@/lib/db/rls";
import { pieceworkEntries } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import {
  cleanupOrg,
  createOrgWithMember,
  insertPieceRate,
  insertWorker,
  type TestOrg,
} from "./support/fixtures";

function syncRequest(orgSlug: string, item: Record<string, unknown>): Request {
  return new Request("http://localhost/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orgSlug, items: [item] }),
  });
}

function pieceworkItem(payload: Record<string, unknown>) {
  return {
    outboxId: randomUUID(),
    kind: "piecework.create",
    clientCreatedAt: "2026-06-20T12:00:00.000Z",
    payload,
  };
}

/**
 * Integration coverage for the route + service + RLS + classifyRejection
 * composition behind /api/sync's piecework.create path — zero coverage of
 * this composition existed before this suite. Goes red if
 * onConflictDoNothing idempotency is removed, rejection classification
 * drifts, or amount computation ever starts trusting client input.
 */
describe("POST /api/sync — piecework.create", () => {
  let orgA: TestOrg;
  let ctxA: OrgContext;
  let orgB: TestOrg;

  beforeAll(async () => {
    const setupA = await createOrgWithMember("owner");
    orgA = setupA.org;
    ctxA = setupA.ctx;
    const setupB = await createOrgWithMember("owner");
    orgB = setupB.org;
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  beforeEach(() => {
    vi.mocked(resolveOrgContext).mockReset();
    vi.mocked(resolveOrgContext).mockResolvedValue(ctxA);
  });

  it("is idempotent by client UUID: replaying the same row id yields exactly one row", async () => {
    const worker = await insertWorker(orgA.id);
    const rate = await insertPieceRate(orgA.id, { rate: "1.1000", active: true });
    const rowId = randomUUID();
    const item = pieceworkItem({
      id: rowId,
      workerId: worker.id,
      pieceRateId: rate.id,
      date: "2026-06-20",
      quantity: "75.0000",
    });

    const first = await POST(syncRequest(orgA.slug, item));
    const firstBody = (await first.json()) as {
      results: { status: string }[];
    };
    expect(firstBody.results[0].status).toBe("applied");

    const second = await POST(syncRequest(orgA.slug, item));
    const secondBody = (await second.json()) as {
      results: { status: string }[];
    };
    // Live finding: SyncItemResult (src/lib/offline/schemas.ts) declares a
    // 'duplicate' status for exactly this replay case, but the route
    // (src/app/api/sync/route.ts) always pushes 'applied', even on the
    // ON CONFLICT DO NOTHING no-op path — a replay is indistinguishable
    // from a first application from the client's point of view. The DB-level
    // exactly-once guarantee below is intact; this only documents that the
    // richer client-facing signal the type promises is never emitted.
    expect(secondBody.results[0].status).toBe("applied");

    const rows = await withOrgRls(orgA.id, (tx) =>
      tx.select().from(pieceworkEntries).where(eq(pieceworkEntries.id, rowId)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe("75.0000");
    expect(rows[0].amount).toBe("82.5000"); // 75 x 1.10
  });

  it("rejects a cross-org workerId with reasonCode 'not_found'", async () => {
    const crossOrgWorker = await insertWorker(orgB.id);
    const rate = await insertPieceRate(orgA.id, { rate: "1.0000", active: true });
    const item = pieceworkItem({
      id: randomUUID(),
      workerId: crossOrgWorker.id,
      pieceRateId: rate.id,
      date: "2026-06-20",
      quantity: "10.0000",
    });

    const res = await POST(syncRequest(orgA.slug, item));
    const body = (await res.json()) as {
      results: { status: string; reasonCode?: string }[];
    };
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reasonCode).toBe("not_found");
  });

  it("rejects an inactive piece rate with reasonCode 'inactive'", async () => {
    const worker = await insertWorker(orgA.id);
    const inactiveRate = await insertPieceRate(orgA.id, {
      rate: "1.0000",
      active: false,
    });
    const item = pieceworkItem({
      id: randomUUID(),
      workerId: worker.id,
      pieceRateId: inactiveRate.id,
      date: "2026-06-20",
      quantity: "10.0000",
    });

    const res = await POST(syncRequest(orgA.slug, item));
    const body = (await res.json()) as {
      results: { status: string; reasonCode?: string }[];
    };
    expect(body.results[0].status).toBe("rejected");
    expect(body.results[0].reasonCode).toBe("inactive");
  });

  it("computes amount server-side from quantity x rate — a smuggled client 'amount' is inert", async () => {
    const worker = await insertWorker(orgA.id);
    const rate = await insertPieceRate(orgA.id, { rate: "1.1000", active: true });
    const rowId = randomUUID();
    const item = pieceworkItem({
      id: rowId,
      workerId: worker.id,
      pieceRateId: rate.id,
      date: "2026-06-20",
      quantity: "75.0000",
      // Not part of pieceworkEntryCreatePayload's schema — a hostile/buggy
      // client trying to dictate its own amount.
      amount: "999999.9999",
    });

    const res = await POST(syncRequest(orgA.slug, item));
    const body = (await res.json()) as { results: { status: string }[] };
    expect(body.results[0].status).toBe("applied");

    const rows = await withOrgRls(orgA.id, (tx) =>
      tx.select().from(pieceworkEntries).where(eq(pieceworkEntries.id, rowId)),
    );
    expect(rows[0].amount).toBe("82.5000");
  });
});
