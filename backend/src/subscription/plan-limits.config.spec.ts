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

/** The lineup rows of 20261117100000_plan_lineup, by plan. */
function seedRows() {
  const sql = migration('20261117100000_plan_lineup');
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
    // Column order of the lineup INSERT: 5 limits, 11 flags, 2 prices.
    expect({
      spaces: l.spaces,
      eventsPerMonth: l.eventsPerMonth,
      attendeesPerEvent: l.attendeesPerEvent,
      ticketTypes: l.ticketTypes,
      coCurators: l.coCurators,
      ...Object.fromEntries(FLAGS.map((f) => [f, l[f]])),
      monthlyPrice: l.monthlyPrice,
      annualPrice: l.annualPrice,
    }).toEqual({
      spaces: num(v[0]),
      eventsPerMonth: num(v[1]),
      attendeesPerEvent: num(v[2]),
      ticketTypes: num(v[3]),
      coCurators: num(v[4]),
      ...Object.fromEntries(FLAGS.map((f, i) => [f, v[5 + i] === 'true'])),
      monthlyPrice: num(v[16]),
      annualPrice: num(v[17]),
    });
  });

  it('platform fees ship at 0 (A9 migration), and the lineup leaves them alone', () => {
    expect(migration('20261023100000_organiser_platform_fee')).toMatch(/SET "platform_fee_percent" = 0/);
    expect(migration('20261117100000_plan_lineup')).not.toMatch(/"platform_fee_percent" =/);
    expect(Object.values(PLAN_LIMITS).every((l) => l.platformFeePercent === 0)).toBe(true);
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
