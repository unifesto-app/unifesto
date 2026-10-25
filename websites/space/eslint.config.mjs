import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Fetch-on-mount effects that set loading/data state are the house pattern
  // (~180 hits across the sites): a warning, not a rewrite of every page.
  // Date.now() in render drives "live"/"past" labels; stale until the next render is fine.
  { rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/purity": "warn" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
