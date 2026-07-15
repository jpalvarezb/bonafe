import { loadDevEnv } from "./env";

// Runs before each integration test FILE's own imports. `vitest.integration
// .config.ts`'s `test.env` has already forced DATABASE_URL/APP_DATABASE_URL
// to the isolated test database by the time this runs; loadDevEnv() only
// fills in the REST of .env (STRIPE_WEBHOOK_SECRET, BETTER_AUTH_SECRET, …)
// and — same as Node's `process.loadEnvFile`/dotenv — never overwrites a
// key that's already set, so the DB overrides are never clobbered here.
loadDevEnv();
