import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { Audit, AuditInterceptor } from './audit';

/** F5: the @Audit interceptor writes one row per successful change, never fails the request. */
describe('AuditInterceptor (F5)', () => {
  class Ctl {
    @Audit('space.member.role', (r, prisma: any) =>
      prisma.userRole.findUnique({ where: { id: r.params.userRoleId } }),
    )
    handler() {}
  }

  const setup = (create = jest.fn(async () => ({}))) => {
    const prisma: any = {
      auditLog: { create },
      userRole: { findUnique: jest.fn(async () => ({ userId: 'u-2', spaceId: 'sp-1' })) },
    };
    const interceptor = new AuditInterceptor(new Reflector(), prisma);
    const req = { user: { id: 'admin' }, params: { id: 'sp-1', userRoleId: 'ur-1' }, body: { role: 'CURATOR' } };
    const ctx: any = { getHandler: () => Ctl.prototype.handler, switchToHttp: () => ({ getRequest: () => req }) };
    return { interceptor, ctx, create };
  };

  it('records actor, action, targets and the request after success', async () => {
    const { interceptor, ctx, create } = setup();
    expect(await firstValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') }))).toBe('ok');
    expect(create).toHaveBeenCalledWith({
      data: {
        action: 'space.member.role',
        actorId: 'admin',
        userId: 'u-2',
        spaceId: 'sp-1',
        eventId: null,
        data: { params: { id: 'sp-1', userRoleId: 'ur-1' }, body: { role: 'CURATOR' } },
      },
    });
  });

  it('writes nothing when the change fails, and a failed write keeps the response', async () => {
    const { interceptor, ctx, create } = setup();
    await expect(
      firstValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => new Error('no')) })),
    ).rejects.toThrow('no');
    expect(create).not.toHaveBeenCalled();

    const broken = setup(jest.fn(async () => Promise.reject(new Error('db down'))));
    jest.spyOn((broken.interceptor as any).logger, 'error').mockImplementation(() => undefined);
    expect(await firstValueFrom(broken.interceptor.intercept(broken.ctx, { handle: () => of('ok') }))).toBe('ok');
  });
});
