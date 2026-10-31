import { readFileSync } from 'fs';
import { join } from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import {
  Draft,
  cleanSuggestions,
  fit,
  gate,
  normUrl,
  researchSources,
  sourcesList,
  splitSources,
  stripEmDashes,
  topBlogPages,
  wordCount,
} from './blog-writer';

// The approved sample article: the gate must pass it, and each break must fail it.
const SAMPLE = readFileSync(join(__dirname, '__fixtures__/sample-post.md'), 'utf8');
const SAMPLE_URLS = [...splitSources(SAMPLE)[1].matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
const sourceUrls = new Set(SAMPLE_URLS.map(normUrl));
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
  sources: SAMPLE_URLS,
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
    expect(run({ sources: [...SAMPLE_URLS, 'https://example.com/fake'] })).toMatch(/not from research/);
    expect(run({ sources: [SAMPLE_URLS[0], `${SAMPLE_URLS[0]}/`] })).toMatch(/fewer than 2 sources/);
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

  it('passes one fitting post link when there is no app link and few posts', () => {
    // "How many volunteers..." fit only the fest checklist and failed as "2 internal links".
    const one = SAMPLE.replace('[Unifesto Sprint](/sprint)', 'Unifesto Sprint').replace(
      "[here's where that setup starts to break](/blog/unifesto-vs-google-forms)",
      "here's where that setup starts to break",
    );
    expect(run({ markdown: one })).toBeNull();
    expect(run({ markdown: one.replace('(/blog/how-to-organize-a-college-fest)', '') })).toMatch(/0 post links/);
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

  it('builds the Sources list from research, keeping brackets and case', () => {
    // A ")" in the URL once cut it to ".../sponsor_(commercial" and failed the post.
    const wiki = 'https://en.wikipedia.org/wiki/Sponsor_(commercial)';
    const blocks = [
      { type: 'web_search_tool_result', content: [{ url: wiki, title: 'Sponsor (commercial)' }] },
      { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: `${wiki}/`, content: { title: 'dup' } } },
      { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url: 'https://www.npci.org.in/UPI', content: {} } },
    ] as unknown as Anthropic.ContentBlock[];
    const read = researchSources(blocks);
    expect(read).toEqual([
      { title: 'Sponsor (commercial)', url: wiki },
      { title: 'https://www.npci.org.in/UPI', url: 'https://www.npci.org.in/UPI' },
    ]);
    // The writer echoes a lower-cased copy; the list prints the URL as it was read.
    expect(sourcesList([wiki.toLowerCase(), 'https://www.npci.org.in/UPI'], read)).toBe(
      `## Sources\n\n1. Sponsor (commercial): ${wiki}\n2. https://www.npci.org.in/UPI: https://www.npci.org.in/UPI`,
    );
    const urls = new Set(read.map((s) => normUrl(s.url)));
    expect(gate({ draft: draft({ sources: [wiki, 'https://www.npci.org.in/UPI'] }), sourceUrls: urls, posts })).toBeNull();
  });

  it('cuts an over-long meta field at the last whole word', () => {
    expect(fit('  short  ', 155)).toBe('short');
    expect(fit('Find sponsors, then pitch them', 15)).toBe('Find sponsors');
    expect(fit('Find sponsors early', 13)).toBe('Find sponsors');
    expect(fit('Supercalifragilistic', 5)).toBe('Super');
    const long = 'A new club can land fest sponsors by pitching local businesses first, '.repeat(4);
    expect(fit(long, 155).length).toBeLessThanOrEqual(155);
    expect(long.startsWith(fit(long, 155))).toBe(true);
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
