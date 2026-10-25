import { Prisma } from '@prisma/client';

/**
 * The screen-recording demo (scripts/demo-space.ts) lives in prod: one Space
 * by this slug, its events and paid `demo_pay_*` registrations, and ~120 users
 * whose mobile starts `+0999`. These fragments keep it out of every platform
 * money/analytics aggregate without touching the rows. Keep in sync with the script.
 */
export const DEMO_SPACE_SLUG = 'aurora-tech-club-demo';
export const DEMO_MOBILE_PREFIX = '+0999';

export const NOT_DEMO_SPACE: Prisma.SpaceWhereInput = { slug: { not: DEMO_SPACE_SLUG } };
export const NOT_DEMO_EVENT: Prisma.EventWhereInput = { space: NOT_DEMO_SPACE };
export const NOT_DEMO_USER: Prisma.UserWhereInput = {
  NOT: { mobileNumber: { startsWith: DEMO_MOBILE_PREFIX } },
};

/** Raw-SQL twin of NOT_DEMO_EVENT for a column holding an event id. */
export const notDemoEventSql = (eventIdCol: string) => Prisma.sql`${Prisma.raw(eventIdCol)} NOT IN (
  SELECT de.id FROM events de JOIN spaces ds ON ds.id = de.space_id WHERE ds.slug = ${DEMO_SPACE_SLUG})`;
/** Raw-SQL twin of NOT_DEMO_USER (users.mobile_number is NOT NULL). */
export const NOT_DEMO_USER_SQL = Prisma.sql`mobile_number NOT LIKE ${DEMO_MOBILE_PREFIX + '%'}`;
export const NOT_DEMO_SPACE_SQL = Prisma.sql`slug <> ${DEMO_SPACE_SLUG}`;
