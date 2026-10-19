import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateNotificationSettingsDto } from './update-notification-settings.dto';

const errors = async (body: object) =>
  (
    await validate(plainToInstance(UpdateNotificationSettingsDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('UpdateNotificationSettingsDto (C4)', () => {
  it('accepts the grid, marketing and quiet-hours fields', async () => {
    expect(
      await errors({
        emailEventReminders: false,
        emailNewEvents: true,
        marketingEmail: false,
        marketingWhatsapp: true,
        quietHoursStart: 1320,
        quietHoursEnd: 420,
      }),
    ).toEqual([]);
  });

  it('null turns quiet hours off', async () => {
    expect(await errors({ quietHoursStart: null, quietHoursEnd: null })).toEqual([]);
  });

  it('rejects out-of-range or non-integer minutes, and non-boolean switches', async () => {
    expect(await errors({ quietHoursStart: 1440 })).toEqual(['quietHoursStart']);
    expect(await errors({ quietHoursEnd: -1 })).toEqual(['quietHoursEnd']);
    expect(await errors({ quietHoursStart: 90.5 })).toEqual(['quietHoursStart']);
    expect(await errors({ quietHoursStart: '22:00' })).toEqual(['quietHoursStart']);
    expect(await errors({ marketingEmail: 'no' })).toEqual(['marketingEmail']);
  });

  it('still rejects unknown fields', async () => {
    expect(await errors({ emailPromotions: true })).toEqual(['emailPromotions']);
  });
});
