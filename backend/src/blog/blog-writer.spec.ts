import { readFileSync } from 'fs';
import { join } from 'path';
import { Draft, cleanSuggestions, gate, normUrl, splitSources, stripEmDashes, topBlogPages, wordCount } from './blog-writer';

// The approved sample article: the gate must pass it, and each break must fail it.
const SAMPLE = readFileSync(join(__dirname, '__fixtures__/sample-post.md'), 'utf8');
const sourceUrls = new Set([...SAMPLE.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => normUrl(m[0])));
const posts = [
  { slug: 'how-to-organize-a-college-fest', title: 'How to Organize a College Fest' },
  { slug: 'unifesto-vs-google-forms', title: 'Unifesto vs Google Forms' },
  { slug: 'unifesto-orbit', title: 'Introducing Unifesto Orbit' },
];
const draft = (over: Partial<Draft> = {}): Draft => ({
  intent: 'how-to',
  title: 'How to Organise a Hackathon in College',
  slug: 'how-to-organise-a-hackathon-in-college',
  metaTitle: 'How to Organise a College Hackathon: Timeline and Judging',
  metaDescription: 'Book the venue 4 to 9 months out, open registrations 3 months before and plan for half your sign-ups to show.',
  excerpt: 'A timeline, judge maths and SIH rules.',
  coverAlt: 'Unifesto blog card titled How to Organise a Hackathon in College',
  markdown: SAMPLE,
  ...over,
});
const run = (over: Partial<Draft> = {}, p = posts) => gate({ draft: draft(over), sourceUrls, posts: p });

describe('auto-blog gate', () => {
  it('passes the approved sample', () => {
    expect(wordCount(SAMPLE)).toBeGreaterThan(900);
    expect(run()).toBeNull();
  });

  it('rejects short, placeholder, banned, invented-source and bad-link drafts', () => {
    expect(run({ markdown: SAMPLE.slice(0, 2000) })).toMatch(/words/);
    expect(run({ markdown: SAMPLE + '\n[insert example here]' })).toMatch(/placeholder/);
    expect(run({ markdown: SAMPLE.replace('Most college', 'Let us delve into why most college') })).toMatch(/banned/);
    expect(run({ markdown: SAMPLE + '\n10. Made up: https://example.com/fake' })).toMatch(/not from research/);
    expect(run({ markdown: SAMPLE.replace('/blog/unifesto-vs-google-forms', '/blog/no-such-post') })).toMatch(/missing post/);
    expect(run({ markdown: SAMPLE.replace('(/sprint)', '(/admin)') })).toMatch(/unknown page/);
    expect(run({ metaTitle: 'x'.repeat(61) })).toMatch(/meta title/);
  });

  it('rejects duplicates and enforces 3 post links once there are 5 posts', () => {
    expect(run({}, [...posts, { slug: 'x', title: 'How to Organise a Hackathon at College' }])).toMatch(/duplicates/);
    expect(run({ slug: 'unifesto-orbit' })).toMatch(/already exists/);
    const five = [...posts, { slug: 'a', title: 'Alpha' }, { slug: 'b', title: 'Beta' }];
    expect(run({}, five)).toMatch(/post links/);
  });

  it('splits the Sources list off so the humanize editor never sees it', () => {
    const [body, sources] = splitSources(SAMPLE);
    expect(body + sources).toBe(SAMPLE);
    expect(body).not.toMatch(/^##\s+Sources\b/m);
    expect(sources).toMatch(/^## Sources/);
    expect([...sources.matchAll(/https?:\/\//g)].length).toBeGreaterThanOrEqual(2);
    // An editor reply without the list still passes once the list is put back.
    expect(run({ markdown: `${body.trimEnd()}\n\n${sources}`.trim() })).toBeNull();
    expect(splitSources('no list here')).toEqual(['no list here', '']);
  });

  it('cleans up em dashes, Search Console CSVs and question suggestions', () => {
    expect(stripEmDashes('one — two')).toBe('one, two');
    const csv = 'Top pages,Clicks,Impressions\nhttps://unifesto.app/blog/a,3,90\nhttps://unifesto.app/blog/b/,12,400\nhttps://unifesto.app/pricing,50,9\nhttps://unifesto.app/blog/c,0,5';
    expect(topBlogPages(csv)).toEqual([{ slug: 'b', clicks: 12 }, { slug: 'a', clicks: 3 }]);
    const raw = {
      questions: [
        { question: 'How do I run a quiz night?', topic: 'Quiz Night', intent: 'how-to', angle: null, appLink: '/admin' },
        { question: 'how do i organise a hackathon in college?', topic: 'x', intent: 'how-to', angle: null, appLink: null },
        { question: 'Bad intent', topic: 'x', intent: 'rant', angle: null, appLink: null },
      ],
    };
    expect(cleanSuggestions(raw, ['How do I organise a hackathon in college?'])).toEqual([
      { question: 'How do I run a quiz night?', topic: 'quiz-night', intent: 'how-to', angle: null, appLink: null },
    ]);
  });
});
