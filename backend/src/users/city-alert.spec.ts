import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserProfileDto } from '../auth/dto';
import { SetCityAlertDto } from './dto';
import { UsersService } from './users.service';

const parse = async (body: object) => {
  const dto = plainToInstance(SetCityAlertDto, body);
  return { dto, errors: await validate(dto) };
};

describe('PUT /users/me/city-alert', () => {
  it('trims a city, and null or blank turns it off', async () => {
    expect((await parse({ city: '  Hyderabad ' })).dto.city).toBe('Hyderabad');
    expect((await parse({ city: null })).errors).toEqual([]);
    expect((await parse({ city: '   ' })).dto.city).toBeNull();
  });

  it('rejects a missing, non-string or over-long city', async () => {
    expect((await parse({})).errors).not.toEqual([]);
    expect((await parse({ city: 5 })).errors).not.toEqual([]);
    expect((await parse({ city: 'x'.repeat(101) })).errors).not.toEqual([]);
  });

  it('stores it and returns { city }', async () => {
    const prisma: any = { user: { update: jest.fn(async ({ data }) => ({ newEventsCity: data.newEventsCity })) } };
    const svc = new UsersService(prisma, {} as any, {} as any);
    expect(await svc.setCityAlert('u1', 'Hyderabad')).toEqual({ city: 'hyderabad' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { newEventsCity: 'hyderabad' } }));
    expect(await svc.setCityAlert('u1', null)).toEqual({ city: null });
  });

  it('GET /users/me carries newEventsCity', () => {
    const user: any = { id: 'u1', createdAt: new Date(), deletionRequestedAt: null, ageConfirmedAt: null, newEventsCity: 'Pune' };
    expect(UserProfileDto.fromUser(user, []).newEventsCity).toBe('Pune');
    expect(UserProfileDto.fromUser({ ...user, newEventsCity: undefined }, []).newEventsCity).toBeNull();
  });
});
