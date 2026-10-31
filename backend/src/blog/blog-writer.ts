import type Anthropic from '@anthropic-ai/sdk';

/*
 * Auto-blog prompts, schemas and the quality gate. Pure, so the spec can run
 * the gate without Prisma or the API. BlogWriterService wires it together.
 */

export const BLOG_AUTHOR = 'Abhinavtej Reddy';
export const MIN_WORDS = 900;
export const DAILY_POST_CAP = 3;
export const TOPIC_COOLDOWN_DAYS = 7;

/** App pages a post may link to. Anything else relative and not /blog/<slug> fails the gate. */
export const APP_PAGES = [
  '/organisers',
  '/pricing',
  '/sprint',
  '/stay',
  '/huddle',
  '/orbit',
  '/app',
  '/events',
  '/spaces',
  '/request-space',
] as const;

/** What Unifesto does, so the writer never guesses. Keep in step with websites/web/src/lib/site.ts. */
export const PRODUCT_FACTS = `Unifesto (unifesto.app) is an event platform for college clubs, communities and institutions in India, built in Hyderabad. Prices are in INR and payments run through Razorpay.
- Spaces: a club, fest team or institution runs as a Space with the roles Space Admin, Curator, Co-Curator and Crew. Events, people, money and history stay with the Space when the team changes.
- Tickets: free RSVP, paid tickets, and group tickets where the lead pays and teammates claim their seats by invite link. Multiple ticket types with capacity and sale windows. Custom registration questions, including file uploads and show-if logic. Coupons. Waitlists with pay-to-claim (Pro).
- Check-in: a QR pass per registration; Crew scan from the Unifesto app at as many check-in points as needed, with a duplicate guard and live attendance.
- Money: Razorpay checkout, payouts to the Space's verified bank account, refunds that need approval before money moves, per-event financials (collected, fees, refunds, net) with CSV export.
- Reach: WhatsApp confirmations and group invite links, push reminders, email campaigns, tracked short links and UTM sources. WhatsApp blasts are Pro.
- After the event: certificates from the Space's own template with public online verification (Pro); sponsor roster, sponsor portal and booth-scan lead capture (Pro); formatted PDF event reports (Pro).
- Unifesto Sprint (/sprint, Pro): hackathon teams, problem statements, rounds with weighted rubrics, judge panels, rooms with a help desk, in-app submissions, a live leaderboard and certificates.
- Unifesto Stay (/stay): room options, approvals and a Stay Pass scanned at arrival. Unifesto Huddle (/huddle, Pro): online sessions inside the app. Unifesto Orbit (/orbit): one Orbit Lead per campus helps clubs run events.
- Ticket transfer: the organiser moves a registration to another account by email.
- Plans: General, Club, Growth, Pro, Enterprise. No monthly fee; each plan has a platform fee per paid ticket, and free RSVP events cost nothing. Never quote rates; link /pricing.
- Unifesto does NOT offer quizzes, polls, live Q&A or currencies other than INR. Never claim a feature not listed here.`;

const HOUSE_RULES = `House style: Indian English spelling (organise, programme). No em dashes. Never use "delve", "testament to", "in conclusion", "in today's fast-paced world", "tapestry", "game-changer", "navigate the landscape", "unlock", "elevate". No fake friendliness ("Great question!", "Happy organising!"). Do not restate the thesis at the end.`;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const RESEARCH_SYSTEM = `You research one reader question for a blog aimed at student organisers and attendees in India. Search the web, open the most useful pages, and prefer primary sources (official guides, rules, docs) over vendor blogs. Then reply with research notes only: a flat list of facts, each one line, each ending with the exact URL it came from in parentheses. Include concrete numbers, rules and real examples where sources give them. Never add a fact you did not read in a source. If sources disagree, note both.`;

export const WRITER_SYSTEM = `You write one blog post for unifesto.app that answers a reader question better than anything else on the web.

Steps: decide the intent (explain, compare or how-to), outline for that intent, then write the post in Markdown.

The post:
- Opens with a paragraph that directly answers the question. No preamble.
- Then details, real examples and specifics from the research. Use tables where they help.
- Uses ONLY facts from the <research> notes. Every number must come from the research or be simple arithmetic on it. Cite with [n] markers that match the Sources list.
- Contains exactly one honest opinion, clearly marked as ours ("Our view:"), and one honest limitation (of the advice, the data or Unifesto) in its own short section.
- Has a "## FAQ" section with 3 to 5 questions as "### " headings, each answered in 1 to 3 sentences.
- Ends with "## Sources": a numbered list, "Title: URL", using only URLs from <sources>.
- Is at least 1,000 words before the Sources section.
- Has 3 to 5 internal links in Markdown, using only paths from <internal_links>, placed where a reader would want them. Link /blog/ posts first.
- Links the Unifesto app page given in <app_link> at most once, only where it truly helps the reader. If <app_link> is "none", do not link or pitch Unifesto at all.
- Describes Unifesto only with facts from <product_facts>.
- Does not start with an H1; the title is separate.

${HOUSE_RULES}

Also return: title (plain, under 70 characters), slug (kebab-case), metaTitle (at most 60 characters), metaDescription (at most 155 characters, states the answer), excerpt (one or two sentences), coverAlt (alt text for a branded card showing the title).

<product_facts>
${PRODUCT_FACTS}
</product_facts>`;

export const HUMANIZE_SYSTEM = `You are an editor. Rewrite the Markdown draft you are given so it does not read as AI-written, and return the full edited Markdown only.
- Make section lengths uneven: cut thin sections down, let the important ones run.
- Delete any paragraph that restates the thesis or summarises what was just said.
- Vary sentence length. Prefer plain verbs. Cut filler and hedging.
- Remove fake friendliness and hype.
${HOUSE_RULES}
Never change facts, numbers, [n] citation markers, links or link targets, headings named "## FAQ" and "## Sources", or the Sources list. Never add new facts. Keep the "Our view:" opinion and the limitation section. Keep at least as many words as you were given.`;

export const FACTCHECK_SYSTEM = `You check a blog post against its research notes. List every number, statistic, date or named rule in the post that is NOT stated in the research notes and is not simple arithmetic on numbers that are. Ignore numbers inside URLs, FAQ question wording and the Sources list. Return an empty list if everything is supported.`;

export const QUESTIONS_SYSTEM = `You suggest reader questions for the unifesto.app blog: real questions that student organisers, club leads, hackathon organisers and attendees in India type into Google or ask ChatGPT, phrased the way they would ("how do I...", "X vs Y", "... reddit"). Each question must be answerable with web research and must not duplicate an existing question or post. For each give: question; topic (short kebab-case, shared by near-duplicate questions); intent (explain, compare or how-to); angle (which Unifesto feature honestly helps, from <product_facts>, or null if none); appLink (one of the allowed app pages, or null).

<product_facts>
${PRODUCT_FACTS}
</product_facts>`;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['explain', 'compare', 'how-to'] },
    outline: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    slug: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    excerpt: { type: 'string' },
    coverAlt: { type: 'string' },
    markdown: { type: 'string' },
  },
  required: ['intent', 'outline', 'title', 'slug', 'metaTitle', 'metaDescription', 'excerpt', 'coverAlt', 'markdown'],
  additionalProperties: false,
};

export const FACTCHECK_SCHEMA = {
  type: 'object',
  properties: { unsupported: { type: 'array', items: { type: 'string' } } },
  required: ['unsupported'],
  additionalProperties: false,
};

export const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          topic: { type: 'string' },
          intent: { type: 'string', enum: ['explain', 'compare', 'how-to'] },
          angle: { type: ['string', 'null'] },
          appLink: { type: ['string', 'null'] },
        },
        required: ['question', 'topic', 'intent', 'angle', 'appLink'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

export const RESEARCH_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 },
];

export interface Draft {
  intent: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  coverAlt: string;
  markdown: string;
}

export interface QuestionSuggestion {
  question: string;
  topic: string;
  intent: string;
  angle: string | null;
  appLink: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every URL the research call actually read, from its server-tool result blocks. */
export function researchSources(content: Anthropic.ContentBlock[]): { title: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const b of content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) seen.set(normUrl(r.url), r.title);
    }
    if (b.type === 'web_fetch_tool_result' && b.content.type === 'web_fetch_result') {
      const url = normUrl(b.content.url);
      if (!seen.has(url)) seen.set(url, b.content.content.title ?? url);
    }
  }
  return [...seen].map(([url, title]) => ({ url, title }));
}

export const normUrl = (u: string) => u.trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);

/** Words in the body, Sources excluded. */
export function wordCount(markdown: string): number {
  const body = markdown.split(/^##\s+Sources\b/m)[0];
  return body.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'in', 'on', 'and', 'or', 'is', 'how', 'do', 'i', 'what', 'vs', 'my', 'your', 'with', 'at', 'it']);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)));

/** Jaccard overlap of two titles' content words, 0..1. */
export function titleOverlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const inter = [...x].filter((w) => y.has(w)).length;
  const union = new Set([...x, ...y]).size;
  return union ? inter / union : 0;
}

// ponytail: word-overlap duplicate check; switch to embeddings if near-dupes slip through
export const DUPLICATE_OVERLAP = 0.6;

const PLACEHOLDER = /\b(TODO|TBD|lorem ipsum)\b|\[(insert|add|placeholder|citation needed|link)[^\]]*\]|\{\{|\bX{2,}\b|<[A-Z][A-Z_ ]+>/i;
const BANNED = /\bdelv(e|es|ing)\b|testament to|in conclusion|in today's (fast-paced|digital)|\btapestry\b|game[- ]changer/i;

export interface GateInput {
  draft: Draft;
  /** Normalised URLs the research read. */
  sourceUrls: Set<string>;
  /** Published posts: slug + title. */
  posts: { slug: string; title: string }[];
}

/** Null when the draft passes; otherwise why it failed. Numbers are checked separately by FACTCHECK. */
export function gate({ draft, sourceUrls, posts }: GateInput): string | null {
  const md = draft.markdown;
  const n = wordCount(md);
  if (n < MIN_WORDS) return `only ${n} words`;
  if (PLACEHOLDER.test(md) || PLACEHOLDER.test(draft.title)) return 'has a placeholder';
  if (BANNED.test(md)) return `banned phrase: ${md.match(BANNED)![0]}`;
  if (!draft.metaTitle || draft.metaTitle.length > 60) return 'meta title missing or over 60';
  if (!draft.metaDescription || draft.metaDescription.length > 155) return 'meta description missing or over 155';
  if (!draft.coverAlt) return 'no alt text';

  const faq = md.split(/^##\s+FAQ\b/m)[1]?.split(/^##\s/m)[0] ?? '';
  if ((faq.match(/^###\s+/gm) ?? []).length < 2) return 'FAQ has fewer than 2 questions';

  const sources = md.split(/^##\s+Sources\b/m)[1] ?? '';
  const cited = [...sources.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) => normUrl(m[0]));
  if (cited.length < 2) return 'fewer than 2 sources';
  const invented = cited.find((u) => !sourceUrls.has(u));
  if (invented) return `source not from research: ${invented}`;

  const slugs = new Set(posts.map((p) => p.slug));
  const links = new Set([...md.matchAll(/\]\((\/[^)\s#?]*)/g)].map((m) => m[1].replace(/\/+$/, '')));
  let blog = 0;
  let app = 0;
  for (const l of links) {
    if (l.startsWith('/blog/')) {
      if (!slugs.has(l.slice(6))) return `link to missing post ${l}`;
      blog++;
    } else if ((APP_PAGES as readonly string[]).includes(l)) app++;
    else return `link to unknown page ${l}`;
  }
  // 3-5 links to posts plus one app link. Until there are 5 posts, app pages make up the 3.
  if (blog + app < 3 || blog + app > 6) return `${blog + app} internal links`;
  if (posts.length >= 5 ? blog < 3 || app > 1 : blog < Math.min(1, posts.length)) {
    return `${blog} post links and ${app} app links`;
  }

  const slug = slugify(draft.slug || draft.title);
  if (slugs.has(slug)) return `slug ${slug} already exists`;
  const twin = posts.find((p) => titleOverlap(p.title, draft.title) >= DUPLICATE_OVERLAP);
  if (twin) return `duplicates "${twin.title}"`;
  return null;
}

/** House style says no em dashes; fix them rather than burn a post on one. */
export const stripEmDashes = (s: string) => s.replace(/\s*—\s*/g, ', ');

/** Top blog URLs by clicks from a Search Console "Pages" CSV export. */
export function topBlogPages(csv: string, limit = 5): { slug: string; clicks: number }[] {
  const rows: { slug: string; clicks: number }[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const [url, clicks] = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const m = url?.match(/\/blog\/([a-z0-9-]+)\/?$/i);
    const c = Number(clicks);
    if (m && c > 0) rows.push({ slug: m[1].toLowerCase(), clicks: c });
  }
  return rows.sort((a, b) => b.clicks - a.clicks).slice(0, limit);
}

/** Model suggestions, checked and de-duplicated against what is already queued or written. */
export function cleanSuggestions(raw: unknown, existing: string[]): QuestionSuggestion[] {
  const list = (raw as { questions?: unknown[] })?.questions;
  if (!Array.isArray(list)) return [];
  const seen = new Set(existing.map((q) => q.trim().toLowerCase()));
  const out: QuestionSuggestion[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const question = typeof r.question === 'string' ? r.question.trim() : '';
    const topic = typeof r.topic === 'string' ? slugify(r.topic).slice(0, 80) : '';
    const intent = ['explain', 'compare', 'how-to'].includes(r.intent as string) ? (r.intent as string) : '';
    if (!question || !topic || !intent || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    const appLink = (APP_PAGES as readonly string[]).includes(r.appLink as string) ? (r.appLink as string) : null;
    const angle = typeof r.angle === 'string' && r.angle.trim() ? r.angle.trim() : null;
    out.push({ question, topic, intent, angle, appLink });
  }
  return out;
}
