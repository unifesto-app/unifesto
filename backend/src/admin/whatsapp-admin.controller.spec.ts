import { WhatsAppAdminController } from './whatsapp-admin.controller';
import { WhatsAppBroadcastAudience } from '../whatsapp/dto/broadcast.dto';

/** Confirm-step routes: the count resolves like the real send; the test only dials the caller. */
describe('WhatsAppAdminController broadcast confirm step', () => {
  const whatsapp = {
    resolveBroadcastRecipients: jest.fn().mockResolvedValue([{ userId: 'a' }, { userId: 'b' }]),
    sendBroadcastTemplate: jest.fn().mockResolvedValue({ recipientCount: 1, status: 'started' }),
  };
  const ctrl = new WhatsAppAdminController(whatsapp as any);

  it('returns the same deduped recipient count the broadcast would use', async () => {
    const dto = { audience: WhatsAppBroadcastAudience.SPACE, spaceId: 's1' };
    await expect(ctrl.broadcastAudience(dto)).resolves.toEqual({ recipientCount: 2 });
    expect(whatsapp.resolveBroadcastRecipients).toHaveBeenCalledWith(dto);
  });

  it('sends a test to the signed-in admin only', async () => {
    await ctrl.broadcastTest({ templateName: 'hello', bodyParams: ['{name}'] }, { id: 'me' } as any);
    expect(whatsapp.sendBroadcastTemplate).toHaveBeenCalledWith({
      templateName: 'hello',
      bodyParams: ['{name}'],
      adminUserId: 'me',
      audience: 'USER',
      userIds: ['me'],
      test: true,
    });
  });
});
