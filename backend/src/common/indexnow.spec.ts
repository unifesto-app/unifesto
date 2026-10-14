import { blogChangeUrls } from './indexnow';

const W = 'https://www.unifesto.app';
const pub = (slug: string) => ({ slug, status: 'PUBLISHED' });
const draft = (slug: string) => ({ slug, status: 'DRAFT' });

describe('blogChangeUrls', () => {
  it('publishing a draft reports the post and the index', () => {
    expect(blogChangeUrls(draft('a'), pub('a'))).toEqual([`${W}/blog/a`, `${W}/blog`]);
  });

  it('a slug change on a live post reports old and new', () => {
    expect(blogChangeUrls(pub('a'), pub('b'))).toEqual([`${W}/blog/a`, `${W}/blog/b`, `${W}/blog`]);
  });

  it('unpublish and delete report the removed URL', () => {
    expect(blogChangeUrls(pub('a'), draft('a'))).toEqual([`${W}/blog/a`, `${W}/blog`]);
    expect(blogChangeUrls(pub('a'), null)).toEqual([`${W}/blog/a`, `${W}/blog`]);
  });

  it('draft-only changes report nothing', () => {
    expect(blogChangeUrls(null, draft('a'))).toEqual([]);
    expect(blogChangeUrls(draft('a'), draft('b'))).toEqual([]);
  });
});
