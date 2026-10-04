import { resolveCategories } from './event-categories';

describe('resolveCategories', () => {
  const existing = { category: 'Tech', categories: ['Tech', 'Music'] };

  it('takes the list as sent, primary first, deduped and capped', () => {
    expect(resolveCategories({ categories: [' Tech ', 'Music', 'Tech', 'Art', 'Food'] })).toEqual({
      categories: ['Tech', 'Music', 'Art'],
      category: 'Tech',
    });
    expect(resolveCategories({ categories: [] }, existing)).toEqual({ categories: [], category: null });
  });

  it('keeps extras when an old client resends or swaps the primary', () => {
    expect(resolveCategories({ category: 'Tech' }, existing)).toEqual({});
    expect(resolveCategories({ category: 'Art' }, existing)).toEqual({ categories: ['Art', 'Music'], category: 'Art' });
    expect(resolveCategories({ category: 'Music' }, existing)).toEqual({ categories: ['Music'], category: 'Music' });
    expect(resolveCategories({ category: '' }, existing)).toEqual({ categories: [], category: null });
  });

  it('leaves both alone when neither is sent, and wraps a single category on create', () => {
    expect(resolveCategories({}, existing)).toEqual({});
    expect(resolveCategories({ category: 'Tech' })).toEqual({ categories: ['Tech'], category: 'Tech' });
  });
});
