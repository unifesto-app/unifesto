import { UnsubscribeController } from './unsubscribe.controller';

/** One-click (RFC 8058) and the confirm page's form both POST here. */
describe('UnsubscribeController', () => {
  const res = () => {
    const r: any = {};
    r.status = jest.fn(() => r);
    r.set = jest.fn(() => r);
    r.send = jest.fn(() => r);
    return r;
  };

  it('one-click POST opts out of the link scope and answers 200', async () => {
    const campaigns = { unsubscribe: jest.fn().mockResolvedValue(true) };
    const r = res();
    await new UnsubscribeController(campaigns as any).unsubscribe(
      'tok',
      { 'List-Unsubscribe': 'One-Click' },
      r,
    );
    expect(campaigns.unsubscribe).toHaveBeenCalledWith('tok', { everything: false, source: 'one_click' });
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('the page form can widen to all marketing mail; a bad token is a 400', async () => {
    const campaigns = { unsubscribe: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false) };
    const ctrl = new UnsubscribeController(campaigns as any);
    await ctrl.unsubscribe('tok', { scope: 'all' }, res());
    expect(campaigns.unsubscribe).toHaveBeenCalledWith('tok', { everything: true, source: 'link' });
    const bad = res();
    await ctrl.unsubscribe('forged', {}, bad);
    expect(bad.status).toHaveBeenCalledWith(400);
  });

  it('GET only shows the choice, it never unsubscribes', async () => {
    const campaigns = {
      readUnsubscribeToken: jest.fn().mockResolvedValue({ email: 'a@x.com', spaceId: 's1', spaceName: 'Acme' }),
      unsubscribe: jest.fn(),
    };
    const r = res();
    await new UnsubscribeController(campaigns as any).page('tok', r);
    const html = r.send.mock.calls[0][0];
    expect(html).toContain('Only Acme');
    expect(html).toContain('All marketing email');
    expect(campaigns.unsubscribe).not.toHaveBeenCalled();
  });
});
