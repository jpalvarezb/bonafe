import fs from "node:fs";
import path from "node:path";

/**
 * Isolated integration-test database resolution.
 *
 * The integration suite must NEVER touch the developer's dev database (the
 * one `pnpm dev` / `pnpm db:seed` write to) — it runs against a dedicated
 * `<dbname>_test` database on the SAME Postgres instance (docker-compose's
 * :5433), created + migrated on demand (see global-setup.ts).
 *
 * `readEnvFileValue` reads straight out of the `.env` FILE on disk rather
 * than `process.env`, so this module is safe to call more than once in the
 * same process (e.g. once from vitest.integration.config.ts to compute the
 * `test.env` overrides, again from global-setup.ts, again from a test file)
 * without ever re-deriving from an already-overridden `DATABASE_URL` and
 * producing "..._test_test".
 */

const ENV_PATH = path.resolve(__dirname, "../../../.env");

/** Best-effort: loads every var in `.env` into process.env for THIS
 * process (without overwriting anything already set — same semantics as
 * Node's `process.loadEnvFile`/dotenv), so STRIPE_WEBHOOK_SECRET,
 * BETTER_AUTH_SECRET, etc. are available to whichever process calls it. */
export function loadDevEnv(): void {
  try {
    process.loadEnvFile(ENV_PATH);
  } catch {
    // .env is optional — CI may inject env vars directly instead.
  }
}

function readEnvFileValue(key: string): string | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    return undefined;
  }
  const line = contents
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${key}=`) && !l.startsWith("#"));
  return line?.slice(key.length + 1).trim();
}

function requiredBaseUrl(key: string): string {
  const value = readEnvFileValue(key) ?? process.env[key];
  if (!value) {
    throw new Error(
      `${key} is not set (checked .env and process.env) — see .env.example. ` +
        `Integration tests need it to derive the isolated test database URL.`,
    );
  }
  return value;
}

/** `postgres://user:pass@host:port/dbname` -> same URL with `dbname_test`. */
function withTestDbName(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (!name) {
    throw new Error(`cannot derive a test db name from connection URL: ${url}`);
  }
  parsed.pathname = `/${name}_test`;
  return parsed.toString();
}

export type TestDatabaseUrls = {
  /** Connects to the DEV database — used ONLY to run `CREATE DATABASE`
   * for the test database (you cannot create a database while connected
   * to the one you're creating). Never used for reads/writes. */
  adminUrl: string;
  /** Owner (bypasses-RLS) connection to the isolated test database —
   * mirrors `DATABASE_URL`/`dbSystem` in `src/lib/db/index.ts`. */
  ownerTestUrl: string;
  /** RLS-bound `agropeq_app` connection to the isolated test database —
   * mirrors `APP_DATABASE_URL`/`db`. Same role + password as dev (role
   * passwords are cluster-wide, not per-database), different dbname. */
  appTestUrl: string;
};

export function resolveTestDatabaseUrls(): TestDatabaseUrls {
  loadDevEnv();
  const ownerTestUrl =
    process.env.TEST_DATABASE_URL ?? withTestDbName(requiredBaseUrl("DATABASE_URL"));
  const appTestUrl =
    process.env.TEST_APP_DATABASE_URL ??
    withTestDbName(requiredBaseUrl("APP_DATABASE_URL"));

  return {
    adminUrl: requiredBaseUrl("DATABASE_URL"),
    ownerTestUrl,
    appTestUrl,
  };
}
