/**
 * Coverage guard: every table with an org_id column must have row-level
 * security enabled AND at least one policy defined. Run after any migration
 * that adds an org-scoped table (see README > Deployment notes).
 *
 * Connects with the OWNER connection (DATABASE_URL) — information_schema /
 * pg_catalog introspection, not application data access, and agropeq_app
 * may not even exist yet on a brand-new DB.
 *
 * Run with: pnpm db:verify-rls
 */
import { Pool } from "pg";

type Row = {
  table_name: string;
  relrowsecurity: boolean;
  policy_count: number;
  suspect_policy_count: number;
};

async function main() {
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = new Pool({ connectionString: ownerUrl });
  try {
    const { rows } = await pool.query<Row>(`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity,
        COALESCE(p.policy_count, 0)::int AS policy_count,
        COALESCE(p.suspect_policy_count, 0)::int AS suspect_policy_count
      FROM information_schema.columns col
      JOIN pg_class c
        ON c.relname = col.table_name
        AND c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
      LEFT JOIN (
        SELECT
          tablename,
          count(*) AS policy_count,
          -- A policy is suspect if it isn't scoped to the app role, or has
          -- neither a USING qual nor a WITH CHECK — coverage in name only.
          count(*) FILTER (
            WHERE roles <> '{agropeq_app}'::name[]
              OR (qual IS NULL AND with_check IS NULL)
          ) AS suspect_policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        GROUP BY tablename
      ) p ON p.tablename = c.relname
      WHERE col.table_schema = 'public'
        AND col.column_name = 'org_id'
      ORDER BY c.relname;
    `);

    if (rows.length === 0) {
      throw new Error(
        "No tables with an org_id column found — this looks wrong; refusing to report success.",
      );
    }

    const uncovered = rows.filter(
      (r) =>
        !r.relrowsecurity ||
        r.policy_count === 0 ||
        r.suspect_policy_count > 0,
    );

    console.log(`Checked ${rows.length} table(s) with an org_id column.\n`);
    for (const r of rows) {
      const status =
        r.relrowsecurity && r.policy_count > 0 && r.suspect_policy_count === 0
          ? `ok (${r.policy_count} polic${r.policy_count === 1 ? "y" : "ies"})`
          : r.suspect_policy_count > 0
            ? "SUSPECT POLICY (wrong role or no qual/with_check)"
            : "MISSING RLS COVERAGE";
      console.log(
        `  ${r.table_name.padEnd(32)} rls=${r.relrowsecurity ? "on " : "off"}  ${status}`,
      );
    }

    if (uncovered.length > 0) {
      console.error(
        `\n${uncovered.length} table(s) have an org_id column but lack full RLS coverage:`,
      );
      for (const r of uncovered) {
        console.error(
          `  - ${r.table_name} (rowsecurity=${r.relrowsecurity}, policies=${r.policy_count}, suspect=${r.suspect_policy_count})`,
        );
      }
      process.exit(1);
    }

    console.log("\nAll org-scoped tables have RLS enabled and policies.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
