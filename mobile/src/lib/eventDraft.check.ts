/**
 * Self-check for the create-form rules (no test runner in this app). Run:
 *   npx tsc src/lib/eventDraft.check.ts --ignoreConfig --noCheck --outDir /tmp/edc --module commonjs --target es2020 --skipLibCheck && node /tmp/edc/eventDraft.check.js
 */
import { FIELD_STEP, emptyEventDraft, eventDraftToPayload, parseDraft, serializeDraft, splitTags, validateEventDraft } from './eventDraft';

const assert = {
  ok(v: unknown, msg = 'expected truthy') {
    if (!v) throw new Error(msg);
  },
  equal(a: unknown, b: unknown) {
    if (a !== b) throw new Error(`${String(a)} !== ${String(b)}`);
  },
  deepEqual(a: unknown, b: unknown) {
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  },
};

const base = { ...emptyEventDraft(), title: 'Demo night' };

// Blank draft points at the name, on the first step.
const blank = validateEventDraft(emptyEventDraft(), true);
assert.equal(blank?.field, 'title');
assert.equal(FIELD_STEP[blank!.field], 0);

assert.equal(validateEventDraft(base, true), null);
assert.equal(validateEventDraft({ ...base, end: base.start }, true)?.field, 'end');
assert.equal(validateEventDraft({ ...base, type: 'ONLINE', onlineUrl: 'meet' }, true)?.field, 'onlineUrl');
assert.equal(validateEventDraft({ ...base, registrationType: 'TICKETED', ticketPrice: '' }, true)?.field, 'ticketPrice');
assert.equal(validateEventDraft({ ...base, ticketCapacity: '0' }, true)?.field, 'ticketCapacity');
// Ticket fields only matter on create.
assert.equal(validateEventDraft({ ...base, slug: 'demo', ticketName: '' }, false), null);

// Autosave round-trip keeps Dates as Dates; junk is rejected.
const back = parseDraft(serializeDraft(base))!;
assert.ok(back.start instanceof Date && back.start.getTime() === base.start.getTime());
assert.equal(back.title, 'Demo night');
assert.equal(parseDraft('{'), null);
assert.equal(parseDraft('{"start":"nope","end":"nope"}'), null);

assert.deepEqual(splitTags(' tech, ,Tech , workshop,'), ['tech', 'workshop']);

// Categories: old single-category autosaves migrate; payload carries the list.
const legacy = JSON.stringify({ ...JSON.parse(serializeDraft(base)), categories: undefined, category: 'Tech' });
assert.deepEqual(parseDraft(legacy)!.categories, ['Tech']);
assert.equal('category' in parseDraft(legacy)!, false);
assert.deepEqual(eventDraftToPayload({ ...base, categories: ['Tech', 'Music'] }).categories, ['Tech', 'Music']);
assert.equal('categories' in eventDraftToPayload(base), false);

console.log('eventDraft ok');
