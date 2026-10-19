import { UserNotificationsService } from './user-notifications.service';

describe('UserNotificationsService', () => {
  it('excludeType leaves one type out (the personal tab without staff queries)', async () => {
    const prisma: any = { userNotification: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    await new UserNotificationsService(prisma).markRead('u1', { excludeType: 'help_desk' });
    expect(prisma.userNotification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      type: { not: 'help_desk' },
      readAt: null,
    });
  });
});
