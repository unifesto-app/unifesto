import axios from 'axios';
import { OneSignalService, isMissingTargetUser } from './onesignal.service';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

const httpError = (status: number, data: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const missingUser = () => httpError(404, { errors: [{ title: 'Target user does not exist' }] });

describe('OneSignalService.linkSubscriptionToExternalId', () => {
  const env = { ...process.env };
  let service: OneSignalService;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ONESIGNAL_APP_ID = 'app';
    process.env.ONESIGNAL_REST_API_KEY = 'key';
    service = new OneSignalService();
  });
  afterAll(() => {
    process.env = env;
  });

  it('links directly when the OneSignal user exists', async () => {
    mocked.patch.mockResolvedValueOnce({ data: {} });
    await expect(service.linkSubscriptionToExternalId('sub-1', 'user-1')).resolves.toEqual({ ok: true });
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('creates the user and retries when the target user does not exist', async () => {
    mocked.patch.mockRejectedValueOnce(missingUser()).mockResolvedValueOnce({ data: {} });
    mocked.post.mockResolvedValueOnce({ data: {} });
    await expect(service.linkSubscriptionToExternalId('sub-1', 'user-1')).resolves.toEqual({ ok: true });
    expect(mocked.post).toHaveBeenCalledWith(
      'https://api.onesignal.com/apps/app/users',
      { identity: { external_id: 'user-1' } },
      expect.anything(),
    );
    expect(mocked.patch).toHaveBeenCalledTimes(2);
  });

  it('treats "user already exists" on create as fine', async () => {
    mocked.patch.mockRejectedValueOnce(missingUser()).mockResolvedValueOnce({ data: {} });
    mocked.post.mockRejectedValueOnce(httpError(409, { errors: ['exists'] }));
    await expect(service.linkSubscriptionToExternalId('sub-1', 'user-1')).resolves.toEqual({ ok: true });
  });

  it('reports other failures without retrying', async () => {
    mocked.patch.mockRejectedValueOnce(httpError(404, { errors: [{ title: 'Subscription not found' }] }));
    const res = await service.linkSubscriptionToExternalId('sub-1', 'user-1');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('404');
    expect(mocked.post).not.toHaveBeenCalled();
    expect(mocked.patch).toHaveBeenCalledTimes(1);
  });

  it('recognises only the missing-user 404', () => {
    expect(isMissingTargetUser(missingUser())).toBe(true);
    expect(isMissingTargetUser(httpError(404, 'nope'))).toBe(false);
    expect(isMissingTargetUser(httpError(400, { errors: [{ title: 'Target user does not exist' }] }))).toBe(false);
  });
});
