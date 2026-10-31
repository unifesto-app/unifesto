import { readFileSync } from 'fs';
import { join } from 'path';
import { OrgPlan } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PLAN_LIMITS } from './plan-limits.config';
import { UpdatePlanConfigDto } from './dto';

/**
 * plan_configs is the one source of plan limits, prices and features (T10);
 * PLAN_LIMITS is only the compiled fallback for a missing row. Pin it to what
 * the migrations seed, so a fresh database and the fallback agree.
 */
const migration = (name: string) =>
  readFileSync(join(__dirname, '../../prisma/migrations', name, 'migration.sql'), 'utf8');

const num = (v: string) => (v === 'NULL' ? null : Number(v));

/** The plan rows of 20261123090000_fee_live (Z2), by plan. */
function seedRows() {
  const sql = migration('20261123090000_fee_live');
  const rows = new Map<string, string[]>();
  for (const m of sql.matchAll(/\('(STARTER|CLUB|GROWTH|PRO|ENTERPRISE)',([^)]*)\)/g)) {
    rows.set(m[1], m[2].split(',').map((v) => v.trim()));
  }
  return rows;
}

const FLAGS = [
  'hasWaitlist', 'hasBulkExport', 'hasAnalytics', 'hasWhatsappBlast', 'hasRecurringEvents',
  'hasRemoveBranding', 'hasPrioritySupport', 'hasSessions', 'hasLeaderboard', 'hasCertificates', 'hasSponsors',
] as const;

describe('PLAN_LIMITS matches the plan_configs lineup', () => {
  const rows = seedRows();

  it.each(Object.values(OrgPlan))('%s', (plan) => {
    const v = rows.get(plan)!;
    expect(v).toBeDefined();
    const l = PLAN_LIMITS[plan];
    // Column order of the INSERT: 5 limits, 11 flags, 2 prices, the fee.
    expect({
      spaces: l.spaces,
      eventsPerMonth: l.eventsPerMonth,
      attendeesPerEvent: l.attendeesPerEvent,
      ticketTypes: l.ticketTypes,
      coCurators: l.coCurators,
      ...Object.fromEntries(FLAGS.map((f) => [f, l[f]])),
      monthlyPrice: l.monthlyPrice,
      annualPrice: l.annualPrice,
      platformFeePercent: l.platformFeePercent,
    }).toEqual({
      spaces: num(v[0]),
      eventsPerMonth: num(v[1]),
      attendeesPerEvent: num(v[2]),
      ticketTypes: num(v[3]),
      coCurators: num(v[4]),
      ...Object.fromEntries(FLAGS.map((f, i) => [f, v[5 + i] === 'true'])),
      monthlyPrice: num(v[16]),
      annualPrice: num(v[17]),
      platformFeePercent: num(v[18]),
    });
  });

  it('Z2 sets the fees and moves every space to General', () => {
    const sql = migration('20261123090000_fee_live');
    expect(sql).toMatch(/SET "plan" = 'STARTER'/);
    expect(Object.fromEntries(Object.entries(PLAN_LIMITS).map(([p, l]) => [p, l.platformFeePercent]))).toEqual({
      STARTER: 3, CLUB: 3.5, GROWTH: 4, PRO: 4.5, ENTERPRISE: 0,
    });
  });
});

describe('UpdatePlanConfigDto platformFeePercent', () => {
  // Clearing the fee used to send null past @IsOptional into a NOT NULL column (500).
  it('rejects null with a validation error, accepts a number or leaving it out', async () => {
    const errs = (body: object) => validate(plainToInstance(UpdatePlanConfigDto, body));
    expect((await errs({ platformFeePercent: null })).map((e) => e.property)).toEqual(['platformFeePercent']);
    expect(await errs({ platformFeePercent: 2.5 })).toEqual([]);
    expect(await errs({})).toEqual([]);
  });
});
