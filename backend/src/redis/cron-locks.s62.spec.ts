import { BlogWriterService } from '../blog/blog-writer.service';
import { CouponSchedulerService } from '../coupons/coupon-scheduler.service';
import { AccountDeletionSchedulerService } from '../users/account-deletion-scheduler.service';
import { WhiteLabelSchedulerService } from '../white-label/white-label-scheduler.service';
import { RedisService } from './redis.service';

/** The real runExclusive over an in-memory SET NX, or with Redis down. */
function redis(up = true) {
  const keys = new Set<string>();
  const client = {
    set: jest.fn(async (k: string) =>
      keys.has(k) ? null : (keys.add(k), 'OK'),
    ),
  };
  const svc = new RedisService({ get: () => undefined } as any);
  jest.spyOn(svc, 'getClient').mockReturnValue(up ? (client as any) : null);
  return svc;
}

/** A job that stays busy for a moment, so both replicas fire while it runs. */
const slow = <T>(v: T) =>
  jest.fn(() => new Promise<T>((r) => setTimeout(() => r(v), 10)));

const crons: {
  name: string;
  failOpen: boolean;
  make: (r: RedisService) => { job: jest.Mock; tick: () => Promise<unknown> };
}[] = [
  {
    name: 'coupon reservation sweep',
    failOpen: true,
    make: (r) => {
      const job = slow(0);
      return {
        job,
        tick: () =>
          new CouponSchedulerService(
            { sweepExpiredReservations: job } as any,
            r,
          ).sweep(),
      };
    },
  },
  {
    name: 'white-label domain sweep',
    failOpen: false,
    make: (r) => {
      const job = slow({ expired: 0, lapsed: 0 });
      return {
        job,
        tick: () =>
          new WhiteLabelSchedulerService(
            { sweepDomains: job } as any,
            r,
          ).sweep(),
      };
    },
  },
  {
    name: 'account deletion purge',
    failOpen: false,
    make: (r) => {
      const job = slow({ closed: 0, blocked: 0 });
      return {
        job,
        tick: () =>
          new AccountDeletionSchedulerService(
            { purgeDueDeletions: job } as any,
            r,
          ).purge(),
      };
    },
  },
  {
    name: 'blog auto-writer',
    failOpen: false,
    make: (r) => {
      const job = slow({ status: 'skipped', reason: 'test' });
      const tick = () => {
        const svc = new BlogWriterService({} as any, {} as any, {} as any, r);
        jest.spyOn(svc, 'generate').mockImplementation(job as any);
        return svc.scheduled();
      };
      return { job, tick };
    },
  },
];

describe.each(crons)(
  '$name runs on one replica (S62)',
  ({ make, failOpen }) => {
    it('a second replica firing the same tick does nothing', async () => {
      const { job, tick } = make(redis());
      await Promise.all([tick(), tick(), tick()]);
      expect(job).toHaveBeenCalledTimes(1);
    });

    it(
      failOpen
        ? 'still runs when Redis is down'
        : 'skips the tick when Redis is down',
      async () => {
        const { job, tick } = make(redis(false));
        await tick();
        expect(job).toHaveBeenCalledTimes(failOpen ? 1 : 0);
      },
    );
  },
);
