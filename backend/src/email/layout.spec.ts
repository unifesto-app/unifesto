import { button, contrastText, layout, qr } from './layout';

const brand = {
  name: 'Acme <Fest>',
  logoUrl: null,
  color: '#ffd400',
  hidePoweredBy: false,
  url: 'https://unifesto.app/space/acme',
  webBase: 'https://unifesto.app',
};

describe('email layout branding', () => {
  it('picks readable button text', () => {
    expect(contrastText('#ffd400')).toBe('#000000');
    expect(contrastText('#1a237e')).toBe('#ffffff');
  });

  it('unbranded mail keeps the Unifesto shell', () => {
    const html = layout(button('Go', 'https://x.y'));
    expect(html).toContain('wordmark-grey.png');
    expect(html).toContain('support@unifesto.app');
    expect(html).toContain('background:#111113;');
  });

  it('branded mail swaps header, button colour and footer', () => {
    const html = layout(button('Go', 'https://x.y'), '', brand);
    expect(html).not.toContain('wordmark-grey.png');
    expect(html).toContain('Acme &lt;Fest&gt;'); // escaped
    expect(html).toContain('class="b-btn" style="background:#ffd400;');
    expect(html).toContain('class="c-btnText" style="color:#000000;');
    expect(html).toContain('via <a href="https://unifesto.app"');
    expect(html).not.toContain('support@unifesto.app');
  });

  it('square logo fallback renders larger with the name beside it', () => {
    const sq = layout('<p>x</p>', '', { ...brand, logoUrl: 'https://cdn/sq.png', logoSquare: true });
    expect(sq).toContain('width="48" height="48"');
    expect(sq).toContain('Acme &lt;Fest&gt;</span>');
    const wide = layout('<p>x</p>', '', { ...brand, logoUrl: 'https://cdn/wide.png' });
    expect(wide).toContain('height="32"');
    expect(wide).not.toContain('Acme &lt;Fest&gt;</span>');
  });

  it('hidePoweredBy drops the Unifesto credit', () => {
    const html = layout('<p>x</p>', '', { ...brand, hidePoweredBy: true });
    expect(html).toContain('Sent by Acme &lt;Fest&gt; &middot;');
    expect(html).not.toContain('via <a');
  });
});

describe('check-in QR (J15)', () => {
  it('shows the inline attachment, never a third-party QR service', () => {
    const html = qr('UF-7Q2K');
    expect(html).toContain('src="cid:checkin-qr"');
    expect(html).not.toContain('qrserver');
  });
});
