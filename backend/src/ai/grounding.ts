/**
 * AI10 output check, shared by every drafting feature: each amount, date,
 * link, email and phone number in the model's text must appear in the source
 * the feature gave it. The caller decides what counts as source (the bot
 * leaves out the person's own messages, so "my ₹5,000 refund" can't be echoed
 * back as a promise) and what a failure does: hold the reply, or drop that
 * field. Returns why the text can't go out, or null.
 */

const AMOUNT = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:rupees|rupaye|rupay)\b/gi;
const LINK = /\bhttps?:\/\/([^\s/?#)\]]+)|\bwww\.([^\s/?#)\]]+)/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s-]{8,}\d/g;
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
/** "14 Nov", "14th of November", "Nov 14", 14/11/2026 (day first, as in India), 2026-11-14 (with or without a time). */
const DATE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}(?![a-z])` +
    `|\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b` +
    `|\\b(\\d{1,2})[/.-](\\d{1,2})[/.-](?:\\d{4}|\\d{2})\\b` +
    `|\\b(\\d{4})-(\\d{2})-(\\d{2})(T[\\d:.]+(?:Z|[+-]\\d{2}:?\\d{2})?)?`,
  'gi',
);
/** The day DATE misses in a range: "14-15 Nov" (and "14th & 15th November") gives 14 Nov, "Nov 14-15" gives 15 Nov. */
const RANGE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|&|and)\\s*\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}(?![a-z])` +
    `|\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*(?:-|–|to|&|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`,
  'gi',
);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const num = (s: string) => Number(s.replace(/,/g, ''));
const key = (day: number, month: number) => (day >= 1 && day <= 31 && month >= 1 && month <= 12 ? `${day}/${month}` : null);

/** Day/month keys of every date in the text. An ISO time counts as both its UTC and its IST day. */
function dates(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(DATE)) {
    const keys = m[1]
      ? [key(+m[1], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1)]
      : m[3]
        ? [key(+m[4], MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1)]
        : m[5]
          ? [key(+m[5], +m[6])]
          : [key(+m[9], +m[8])];
    if (m[10]) {
      const ist = new Date(m[0]).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-');
      if (ist.length === 3) keys.push(key(+ist[2], +ist[1]));
    }
    for (const k of keys) if (k && !out.has(k)) out.set(k, m[0].trim().replace(/\.$/, ''));
  }
  for (const m of text.matchAll(RANGE)) {
    const k = m[1] ? key(+m[1], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1) : key(+m[4], MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1);
    if (k && !out.has(k)) out.set(k, m[0].trim());
  }
  return out;
}

export function ungrounded(text: string, source: string): string | null {
  const seen = source.toLowerCase();
  // ponytail: any number in the source counts (₹2099 passes if a year 2099 is there); tighten to ₹-marked numbers if held drafts show misses.
  const amounts = new Set((seen.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(num));
  for (const m of text.matchAll(AMOUNT)) {
    if (!amounts.has(num(m[1] ?? m[2]))) return `amount "${m[0].trim()}" is not in the source`;
  }
  const seenDates = dates(source);
  for (const [k, said] of dates(text)) {
    if (!seenDates.has(k)) return `date "${said}" is not in the source`;
  }
  for (const m of text.matchAll(LINK)) {
    const host = (m[1] ?? m[2]).toLowerCase().replace(/[.,;:!]+$/, '').replace(/^www\./, '');
    if (!/(^|\.)unifesto\.app$/.test(host) && !seen.includes(host)) return `link to ${host} is not in the source`;
  }
  for (const m of text.matchAll(EMAIL)) {
    if (!seen.includes(m[0].toLowerCase())) return 'email address is not in the source';
  }
  const seenDigits = seen.replace(/[\s-]/g, '');
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 10 && !seenDigits.includes(digits.slice(-10))) return 'phone number is not in the source';
  }
  return null;
}
