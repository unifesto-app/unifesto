import { ARTICLES } from '../../scripts/seed-help-articles';

/** K17: the starter articles fit the columns, follow the copy rules and link only to each other. */
describe('seed help articles', () => {
  const slugs = new Set(ARTICLES.map((a) => a.slug));

  it('has unique, URL-safe slugs that fit the columns', () => {
    expect(slugs.size).toBe(ARTICLES.length);
    for (const a of ARTICLES) {
      expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.slug.length).toBeLessThanOrEqual(220);
      expect(a.title.length).toBeLessThanOrEqual(255);
      expect(a.category.length).toBeLessThanOrEqual(80);
    }
  });

  it('uses no em or en dashes', () => {
    for (const a of ARTICLES) expect(`${a.title}\n${a.body}`).not.toMatch(/[–—]/);
  });

  it('links only to articles in the set', () => {
    for (const a of ARTICLES) {
      for (const [, slug] of a.body.matchAll(/\]\(\/help\/([^)]+)\)/g)) {
        if (slug !== 'contact') expect(slugs).toContain(slug);
      }
    }
  });
});
