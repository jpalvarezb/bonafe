-- Application role for row-level security.
--
-- agropeq_app is the connection role the Next.js app uses for
-- request-scoped queries (see src/lib/db/index.ts). It has NOBYPASSRLS
-- (the Postgres default for non-superuser roles, spelled out here so the
-- intent survives a re-run) so every policy declared in 0018 actually
-- applies to it. The migration/seed/webhook/cron owner connection
-- (DATABASE_URL, "dbSystem") keeps using the original superuser/owner role
-- and bypasses RLS entirely — see src/lib/db/index.ts and README.
--
-- Idempotent: safe to re-run against a DB that already has the role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agropeq_app') THEN
    CREATE ROLE agropeq_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint

-- Password is set out-of-band by src/scripts/set-app-password.ts (from the
-- APP_DB_PASSWORD env var) — never committed to a migration file.

GRANT USAGE ON SCHEMA public TO agropeq_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agropeq_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agropeq_app;
--> statement-breakpoint

-- Cover tables/sequences created by future migrations, provided they are
-- run by the same role that runs this migration (see README caveat: ALTER
-- DEFAULT PRIVILEGES is granted-by-role, not schema-wide — if the migration
-- runner role ever changes, re-run these two statements as the new role).
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agropeq_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agropeq_app;
