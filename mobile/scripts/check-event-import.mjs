// Self-check for src/lib/eventImport.ts. Node 22 strips the TS types itself.
//   node scripts/check-event-import.mjs          offline asserts only
//   node scripts/check-event-import.mjs <url>…   also import live pages and print what came back
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The app's imports have no extension; resolve them to .ts like Metro does.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, next) {
      try { return await next(s, c); } catch (e) { if (s.startsWith('.')) return next(s + '.ts', c); throw e; }
    }`),
);
const m = await import('../src/lib/eventImport.ts');

assert.equal(m.sourceOf('lu.ma'), 'Luma');
assert.equal(m.sourceOf('www.meetup.com'), 'Meetup');
assert.equal(m.sourceOf('unstop.com'), 'Unstop');
assert.equal(m.sourceOf('devnovate.co'), 'Devnovate');
assert.equal(m.sourceOf('example.org'), 'Website');
assert.equal(m.normalizeUrl('Join me lu.ma/abc123 !')?.toString(), 'https://lu.ma/abc123');
assert.equal(m.normalizeUrl('not a link'), null);
assert.equal(m.unstopId(new URL('https://unstop.com/hackathons/iot-hackathon-1369976')), '1369976');
assert.equal(m.devnovateName(new URL('https://devnovate.co/event/respawn')), 'respawn');
assert.equal(m.decodeEntities('Tom &amp; Jerry&#x27;s &#8377;'), "Tom & Jerry's ₹");
assert.equal(m.htmlToText('<p>Hi&nbsp;there</p><ul><li>One</li></ul>'), 'Hi there\n\n• One');

const page = `<head><meta property="og:image" content="https://x/og.jpg"><script type="application/ld+json">
  {"@graph":[{"@type":"Organization"},{"@type":["SocialEvent"],"name":"Demo &amp; Day","startDate":"2026-10-21T17:00:00+05:30",
  "eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode",
  "location":{"@type":"Place","name":"Hall","address":{"addressLocality":"Hyderabad","addressRegion":"telangana"},"geo":{"latitude":17.4,"longitude":78.4}},
  "offers":[{"price":"499","priceCurrency":"INR"},{"price":"0"}]}]}</script></head>`;
const [ev, ...more] = m.findJsonLdEvents(page);
assert.equal(more.length, 0);
const { patch } = m.fromJsonLd(ev);
assert.equal(patch.title, 'Demo & Day');
assert.equal(patch.type, 'IN_PERSON');
assert.equal(patch.state, 'Telangana');
assert.equal(patch.registrationType, 'TICKETED');
assert.equal(patch.ticketPrice, '499');
assert.equal(patch.end - patch.start, 2 * 3600_000, 'missing end → start + 2h');
assert.equal(m.fromMeta(page).imageUrl, 'https://x/og.jpg');
assert.equal(m.fromMeta('<title>Launch night | Acme</title>').patch.title, 'Launch night');
const dv = m.fromDevnovate({ name: 'R', startDate: '2026-10-13', endDate: '2026-10-16', status: 'ONLINE', paid: true, price: 200 });
assert.equal(dv.patch.start.getHours(), 10, 'date-only reads as local 10:00');
assert.equal(dv.patch.type, 'ONLINE');
assert.equal(dv.patch.ticketPrice, '200');
console.log('offline checks passed');

for (const url of process.argv.slice(2)) {
  try {
    const r = await m.importEvent(url);
    const { description, ...rest } = r.patch;
    console.log(`\n${r.source} ✓ ${url}\n`, { ...rest, description: description?.slice(0, 60), imageUrl: r.imageUrl });
  } catch (e) {
    console.log(`\n✗ ${url}: ${e.message}`);
    process.exitCode = 1;
  }
}
