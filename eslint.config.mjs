import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".venv/**",
    "coverage/**",
    "var/**",
    "playwright-report/**",
    "test-results/**",
    "node_modules/**",
    "catalog/skill-bodies/**",
  ]),
]);
