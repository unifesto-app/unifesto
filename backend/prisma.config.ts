// Prisma configuration for AWS RDS PostgreSQL
// Using compatibility mode for url/directUrl in schema.prisma
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same env order as src/env.ts: a laptop's .env.local wins over .env.
config({ path: [".env.local", ".env"], quiet: true });

// J14: every prisma CLI command (migrate, studio, seed, reset) refuses the prod
// RDS database unless NODE_ENV=production (the runner image sets it). Inline
// copy of src/common/prod-db-guard.ts: the runtime image ships no src/.
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  if (process.env.NODE_ENV !== "production" && /\.rds\.amazonaws\.com\b/i.test(process.env[key] ?? "")) {
    throw new Error(
      `${key} points at an RDS host but NODE_ENV is "${process.env.NODE_ENV ?? ""}": refusing to run prisma against production. ` +
        "Deliberate prod access: prefix the command with NODE_ENV=production.",
    );
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
