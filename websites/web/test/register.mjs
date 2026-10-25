// `node --test` runs the .ts sources directly (Node 22 strips types). This
// resolve hook adds what the bundler normally does: the `@/` alias (tsconfig
// paths) and extensionless imports.
import { registerHooks } from "node:module";

const src = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), src).href;
    try {
      return next(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || /\.[cm]?[jt]sx?$/.test(specifier)) throw err;
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try {
          return next(specifier + ext, context);
        } catch {}
      }
      throw err;
    }
  },
});
