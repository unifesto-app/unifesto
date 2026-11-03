import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// S65 smoke tests: pages rendered in jsdom with the API stubbed (test/smoke/api.ts).
// The node:test unit tests (src/**/*.test.ts) stay on `npm test`.
export default defineConfig({
  plugins: [
    {
      // next/image wants static imports as { src, width, height }, as Next's bundler makes them.
      name: "next-static-image",
      enforce: "pre",
      load: (id) =>
        /\.(svg|png|jpe?g|gif|webp|avif)(\?.*)?$/.test(id)
          ? `export default { src: ${JSON.stringify(id)}, width: 100, height: 100 };`
          : undefined,
    },
  ],
  resolve:{ alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["test/smoke/**/*.test.tsx"],
    setupFiles: ["test/smoke/setup.ts"],
    env: { NEXT_PUBLIC_API_URL: "http://api.test", NEXT_PUBLIC_BACKEND_URL: "http://api.test" },
  },
});
