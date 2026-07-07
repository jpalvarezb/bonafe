/**
 * Sets (or rotates) the password of the agropeq_app role — the RLS-bound
 * connection role the app uses for request-scoped queries (see
 * src/lib/db/index.ts, drizzle/0017_app-role.sql).
 *
 * Connects with the OWNER connection (DATABASE_URL) — only the owner role
 * can ALTER ROLE. Never uses `db`/`dbSystem` from src/lib/db, since this
 * must run before APP_DATABASE_URL necessarily works (first-time setup) and
 * must run as a role with the privilege to alter other roles.
 *
 * ALTER ROLE ... WITH PASSWORD does not support bind parameters (it's DDL,
 * not DML), so the password can't go through pg's parameterized query path.
 * Instead of interpolating it directly, we validate it against an allowlist
 * pattern first (rejecting quotes, backslashes, semicolons, whitespace —
 * anything that could break out of the literal) and load it through
 * `format('%L', ...)`, which is the same escaping Postgres itself uses for
 * safely quoting a literal, run server-side via a parameterized SELECT.
 *
 * Run with: pnpm db:set-app-password
 */
import { Pool } from "pg";

const APP_ROLE = "agropeq_app";
const PASSWORD_PATTERN = /^[A-Za-z0-9_-]{8,}$/;

async function main() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    throw new Error(
      "APP_DB_PASSWORD is not set. Add it to .env (see .env.example).",
    );
  }
  if (!PASSWORD_PATTERN.test(password)) {
    throw new Error(
      "APP_DB_PASSWORD must match /^[A-Za-z0-9_-]{8,}$/ (letters, digits, " +
        "underscore, hyphen, 8+ chars) — this keeps it safe to splice into " +
        "DDL that cannot take a bind parameter.",
    );
  }

  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = new Pool({ connectionString: ownerUrl });
  try {
    // format('%L', $1) asks Postgres to literal-quote the password the same
    // way it would quote any other string literal, so the identifier we
    // splice into the ALTER ROLE statement is exactly what Postgres itself
    // considers a safely-escaped literal — belt-and-suspenders on top of
    // the allowlist check above.
    const { rows } = await pool.query<{ literal: string }>(
      "SELECT format('%L', $1::text) AS literal",
      [password],
    );
    const quotedPassword = rows[0]?.literal;
    if (!quotedPassword) {
      throw new Error("Failed to quote password literal.");
    }

    await pool.query(
      `ALTER ROLE ${APP_ROLE} WITH PASSWORD ${quotedPassword}`,
    );
    console.log(`Password set for role ${APP_ROLE}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
