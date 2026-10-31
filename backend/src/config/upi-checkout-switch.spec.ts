import { PlatformConfigService } from '../subscription/platform-config.service';
import { PublicConfigController } from './public-config.controller';

/** Q40: the app reads its own key (Platform.OS: ios / android), the site reads `web`. */
describe('UPI checkout switch', () => {
  const build = (row: object | null) => {
    const upsert = jest.fn(async () => ({}));
    const svc = new PlatformConfigService({ platformConfig: { findUnique: jest.fn(async () => row), upsert } } as any);
    return { upsert, ctrl: new PublicConfigController(svc, {} as any) };
  };

  it('serves each platform under the key its client reads', async () => {
    const { ctrl } = build({ upiCheckoutIos: false, upiCheckoutAndroid: true, upiCheckoutWeb: true });
    await expect(ctrl.getCheckout()).resolves.toEqual({ ios: false, android: true, web: true });
  });

  it('is off everywhere before the row exists', async () => {
    await expect(build(null).ctrl.getCheckout()).resolves.toEqual({ ios: false, android: false, web: false });
  });

  it('an admin flip touches only the platform sent', async () => {
    const { upsert } = build(null);
    const svc = new PlatformConfigService({ platformConfig: { upsert } } as any);
    await svc.setUpiCheckout({ upiCheckoutAndroid: false });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { upiCheckoutAndroid: false } }));
  });
});
