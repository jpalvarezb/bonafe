/**
 * Postgres driver errors (via `pg`/node-postgres, which this app uses in
 * src/lib/db/index.ts) carry the SQLSTATE code — and, for constraint
 * violations, the constraint name — directly on the thrown error object,
 * not nested under `.cause`. These helpers let service code distinguish a
 * specific DB-level guard (a unique index, an EXCLUDE constraint) from any
 * other failure so callers can map just that case to a translated message.
 */
type PgDriverError = { code?: string; constraint?: string };

function asPgError(error: unknown): PgDriverError | null {
  if (error && typeof error === "object" && "code" in error) {
    return error as PgDriverError;
  }
  return null;
}

/** SQLSTATE 23505 — unique_violation. Pass `constraint` to scope the check
 *  to one specific unique index/constraint name. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = asPgError(error);
  if (!pg || pg.code !== "23505") return false;
  return constraint ? pg.constraint === constraint : true;
}

/** SQLSTATE 23P01 — exclusion_violation. Pass `constraint` to scope the
 *  check to one specific EXCLUDE constraint name. */
export function isExclusionViolation(error: unknown, constraint?: string): boolean {
  const pg = asPgError(error);
  if (!pg || pg.code !== "23P01") return false;
  return constraint ? pg.constraint === constraint : true;
}
