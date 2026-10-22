import { sanitizeEmailHtml } from './sanitize-email-html';

describe('sanitizeEmailHtml (J11)', () => {
  it.each([
    ['<script>alert(document.cookie)</script><p>Hi</p>', '<p>Hi</p>'],
    ['<img src="x" onerror="alert(1)">', '<img src="x" />'],
    ['<a href="javascript:alert(1)">x</a>', '<a>x</a>'],
    ['<img src="data:image/svg+xml,<svg onload=alert(1)>">', '<img />'],
    ['<iframe src="https://evil.example"></iframe><p>ok</p>', '<p>ok</p>'],
    ['<svg><script>alert(1)</script></svg>', ''],
    ['<style>body{}</style><form action="https://x"><input></form>', ''],
  ])('strips script vectors from %s', (dirty, clean) => {
    expect(sanitizeEmailHtml(dirty)).toBe(clean);
  });

  it('keeps ordinary email markup, inline styles and merge vars', () => {
    const html =
      '<table role="presentation" cellpadding="0"><tr><td style="color:#111" align="center">' +
      '<h2>Hi {{firstName}}</h2><p><a href="https://unifesto.app/e/1?u={{email}}">Join</a></p>' +
      '<img src="https://cdn.example/banner.png" alt="Banner" width="600" /></td></tr></table>';
    expect(sanitizeEmailHtml(html)).toBe(
      '<table role="presentation" cellpadding="0"><tr><td style="color:#111" align="center">' +
        '<h2>Hi {{firstName}}</h2><p><a href="https://unifesto.app/e/1?u={{email}}">Join</a></p>' +
        '<img src="https://cdn.example/banner.png" alt="Banner" width="600" /></td></tr></table>',
    );
  });
});
