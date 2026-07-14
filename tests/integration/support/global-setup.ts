import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolveTestDatabaseUrls } from "./env";

/**
 * Vitest `globalSetup`: runs ONCE for the whole `test:integration` run,
 * before any test file/worker starts. Ensures the isolated `<db>_test`
 * database exists and is migrated to the current schema — reusing the
 * real Drizzle migrations (drizzle/*.sql), including 0017 (agropeq_app
 * role + grants) and 0018 (RLS policies), so the test database has
 * EXACTLY the same RLS posture as production, not a hand-rolled subset.
 *
 * Idempotent and additive: never drops the test database, never touches
 * the dev database beyond the one CREATE DATABASE IF NOT EXISTS check.
 * Per-test isolation is handled by the test files themselves (fresh org
 * ids + cascade cleanup — see support/fixtures.ts), not by resetting this
 * database on every run.
 */
export default async function globalSetup() {
  const { adminUrl, ownerTestUrl } = resolveTestDatabaseUrls();
  const dbName = new URL(ownerTestUrl).pathname.replace(/^\//, "");

  const admin = new Pool({ connectionString: adminUrl });
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (rowCount === 0) {
      // Database identifiers can't be parameterized; dbName is derived
      // entirely from our own DATABASE_URL/TEST_DATABASE_URL, never from
      // request/user input.
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[test:integration] created database "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  const ownerTestPool = new Pool({ connectionString: ownerTestUrl });
  try {
    await migrate(drizzle(ownerTestPool), {
      migrationsFolder: path.resolve(__dirname, "../../../drizzle"),
    });
    console.log(`[test:integration] migrated "${dbName}"`);
  } finally {
    await ownerTestPool.end();
  }
}
