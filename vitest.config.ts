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
});
