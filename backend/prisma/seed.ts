// Load env the same tolerant way prisma.config.ts does, so the compiled seed
// (`node dist/prisma/seed.js`) sees DATABASE_URL in the container, where compose
// only *mounts* /app/.env rather than injecting env vars.
import 'dotenv/config';
import { PrismaClient, RoleCode, RoleScope } from '@prisma/client';
import { CAPABILITIES } from '../src/auth/authorization/capabilities';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Roles
  console.log('Creating default roles...');

  const roles = [
    {
      code: RoleCode.ADMIN,
      name: 'Platform Administrator',
      scope: RoleScope.PLATFORM,
    },
    {
      code: RoleCode.MEMBER,
      name: 'Member',
      scope: RoleScope.SPACE,
    },
    {
      code: RoleCode.JUDGE,
      name: 'Judge',
      scope: RoleScope.EVENT,
    },
    // --- Spaces platform re-architecture (2026-08) ---
    {
      code: RoleCode.SPACE_ADMIN,
      name: 'Space Admin',
      scope: RoleScope.SPACE,
    },
    {
      code: RoleCode.CURATOR,
      name: 'Curator',
      scope: RoleScope.EVENT,
    },
    {
      code: RoleCode.CO_CURATOR,
      name: 'Co-Curator',
      scope: RoleScope.EVENT,
    },
    {
      code: RoleCode.CREW,
      name: 'Crew',
      scope: RoleScope.EVENT,
    },
  ];

  for (const role of roles) {
    const created = await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
    console.log(`✓ Created role: ${created.name} (${created.code})`);
  }

  // Seed the capability matrix from the compiled defaults (single source of
  // truth: backend/src/auth/authorization/capabilities.ts). Idempotent, so it is
  // safe to re-run and only fills gaps — Platform-Admin edits made via the IAM
  // console are never overwritten. ADMIN is deliberately absent: its power is an
  // inheritance rule, not a matrix grant.
  console.log('Seeding capability matrix...');
  let grantCount = 0;
  for (const [code, actions] of Object.entries(CAPABILITIES)) {
    for (const action of actions ?? []) {
      await prisma.roleCapability.upsert({
        where: { code_action: { code: code as RoleCode, action } },
        update: {},
        create: { code: code as RoleCode, action },
      });
      grantCount += 1;
    }
  }
  console.log(`✓ Seeded ${grantCount} capability grants`);

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
