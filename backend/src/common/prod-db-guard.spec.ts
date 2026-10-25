import { assertNoProdDbOutsideProd } from './prod-db-guard';

const rds = 'postgresql://u:p@unifesto.abc123.ap-south-1.rds.amazonaws.com:5432/db?sslmode=require';
const local = 'postgresql://unifesto:unifesto@localhost:5432/unifesto?sslmode=disable';

describe('assertNoProdDbOutsideProd', () => {
  it.each(['development', 'test', undefined])('refuses an RDS DATABASE_URL when NODE_ENV=%s', (NODE_ENV) => {
    expect(() => assertNoProdDbOutsideProd({ NODE_ENV, DATABASE_URL: rds })).toThrow('DATABASE_URL');
  });

  it('refuses an RDS DIRECT_URL too', () => {
    expect(() =>
      assertNoProdDbOutsideProd({ NODE_ENV: 'development', DATABASE_URL: local, DIRECT_URL: rds }),
    ).toThrow('DIRECT_URL');
  });

  it('allows RDS in production and localhost in dev', () => {
    expect(() => assertNoProdDbOutsideProd({ NODE_ENV: 'production', DATABASE_URL: rds })).not.toThrow();
    expect(() => assertNoProdDbOutsideProd({ NODE_ENV: 'development', DATABASE_URL: local })).not.toThrow();
  });
});
