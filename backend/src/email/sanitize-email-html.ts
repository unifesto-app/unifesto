import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist for operator-authored campaign + template HTML (J11). Bodies are
 * written by Curators but previewed by Space/Platform Admins, so anything that
 * can run script is stripped: no <script>/<style>/<iframe>/<form>, no on*
 * handlers, no javascript:/data: URLs. Inline `style` stays (emails need it).
 * Run at save AND at render, so rows stored before this still render clean.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'span',
    'font',
    'center',
    'u',
    's',
  ],
  allowedAttributes: {
    '*': [
      'style',
      'align',
      'valign',
      'width',
      'height',
      'bgcolor',
      'color',
      'class',
      'dir',
      'title',
    ],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'border'],
    table: ['border', 'cellpadding', 'cellspacing', 'role'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    font: ['face', 'size'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
