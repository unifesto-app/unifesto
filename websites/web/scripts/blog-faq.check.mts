// @ts-nocheck -- plain Node script (type stripping), not part of the Next build.
// Self-check for the blog FAQ parser. Run: node scripts/blog-faq.check.mts
import assert from 'node:assert/strict';
import { postFaqs } from '../src/lib/blog-faq.ts';

const post = `Intro paragraph.

## Steps
### Not a question
Body.

## FAQ

### Is Unifesto **free**?
Yes. Free RSVP events cost nothing.
See [pricing](/pricing).

### Empty one?

### Does it do \`QR\` check-in?
Yes, from the app.

## About the author
### Ignored
Text.
`;

assert.deepEqual(postFaqs(post), [
  { q: 'Is Unifesto free?', a: 'Yes. Free RSVP events cost nothing. See pricing.' },
  { q: 'Does it do QR check-in?', a: 'Yes, from the app.' },
]);
assert.deepEqual(postFaqs('## Frequently asked questions\n### Q?\nA.'), [{ q: 'Q?', a: 'A.' }]);
assert.deepEqual(postFaqs('No FAQ here.\n### Q?\nA.'), []);

console.log('blog-faq: ok');
