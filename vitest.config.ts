import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" -> "./src/*" path alias from tsconfig.json so unit tests
// can import server modules (services/actions) that use "@/..." imports,
// not just plain calc helpers under src/lib/calc.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Pure/unit only — DB-free and fast. The DB-backed integration suite
    // (tests/integration/) has its own project (vitest.integration.config.ts,
    // run via `pnpm test:integration`) so it never gets picked up here by
    // Vitest's default (much broader) test-file glob.
    include: ["tests/unit/**/*.test.ts"],
  },
});
