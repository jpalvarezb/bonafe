import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.APP_DATABASE_URL) {
  // APP_DATABASE_URL should always be set — falling back to the owner
  // connection means every request bypasses RLS, silently masking any
  // missing-withOrgRls bug until it hits an environment where RLS is live.
  console.warn(
    "[db] APP_DATABASE_URL is not set; falling back to DATABASE_URL " +
      "(the RLS-bypassing owner connection). Run `pnpm db:set-app-password` " +
      "and set APP_DATABASE_URL so RLS is exercised. Never deploy this way.",
  );
}

const appPool = new Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
});

/**
 * Request-scoped connection, bound to the agropeq_app role (see
 * drizzle/0017_app-role.sql). Row-level security policies (drizzle/0018)
 * apply to every query on this connection — queries against RLS'd tables
 * MUST run inside withOrgRls (src/lib/db/rls.ts) so app.org_id is set,
 * otherwise RLS fails closed (zero rows, or an insert/update rejection).
 */
export const db = drizzle(appPool, { schema });

const systemPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * OWNER connection — bypasses row-level security entirely (NOBYPASSRLS is
 * for agropeq_app, not this role). Use ONLY for the documented system
 * paths where no org is known yet or the operation is intentionally
 * cross-org/unattended:
 *   - src/lib/tenancy.ts (requireOrgContext/resolveOrgContext/listUserOrgs):
 *     resolving which org a session belongs to, before any org is known.
 *   - src/app/api/webhooks/stripe/route.ts: server-to-server, org resolved
 *     from Stripe identifiers, no request-scoped org context exists.
 *   - src/scripts/seed.ts, src/scripts/ingest-climate.ts: unattended jobs
 *     that intentionally span every org.
 *   - src/scripts/set-app-password.ts, src/scripts/verify-rls.ts: DB
 *     administration, not application data access.
 * Do NOT reach for this to "make a query work" — that almost always means
 * withOrgRls was set up wrong.
 */
export const dbSystem = drizzle(systemPool, { schema });
