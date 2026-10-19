import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.updateNotificationSettings quiet hours (C4)', () => {
  const build = (current: { quietHoursStart: number | null; quietHoursEnd: number | null } | null) => {
    const prisma: any = {
      notificationSettings: {
        findUnique: jest.fn().mockResolvedValue(current),
        upsert: jest.fn(),
      },
    };
    return { svc: new UsersService(prisma, { get: () => undefined } as any, {} as any), prisma };
  };

  it('rejects a window whose ends match, including one end matched against the stored other', async () => {
    const { svc, prisma } = build({ quietHoursStart: 1320, quietHoursEnd: 420 });
    await expect(svc.updateNotificationSettings('u1', { quietHoursStart: 600, quietHoursEnd: 600 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.updateNotificationSettings('u1', { quietHoursEnd: 1320 })).rejects.toThrow(BadRequestException);
    await expect(svc.updateNotificationSettings('u1', { quietHoursEnd: null })).rejects.toThrow(BadRequestException);
    expect(prisma.notificationSettings.upsert).not.toHaveBeenCalled();
  });
});
