/**
 * Daily per-org digest, emailed to owners/admins: subscription health (only
 * when past_due/canceled), products under their minStock threshold, and
 * monitoring records with a high-severity band from the last 24h.
 *
 * No OrgContext exists in a script (no session, no requireOrgContext), so
 * this cannot call the assertCan-gated services the screens use. Instead it
 * reads straight from dbSystem (owner connection, bypasses RLS) — the same
 * bypass src/scripts/ingest-climate.ts uses, safe here for the same reason:
 * a trusted, unattended job with no untrusted user input. Every query below
 * carries an explicit org_id filter so a cross-org email can never happen.
 *
 * Run with: pnpm digest:send
 */
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { dbSystem } from "../lib/db";
import {
  inventoryMovements,
  member,
  monitoringRecords,
  organization,
  orgSubscriptions,
  parcels,
  products,
  user,
} from "../lib/db/schema";
import { computeStock, type MovementLine } from "../lib/calc/inventory";
import {
  assembleDigestSections,
  renderDigestEmail,
  shouldSendDigest,
  type LowStockProduct,
  type MonitoringAlert,
  type SubscriptionStatus,
} from "../lib/email/digest";
import { getEmailAdapter } from "../lib/email";

type OrgRow = { id: string; name: string };

async function listOrgs(): Promise<OrgRow[]> {
  return dbSystem
    .select({ id: organization.id, name: organization.name })
    .from(organization);
}

async function subscriptionStatusFor(orgId: string): Promise<SubscriptionStatus> {
  const [row] = await dbSystem
    .select({ status: orgSubscriptions.status })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.orgId, orgId))
    .limit(1);
  // No row yet (org bootstrapped without a subscription row) reads the same
  // as the schema default: trialing — nothing to warn an owner about.
  return (row?.status as SubscriptionStatus | undefined) ?? "trialing";
}

/**
 * Per-product stock across every warehouse in the org, folded through the
 * same weighted-average ledger math the inventory screen uses
 * (src/lib/calc/inventory.ts computeStock), joined to products.minStock.
 */
async function lowStockCandidatesFor(orgId: string): Promise<LowStockProduct[]> {
  const rows = await dbSystem
    .select({
      productId: inventoryMovements.productId,
      name: products.name,
      minStock: products.minStock,
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(inventoryMovements.productId, products.id))
    .where(eq(inventoryMovements.orgId, orgId))
    .orderBy(asc(inventoryMovements.date), asc(inventoryMovements.createdAt));

  const groups = new Map<
    string,
    { name: string; minStock: string | null; movements: MovementLine[] }
  >();
  for (const row of rows) {
    const group = groups.get(row.productId);
    const movement: MovementLine = { quantity: row.quantity, unitCost: row.unitCost };
    if (group) {
      group.movements.push(movement);
    } else {
      groups.set(row.productId, {
        name: row.name,
        minStock: row.minStock,
        movements: [movement],
      });
    }
  }

  const candidates: LowStockProduct[] = [];
  for (const [productId, group] of groups) {
    const stock = computeStock(group.movements);
    candidates.push({
      productId,
      name: group.name,
      quantity: stock.quantity,
      minStock: group.minStock,
    });
  }
  return candidates;
}

/** Severity banding itself is applied later by filterHighSeverityAlerts
 * (src/lib/email/digest.ts) — this only narrows to the last 24h by org. */
async function recentAlertsFor(orgId: string): Promise<MonitoringAlert[]> {
  const rows = await dbSystem
    .select({
      id: monitoringRecords.id,
      severity: monitoringRecords.severity,
      agentName: monitoringRecords.agentName,
      parcelName: parcels.name,
    })
    .from(monitoringRecords)
    .innerJoin(parcels, eq(monitoringRecords.parcelId, parcels.id))
    .where(
      and(
        eq(monitoringRecords.orgId, orgId),
        gte(monitoringRecords.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    severity: row.severity,
    title: `${row.agentName} · ${row.parcelName}`,
  }));
}

type Recipient = { email: string; locale: string };

/** Owner/admin members joined to their user row for email + locale — no
 * existing helper does this join across the whole org, so it's written here. */
async function recipientsFor(orgId: string): Promise<Recipient[]> {
  return dbSystem
    .select({ email: user.email, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(
      and(
        eq(member.organizationId, orgId),
        inArray(member.role, ["owner", "admin"]),
      ),
    );
}

async function main() {
  const orgs = await listOrgs();
  console.log(`digest:send — ${orgs.length} org(s)`);

  const adapter = getEmailAdapter();
  let ok = 0;
  let failed = 0;

  // Sequential per-org, same pattern as climate:ingest — this is a low-
  // volume nightly job, not a hot path, so simplicity wins over concurrency.
  for (const org of orgs) {
    try {
      const [subscriptionStatus, lowStockProducts, monitoringAlerts] =
        await Promise.all([
          subscriptionStatusFor(org.id),
          lowStockCandidatesFor(org.id),
          recentAlertsFor(org.id),
        ]);

      const sections = assembleDigestSections({
        orgName: org.name,
        subscriptionStatus,
        lowStockProducts,
        monitoringAlerts,
      });

      if (!shouldSendDigest(sections)) {
        console.log(`  skip  org=${org.id} (nothing to report)`);
        ok++;
        continue;
      }

      const recipients = await recipientsFor(org.id);
      for (const recipient of recipients) {
        const email = renderDigestEmail(
          { orgName: org.name, sections },
          recipient.locale || "es",
        );
        await adapter.send({
          to: recipient.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
      console.log(`  ok    org=${org.id} recipients=${recipients.length}`);
      ok++;
    } catch (error) {
      console.error(
        `  fail  org=${org.id}:`,
        error instanceof Error ? error.message : error,
      );
      failed++;
    }
  }

  console.log(`digest:send done — ok=${ok} failed=${failed}`);
  // Total failure must be visible to cron/health monitors via the exit code.
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
