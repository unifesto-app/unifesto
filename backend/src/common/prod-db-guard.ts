// J14: a laptop .env pointing at RDS ran prod crons and writes from local dev.
// Outside NODE_ENV=production (the runner image sets it), an RDS host is refused.
// prisma.config.ts carries the same check inline (the runtime image has no src/).
export const RDS_HOST = /\.rds\.amazonaws\.com\b/i;

export function assertNoProdDbOutsideProd(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') return;
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    if (RDS_HOST.test(env[key] ?? '')) {
      throw new Error(
        `${key} points at an RDS host but NODE_ENV is "${env.NODE_ENV ?? ''}". ` +
          'Refusing to start against the production database: use backend/.env.development.example ' +
          '+ docker-compose.dev.yml locally.',
      );
    }
  }
}
