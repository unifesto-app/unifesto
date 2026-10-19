/*
 * D14 Assist bot eval: runs the labelled chats in bot-eval.cases.json through
 * the production prompt, tools and loop (botTurn), with tool results from the
 * fixtures below, and checks which tools ran, the action card, handoff and the
 * reply text. Calls the real API (about a cent a run), so it needs
 * ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/bot-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd, type AiResult } from '../src/ai/ai.service';
import { botTurn, type BotActionType } from '../src/support/support-bot';

interface EvalCase {
  id: string;
  guest?: boolean;
  context?: string;
  chat: string[];
  expect: {
    tools?: string[];
    /** null: no card; omitted: not checked. */
    action?: BotActionType | null;
    handoff?: boolean;
    mustInclude?: string[];
    mustNotInclude?: string[];
  };
}

/** One person's account, as the tools would return it. */
const BOOKINGS = [
  ['r-ui', 'e-ui', 'UI Design Workshop', 'PUBLISHED', '2026-11-12', 'REGISTERED', 'PAID'],
  ['r-meetup', 'e-meetup', 'Hyderabad Startup Meetup', 'COMPLETED', '2026-10-02', 'NO_SHOW', 'PAID'],
  ['r-oss', 'e-oss', 'Open Source Saturday', 'PUBLISHED', '2026-11-15', 'REGISTERED', 'PAID'],
  ['r-fest', 'e-fest', 'Campus Fest 2026', 'PUBLISHED', '2026-11-20', 'REGISTERED', 'PAID'],
  ['r-fest-pass', 'e-fest', 'Campus Fest 2026', 'PUBLISHED', '2026-11-20', 'REGISTERED', 'PENDING'],
  ['r-design', 'e-design', 'Design Summit', 'PUBLISHED', '2026-11-25', 'REGISTERED', 'PAID'],
  ['r-hack', 'e-hack', 'HackHyd 2026', 'PUBLISHED', '2026-11-08', 'REGISTERED', 'PAID'],
].map(([registrationId, eventId, event, eventStatus, startsAt, status, paymentStatus]) => ({
  registrationId,
  eventId,
  event,
  eventStatus,
  startsAt,
  status,
  paymentStatus,
}));

/** describeBooking() output per booking, and which cards code would allow. */
const FACTS: Record<string, { facts: string[]; allow: BotActionType[]; refundable?: string }> = {
  'r-ui': {
    facts: [
      'Event: UI Design Workshop (published), 12 Nov 2026 to 12 Nov 2026',
      'Booking: registered, payment paid',
      'Paid ₹520 incl. ₹20 processing fee (never refundable); refunded so far ₹0; refundable now ₹500',
      'Refund request: allowed, up to ₹500, until the event ends (12 Nov 2026)',
      'Cancel: allowed, as a refund request for up to ₹500; the booking is cancelled once the refund is approved',
    ],
    allow: ['REQUEST_REFUND', 'CANCEL_BOOKING'],
    refundable: '₹500',
  },
  'r-meetup': {
    facts: [
      'Event: Hyderabad Startup Meetup (completed), 2 Oct 2026 to 2 Oct 2026',
      'Booking: no_show, payment paid',
      'Paid ₹299 incl. ₹9 processing fee (never refundable); refunded so far ₹0; refundable now ₹290',
      'Refund request: not allowed, the event has ended, so refund requests are closed',
      'Cancel: not allowed, the event has started',
    ],
    allow: [],
  },
  'r-oss': {
    facts: [
      'Event: Open Source Saturday (published), 15 Nov 2026 to 15 Nov 2026',
      'Booking: registered, payment paid',
      'Refund request: not allowed, it is a free booking, so there is nothing to refund',
      'Cancel: allowed, right away from the ticket',
    ],
    allow: ['CANCEL_BOOKING'],
  },
  'r-fest': {
    facts: [
      'Event: Campus Fest 2026 (published), 20 Nov 2026 to 22 Nov 2026',
      'Booking: registered, payment paid',
      'Paid ₹1,050 incl. ₹50 processing fee (never refundable); refunded so far ₹0; refundable now ₹1,000',
      'Refund request: not allowed, a refund request is already open',
      'Open refund request: with the organiser, for ₹1,000',
      'Cancel: not allowed, a refund request is already open',
    ],
    allow: [],
  },
  'r-fest-pass': {
    facts: [
      'Event: Campus Fest 2026 (published), 20 Nov 2026 to 22 Nov 2026',
      'Booking: registered, payment pending',
      'Refund request: not allowed, only paid bookings can be refunded',
      'Cancel: allowed, right away from the ticket',
    ],
    allow: ['CANCEL_BOOKING'],
  },
  'r-design': {
    facts: [
      'Event: Design Summit (published), 25 Nov 2026 to 25 Nov 2026',
      'Booking: registered, payment paid',
      'Paid ₹510 incl. ₹10 processing fee (never refundable); refunded so far ₹0; refundable now ₹500',
      'Refund request: allowed, up to ₹500, until the event ends (25 Nov 2026)',
      'Cancel: allowed, as a refund request for up to ₹500; the booking is cancelled once the refund is approved',
    ],
    allow: ['REQUEST_REFUND', 'CANCEL_BOOKING'],
    refundable: '₹500',
  },
  'r-hack': {
    facts: [
      'Event: HackHyd 2026 (published), 8 Nov 2026 to 9 Nov 2026',
      'Booking: registered, payment paid',
      'Paid ₹105 incl. ₹5 processing fee (never refundable); refunded so far ₹0; refundable now ₹100',
      'Refund request: allowed, up to ₹100, until the event ends (9 Nov 2026)',
      'Cancel: allowed, as a refund request for up to ₹100; the booking is cancelled once the refund is approved',
    ],
    allow: ['REQUEST_REFUND', 'CANCEL_BOOKING'],
    refundable: '₹100',
  },
};

const FAQ: Record<string, { question: string; answer: string }[]> = {
  'e-hack': [
    { question: 'When does check-in open?', answer: 'Check-in opens at 8:00 AM on 8 Nov; the opening ceremony starts at 9:00 AM.' },
    { question: 'Is food provided?', answer: 'Yes. Breakfast, lunch, dinner and midnight snacks are provided for registered participants.' },
    { question: 'What should I bring?', answer: 'Your laptop, charger and a government ID.' },
  ],
};

const HELP = [
  {
    title: 'Transferring a ticket',
    url: 'https://unifesto.app/help/transferring-a-ticket',
    text: 'You can transfer a ticket to someone else from the ticket in the app: open the ticket, choose Transfer, and enter their email. They need a Unifesto account. Some organisers turn transfers off.',
  },
  {
    title: 'How refunds work',
    url: 'https://unifesto.app/help/how-refunds-work',
    text: 'Only the ticket price is refundable; the booking processing fee is not. Request a refund from the ticket in the app before the event ends. The organiser reviews it first, then Unifesto approves and returns it to your original payment method, usually in 5 to 7 working days.',
  },
];

function exec(name: string, input: Record<string, string>): unknown {
  switch (name) {
    case 'my_bookings':
      return BOOKINGS;
    case 'booking_facts': {
      const f = FACTS[input.registrationId];
      if (!f) throw new Error('No booking with that id for this person. Use my_bookings.');
      return { registrationId: input.registrationId, facts: f.facts };
    }
    case 'propose_action': {
      const f = FACTS[input.registrationId];
      if (!f) throw new Error('No booking with that id for this person. Use my_bookings.');
      const type = input.action as BotActionType;
      if (!f.allow.includes(type)) return { shown: false, why: 'Not allowed for this booking' };
      const event = BOOKINGS.find((b) => b.registrationId === input.registrationId)!.event;
      return { card: { type, registrationId: input.registrationId, eventTitle: event, label: type } };
    }
    case 'event_faq':
      return FAQ[input.eventId] ?? { none: 'This event has no published FAQ.' };
    case 'search_help':
      return HELP.filter((h) =>
        input.query
          .toLowerCase()
          .split(/\W+/)
          .some((w) => w.length > 3 && (h.title + h.text).toLowerCase().includes(w.replace(/s$/, ''))),
      );
    case 'handoff':
      return { ok: true };
  }
  throw new Error(`Unknown tool ${name}`);
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'bot-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  let clean = 0;
  let checks = 0;
  let hits = 0;
  let cost = 0;
  let cacheRead = 0;
  let calls = 0;

  for (const c of cases) {
    const call = async (req: Parameters<Parameters<typeof botTurn>[2]['call']>[0]): Promise<AiResult> => {
      calls++;
      const res = await client.messages.create({
        model: AI_MODEL,
        max_tokens: AI_FEATURES.bot.maxTokens,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: req.messages,
        tools: req.tools,
        output_config: req.outputConfig,
      });
      cost += aiCostUsd(res.usage);
      cacheRead += res.usage.cache_read_input_tokens ?? 0;
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      if (res.stop_reason === 'tool_use') return { ok: true, text, content: res.content, toolUse: true };
      if (res.stop_reason === 'end_turn' && text) return { ok: true, text, content: res.content, toolUse: false };
      return { ok: false, reason: res.stop_reason === 'refusal' ? 'refused' : 'error' };
    };
    const messages: Anthropic.MessageParam[] = c.chat.map((m, i) => ({
      role: 'user',
      content: i === 0 && c.context ? `${c.context}\n\n${m}` : m,
    }));
    const turn = await botTurn(messages, !!c.guest, { call, exec: async (n, i) => exec(n, i) });

    const e = c.expect;
    const text = turn.text ?? '';
    const misses: string[] = [];
    const check = (ok: boolean, what: string) => {
      checks++;
      if (ok) hits++;
      else misses.push(what);
    };
    for (const t of e.tools ?? []) check(turn.tools.includes(t), `no ${t}`);
    if (e.action !== undefined)
      check(e.action === null ? !turn.actions.length : turn.actions.some((a) => a.type === e.action), `action ${e.action}→${turn.actions.map((a) => a.type).join(',') || 'none'}`);
    if (e.handoff !== undefined) check(!!turn.handoff === e.handoff, `handoff ${e.handoff}→${!!turn.handoff}`);
    if (!turn.handoff) {
      check(!!text, 'no answer');
      for (const p of e.mustInclude ?? []) check(new RegExp(p, 'i').test(text), `missing /${p}/`);
      for (const p of e.mustNotInclude ?? []) check(!new RegExp(p, 'i').test(text), `has /${p}/`);
      check(!text.includes('—'), 'em dash');
    }
    if (!misses.length) clean++;
    console.log(
      `${misses.length ? '✗' : '✓'} ${c.id} [${turn.tools.join(' ')}]${turn.actions.length ? ` cards: ${turn.actions.map((a) => a.type).join(',')}` : ''}${turn.handoff ? ` handoff: ${turn.handoff}` : ''}${misses.length ? `\n  ✗ ${misses.join(', ')}` : ''}\n  ${text.replace(/\n/g, '\n  ')}\n`,
    );
  }

  console.log(`${clean}/${cases.length} chats clean, ${hits}/${checks} checks, ${calls} model calls`);
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
