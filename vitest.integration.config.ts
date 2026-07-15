import path from "node:path";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrls } from "./tests/integration/support/env";

// Separate Vitest project from vitest.config.ts on purpose: `pnpm test`
// (vitest.config.ts) stays DB-free and fast; this config is the only one
// that talks to Postgres, run via `pnpm test:integration`. See README >
// Testing for how the isolated `<db>_test` database is created/migrated.
const { ownerTestUrl, appTestUrl } = resolveTestDatabaseUrls();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/support/global-setup.ts"],
    setupFiles: ["./tests/integration/support/setup-file.ts"],
    // Sequential files: several suites share cluster-global (non-org-scoped)
    // tables — `stripe_events`, `plans` — and all of them hit the same
    // Postgres instance; keeping this off trades a bit of wall-clock time
    // for deterministic, easy-to-reproduce failures.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      // Force EVERY module under src/lib/db (and anything importing it) to
      // bind to the isolated test database for the lifetime of each test
      // file's module graph — this is what keeps the suite from ever
      // touching the dev database/seed.
      DATABASE_URL: ownerTestUrl,
      APP_DATABASE_URL: appTestUrl,
    },
  },
});
