import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// S65 smoke tests: pages rendered in jsdom with the API stubbed (test/smoke/api.ts).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["test/smoke/**/*.test.tsx"],
    setupFiles: ["test/smoke/setup.ts"],
    env: { NEXT_PUBLIC_BACKEND_URL: "http://api.test" },
  },
});
