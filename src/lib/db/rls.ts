import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import { db } from "./index";
import type * as schema from "./schema";

/** The transaction type every RLS-scoped service function should accept. */
export type Tx = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Runs `fn` inside a single transaction on the RLS-bound `db` connection
 * with `app.org_id` set for the lifetime of the transaction (`set_config`'s
 * third argument `true` makes it local to the transaction, so it can never
 * leak across pooled connections/requests).
 *
 * Every query against an RLS'd table MUST happen inside this — see
 * src/lib/db/index.ts for which tables that is, and README > Deployment
 * notes for the fail-closed behavior when app.org_id is unset.
 *
 * One logical operation = one withOrgRls call. Do not nest calls — if a
 * wrapped function needs to call another service that also wraps its body,
 * refactor so only the outermost caller opens the transaction (pass `tx`
 * down, or extract a `...InTx(tx, ...)` inner function).
 */
export async function withOrgRls<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
