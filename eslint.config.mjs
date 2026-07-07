import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist-generated service worker output (built from src/app/sw.ts via
    // next.config.ts swDest) — not source, must not be linted.
    "public/sw.js",
    "public/sw.js.map",
    // Vendored design-doc support assets (support.js etc.) — not app source.
    "docs/design/**",
  ]),
]);

export default eslintConfig;
