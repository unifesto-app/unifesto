import { readFileSync } from 'fs';
import { join } from 'path';
import { OrgPlan } from '@prisma/client';
import { PLAN_LIMITS } from './plan-limits.config';

/**
 * plan_configs is the one source of plan limits, prices and features (T10);
 * PLAN_LIMITS is only the compiled fallback for a missing row. Pin it to what
 * the migrations seed, so a fresh database and the fallback agree.
 */
const migration = (name: string) =>
  readFileSync(join(__dirname, '../../prisma/migrations', name, 'migration.sql'), 'utf8');

const num = (v: string) => (v === 'NULL' ? null : Number(v));

/** The seed rows of 20260712110000_add_plan_configs, by plan. */
function seedRows() {
  const sql = migration('20260712110000_add_plan_configs');
  const rows = new Map<string, string[]>();
  for (const m of sql.matchAll(/\('(STARTER|GROWTH|PRO|ENTERPRISE)',([^)]*)\)/g)) {
    rows.set(m[1], m[2].split(',').map((v) => v.trim()));
  }
  return rows;
}

describe('PLAN_LIMITS matches the plan_configs seed', () => {
  const rows = seedRows();

  it.each(Object.values(OrgPlan))('%s', (plan) => {
    const v = rows.get(plan)!;
    expect(v).toBeDefined();
    const l = PLAN_LIMITS[plan];
    // Column order of the seed INSERT (processing_fee_percent, v[12], was
    // renamed to platform_fee_percent and reset to 0 by 20261023100000).
    expect({
      spaces: l.spaces,
      eventsPerMonth: l.eventsPerMonth,
      attendeesPerEvent: l.attendeesPerEvent,
      ticketTypes: l.ticketTypes,
      coCurators: l.coCurators,
      hasWaitlist: l.hasWaitlist,
      hasBulkExport: l.hasBulkExport,
      hasAnalytics: l.hasAnalytics,
      hasWhatsappBlast: l.hasWhatsappBlast,
      hasRecurringEvents: l.hasRecurringEvents,
      hasRemoveBranding: l.hasRemoveBranding,
      hasPrioritySupport: l.hasPrioritySupport,
      monthlyPrice: l.monthlyPrice,
      annualPrice: l.annualPrice,
    }).toEqual({
      spaces: num(v[0]),
      eventsPerMonth: num(v[1]),
      attendeesPerEvent: num(v[2]),
      ticketTypes: num(v[3]),
      coCurators: num(v[4]),
      hasWaitlist: v[5] === 'true',
      hasBulkExport: v[6] === 'true',
      hasAnalytics: v[7] === 'true',
      hasWhatsappBlast: v[8] === 'true',
      hasRecurringEvents: v[9] === 'true',
      hasRemoveBranding: v[10] === 'true',
      hasPrioritySupport: v[11] === 'true',
      monthlyPrice: num(v[13]),
      annualPrice: num(v[14]),
    });
  });

  it('platform fees ship at 0 (A9 migration), certificates on PRO and ENTERPRISE', () => {
    expect(migration('20261023100000_organiser_platform_fee')).toMatch(/SET "platform_fee_percent" = 0/);
    expect(Object.values(PLAN_LIMITS).every((l) => l.platformFeePercent === 0)).toBe(true);
    expect(migration('20260729140000_add_certificates')).toMatch(/has_certificates" = true WHERE "plan" IN \('PRO', 'ENTERPRISE'\)/);
    expect(Object.entries(PLAN_LIMITS).filter(([, l]) => l.hasCertificates).map(([p]) => p)).toEqual(['PRO', 'ENTERPRISE']);
  });
});

describe('UpdatePlanConfigDto platformFeePercent', () => {
  // Clearing the fee used to send null past @IsOptional into a NOT NULL column (500).
  it('rejects null with a validation error, accepts a number or leaving it out', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { UpdatePlanConfigDto } = await import('./dto');
    const errs = (body: object) => validate(plainToInstance(UpdatePlanConfigDto, body));
    expect((await errs({ platformFeePercent: null })).map((e) => e.property)).toEqual(['platformFeePercent']);
    expect(await errs({ platformFeePercent: 2.5 })).toEqual([]);
    expect(await errs({})).toEqual([]);
  });
});
