/*
 * M1 event draft eval: runs the labelled cases in event-draft-eval.cases.json
 * through the production prompt and validator, then checks each draft against
 * its labels (should it draft at all, must / must-not patterns, agenda size)
 * plus house rules (no em dashes, no links or phone numbers it wasn't given).
 * Calls the real API (about a cent a run), so it needs ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/event-draft-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd } from '../src/ai/ai.service';
import { eventDraftRequest, parseEventDraft, type EventDraft, type EventDraftInput } from '../src/events/event-draft';

interface EvalCase {
  id: string;
  input: EventDraftInput;
  /** false: the model should say there is nothing to draft from. */
  drafts: boolean;
  /** Each a case-insensitive regex over the whole draft. */
  mustInclude?: string[];
  mustNotInclude?: string[];
  minAgenda?: number;
  maxAgenda?: number;
  minFaqs?: number;
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'event-draft-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  let passed = 0;
  let cost = 0;
  let cacheRead = 0;

  // One at a time so the system prompt is cached after the first case.
  for (const c of cases) {
    const req = eventDraftRequest(c.input);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES.event_draft.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    cacheRead += res.usage.cache_read_input_tokens ?? 0;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    // A refusal on garbage counts as "did not draft", which is what we want there.
    let draft: EventDraft | null = null;
    if (res.stop_reason === 'end_turn') {
      try {
        draft = parseEventDraft(JSON.parse(text), c.input.days);
      } catch {
        /* unparseable: no draft */
      }
    }

    const misses: string[] = [];
    if (!!draft !== c.drafts) misses.push(c.drafts ? `no draft (${res.stop_reason})` : 'drafted from nothing');
    if (draft) {
      const all = JSON.stringify(draft);
      misses.push(
        ...(c.mustInclude ?? []).filter((p) => !new RegExp(p, 'i').test(all)).map((p) => `missing /${p}/`),
        ...(c.mustNotInclude ?? []).filter((p) => new RegExp(p, 'i').test(all)).map((p) => `has /${p}/`),
      );
      if (all.includes('—')) misses.push('em dash');
      const given = `${c.input.notes ?? ''} ${c.input.pageText ?? ''}`;
      for (const link of all.match(/https?:\/\/[^\s"]+|www\.[^\s"]+/g) ?? []) {
        if (!given.includes(link.replace(/[.,)]+$/, ''))) misses.push(`invented link ${link}`);
      }
      if (c.minAgenda !== undefined && draft.agenda.length < c.minAgenda) misses.push(`agenda ${draft.agenda.length} < ${c.minAgenda}`);
      if (c.maxAgenda !== undefined && draft.agenda.length > c.maxAgenda) misses.push(`agenda ${draft.agenda.length} > ${c.maxAgenda}`);
      if (c.minFaqs !== undefined && draft.faqs.length < c.minFaqs) misses.push(`faqs ${draft.faqs.length} < ${c.minFaqs}`);
    }
    if (!misses.length) passed++;
    console.log(`${misses.length ? '✗' : '✓'} ${c.id}${misses.length ? `: ${misses.join(', ')}` : ''}`);
    if (draft) {
      console.log(`  ${draft.description.replace(/\n/g, '\n  ')}`);
      for (const a of draft.agenda) console.log(`  [d${a.day} ${a.start ?? '--:--'}-${a.end ?? '--:--'}] ${a.title}`);
      for (const f of draft.faqs) console.log(`  Q: ${f.question} A: ${f.answer}`);
      console.log('');
    }
  }

  console.log(`${passed}/${cases.length} cases clean`);
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
