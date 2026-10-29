import { EventStatus, PaymentStatus, RegistrationStatus, SupportMessageSide, SupportTicketStatus } from '@prisma/client';
import { bookingFacts, describeBooking } from './case-facts';
import {
  BOT_SYSTEM,
  BOT_TOOLS,
  GUEST_BOT_TOOLS,
  HANDOFF_LINE,
  SupportBot,
  actionCard,
  botHistory,
  botTurn,
  ungrounded,
  type BotIo,
} from './support-bot';
import type { AiResult, AiService } from '../ai/ai.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupportService } from './support.service';

const toolCall = (name: string, input: Record<string, string>, id = name): AiResult => ({
  ok: true,
  text: '',
  toolUse: true,
  content: [{ type: 'tool_use', id, name, input, caller: { type: 'direct' } } as any],
});
const answer = (text: string): AiResult => ({ ok: true, text, toolUse: false, content: [] });

const facts = bookingFacts(
  {
    id: 'r1',
    status: RegistrationStatus.REGISTERED,
    paymentStatus: PaymentStatus.PAID,
    totalAmount: '520',
    processingFee: '20',
    refundedAmount: '0',
    event: { title: 'Workshop', status: EventStatus.PUBLISHED, startDateTime: new Date('2099-01-01'), endDateTime: new Date('2099-01-01') },
    addons: [],
    openRefund: null,
  },
  new Date('2026-11-01'),
);

/** D14: the bot only reads and proposes; code decides what a card may offer; failures go to a person. */
describe('Assist bot (D14)', () => {
  it('keeps tools and prompt stable, and guests get no account tools', () => {
    expect(BOT_SYSTEM.length).toBeGreaterThan(2600);
    expect(BOT_SYSTEM).not.toMatch(/—/);
    expect(BOT_TOOLS.every((t) => t.strict)).toBe(true);
    expect(GUEST_BOT_TOOLS.map((t) => t.name)).toEqual(['event_faq', 'search_help', 'handoff']);
  });

  it('runs tools, collects code-made cards and returns the answer', async () => {
    const replies = [toolCall('booking_facts', { registrationId: 'r1' }), toolCall('propose_action', { action: 'REQUEST_REFUND', registrationId: 'r1' }), answer('Confirm the card to request ₹500.')];
    const io: BotIo = {
      call: jest.fn(async () => replies.shift()!),
      exec: jest.fn(async (name, input) =>
        name === 'propose_action' ? actionCard(input.action as any, facts) : { registrationId: 'r1', facts: describeBooking(facts) },
      ),
    };
    const turn = await botTurn([{ role: 'user', content: 'refund?' }], false, io);
    expect(turn).toMatchObject({ text: 'Confirm the card to request ₹500.', handoff: null, tools: ['booking_facts', 'propose_action'] });
    expect(turn.actions).toEqual([{ type: 'REQUEST_REFUND', registrationId: 'r1', eventTitle: 'Workshop', label: 'Request a refund of up to ₹500' }]);
    // The model is told the card was shown, never handed the card itself.
    const last = (io.call as jest.Mock).mock.calls[2][0].messages.at(-1).content[0];
    expect(last).toMatchObject({ type: 'tool_result', content: '{"shown":true}' });
  });

  it('stops on handoff, on AI failure, and after too many steps; tool errors go back to the model', async () => {
    const exec = jest.fn(async () => {
      throw new Error('No booking with that id');
    });
    expect(await botTurn([], false, { call: async () => toolCall('handoff', { reason: 'wants a person' }), exec: async () => ({}) })).toMatchObject({
      text: null,
      handoff: 'wants a person',
    });
    expect(await botTurn([], false, { call: async () => ({ ok: false, reason: 'disabled' }), exec })).toMatchObject({ text: null, handoff: null });
    const loop = jest.fn(async () => toolCall('booking_facts', { registrationId: 'x' }));
    expect(await botTurn([], false, { call: loop, exec })).toMatchObject({ text: null });
    expect(loop).toHaveBeenCalledTimes(6);
    expect((loop.mock.calls as any)[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });

  it('holds a reply whose amount, link, email or phone no tool gave, and hands it to a person', async () => {
    const said = [
      { role: 'user' as const, content: 'My ₹5,000 refund, call me on 98765 43210 or a@b.com' },
      { role: 'assistant' as const, content: 'Your booking was ₹1,25,000.' },
      { role: 'user' as const, content: [{ type: 'tool_result' as const, tool_use_id: 't', content: JSON.stringify({ facts: describeBooking(facts), faq: 'Mail help@fest.in, call +91 90000-11111, see https://fest.in/map' }) }] },
    ];
    // Grounded: amounts from facts (any formatting) or an earlier Assist reply, links/contacts a tool returned.
    for (const ok of ['You can get ₹500 back; you paid Rs. 520 incl. ₹20.', 'That was 125000 rupees.', 'See https://unifesto.app/help/refunds or www.fest.in/map.', 'Mail help@fest.in or call 9000011111.', 'Banks take 5 to 7 working days, by 01-01-2099.'])
      expect(ungrounded(ok, said)).toBeNull();
    // Only the person said these, or nobody did.
    expect(ungrounded('Your ₹5,000 refund is approved.', said)).toBe('amount "₹5,000" is not in the facts');
    expect(ungrounded('You get INR 499.', said)).toMatch(/amount/);
    expect(ungrounded('Pay at https://rzp.io/x', said)).toBe('link to rzp.io is not from a tool');
    expect(ungrounded('We will mail a@b.com', said)).toBe('email address is not from a tool');
    expect(ungrounded('We will call +91 98765 43210', said)).toBe('phone number is not from a tool');

    const replies = [toolCall('booking_facts', { registrationId: 'r1' }), answer('Your ₹5,000 refund is on its way.')];
    const turn = await botTurn([{ role: 'user', content: 'refund?' }], false, {
      call: async () => replies.shift()!,
      exec: async () => ({ facts: describeBooking(facts) }),
    });
    expect(turn).toMatchObject({ text: null, held: { why: 'amount "₹5,000" is not in the facts', draft: 'Your ₹5,000 refund is on its way.' } });

    const { bot, prisma, support } = setup(answer('Your ₹5,000 refund is approved.'));
    await bot.say('t1', 'u1', 'help');
    expect(prisma.supportMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ body: expect.stringContaining('passed it to a person') }) });
    expect(support.handoff).toHaveBeenCalledWith('t1', 'u1', 'reply held, amount "₹5,000" is not in the facts. Draft: Your ₹5,000 refund is approved.');
  });

  it('cards follow the booking facts, not the model', () => {
    const ended = { ...facts, refund: { canRequest: false, why: 'the event has ended, so refund requests are closed' }, cancel: { canCancel: false, why: 'the event has started' } };
    expect(actionCard('REQUEST_REFUND', ended)).toEqual({ shown: false, why: 'A refund is not allowed: the event has ended, so refund requests are closed' });
    expect(actionCard('CANCEL_BOOKING', facts)).toMatchObject({ card: { label: 'Cancel and request a refund of up to ₹500' } });
  });

  it('builds history from the person and the bot only, starting with the person', () => {
    const h = botHistory(
      [
        { side: SupportMessageSide.ASSISTANT, internal: false, body: 'orphan' },
        { side: SupportMessageSide.REQUESTER, internal: false, body: 'a' },
        { side: SupportMessageSide.REQUESTER, internal: false, body: 'b' },
        { side: SupportMessageSide.SYSTEM, internal: true, body: 'note' },
        { side: SupportMessageSide.ASSISTANT, internal: false, body: 'c' },
        { side: SupportMessageSide.REQUESTER, internal: false, body: 'd' },
      ],
      '(ctx)',
    );
    expect(h).toEqual([
      { role: 'user', content: '(ctx)\n\na\n\nb' },
      { role: 'assistant', content: 'c' },
      { role: 'user', content: 'd' },
    ]);
  });

  function setup(result: AiResult) {
    const prisma = {
      supportTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          requesterId: 'u1',
          eventId: null,
          registrationId: null,
          event: null,
          messages: [{ side: SupportMessageSide.REQUESTER, internal: false, body: 'help' }],
        }),
        findUnique: jest.fn().mockResolvedValue({ requesterId: 'u1', status: SupportTicketStatus.BOT }),
        update: jest.fn(),
      },
      supportMessage: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const support = { addMessage: jest.fn(), handoff: jest.fn(), createTicket: jest.fn() } as unknown as SupportService;
    const ai = { run: jest.fn().mockResolvedValue(result) } as unknown as AiService;
    return { bot: new SupportBot(prisma, ai, support), prisma, support, ai };
  }

  it('a failed turn hands the chat to a person with a fixed line (D7)', async () => {
    const { bot, prisma, support } = setup({ ok: false, reason: 'disabled' });
    await bot.say('t1', 'u1', 'help');
    expect(prisma.supportMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ side: SupportMessageSide.ASSISTANT, body: expect.stringContaining('passed it to a person') }),
    });
    expect(support.handoff).toHaveBeenCalledWith('t1', 'u1', 'Assist had no answer');
  });

  it('only the requester talks to their bot chat, and guests cannot use account tools', async () => {
    const { bot } = setup(answer('hi'));
    await expect(bot.say('t1', 'someone-else', 'x')).rejects.toThrow('Support ticket not found');
    await expect(bot.exec('u1', true, 'my_bookings', {})).rejects.toThrow('Not available');
    expect(HANDOFF_LINE).not.toMatch(/—/);
  });
});
