import { ungrounded } from './grounding';

/** AI10: a drafting feature may only quote figures and contacts its source gave it. */
describe('ungrounded', () => {
  const source = [
    'Paid ₹1,25,000 incl. ₹20 processing fee',
    'Event: Hack Night, 14 Nov 2026 to 16 Nov 2026',
    'startsAt: 2026-11-13T18:30:00.000Z',
    'Mail help@fest.in, call +91 90000-11111, see https://fest.in/map',
  ].join('\n');

  it('passes what the source gave, in any formatting', () => {
    for (const ok of [
      'That was 125000 rupees, with Rs. 20 in fees.',
      'It starts on 14th November and ends Nov 16.',
      'Doors open 14/11/2026.',
      'See https://unifesto.app/help or www.fest.in/map.',
      'Mail help@fest.in or call 9000011111.',
      'Bring 15 marks sheets and a decent laptop in March 2026.',
    ])
      expect(ungrounded(ok, source)).toBeNull();
  });

  it('reads an ISO time as its IST day too', () => {
    // 18:30 UTC on the 13th is the 14th in India.
    expect(ungrounded('See you on 14 Nov', 'startsAt: 2026-11-13T18:30:00.000Z')).toBeNull();
  });

  it('reads both ends of a day range (AI2 posters)', () => {
    expect(ungrounded('From 2026-11-14 to 2026-11-15', 'Hack Fest, 14-15 Nov')).toBeNull();
    expect(ungrounded('From 2026-11-14 to 2026-11-15', 'Hack Fest, 14th & 15th November')).toBeNull();
    expect(ungrounded('From 2026-11-14 to 2026-11-15', 'Hack Fest, Nov 14 to 15')).toBeNull();
    expect(ungrounded('On 2026-11-13', 'Hack Fest, 14-15 Nov')).toBe('date "2026-11-13" is not in the source');
  });

  it('names the first thing the source never said', () => {
    expect(ungrounded('Entry is ₹500.', source)).toBe('amount "₹500" is not in the source');
    expect(ungrounded('Day 2 is 15 Nov.', source)).toBe('date "15 Nov" is not in the source');
    expect(ungrounded('Pay by 20/11/2026.', source)).toBe('date "20/11/2026" is not in the source');
    expect(ungrounded('Pay at https://rzp.io/x', source)).toBe('link to rzp.io is not in the source');
    expect(ungrounded('Mail a@b.com', source)).toBe('email address is not in the source');
    expect(ungrounded('Call +91 98765 43210', source)).toBe('phone number is not in the source');
  });
});
