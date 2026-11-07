/*
 * C17 Write with AI eval: runs the labelled cases in comms-draft-eval.cases.json
 * through the production prompt, parser and AI10 check, then checks each draft
 * against its labels (should it draft at all, must / must-not patterns) plus
 * house rules (no em dashes, push within what a phone shows, nothing AI10
 * would leave out, no link it wasn't given).
 * Calls the real API (about a cent a run), so it needs ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/comms-draft-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd } from '../src/ai/ai.service';
import {
  commsDraftRequest,
  commsDraftSource,
  groundCommsDraft,
  parseCommsDraft,
  type CommsDraft,
  type CommsDraftInput,
} from '../src/campaigns/campaign-draft';

interface EvalCase {
  id: string;
  input: CommsDraftInput;
  /** false: the line has nothing to make a message from. */
  drafts: boolean;
  /** Each a case-insensitive regex over the whole draft. */
  mustInclude?: string[];
  mustNotInclude?: string[];
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'comms-draft-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  let passed = 0;
  let cost = 0;
  let cacheRead = 0;

  // One at a time so the system prompt is cached after the first case.
  for (const c of cases) {
    const req = commsDraftRequest(c.input);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES.comms_draft.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    cacheRead += res.usage.cache_read_input_tokens ?? 0;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    let draft: CommsDraft | null = null;
    if (res.stop_reason === 'end_turn') {
      try {
        draft = parseCommsDraft(JSON.parse(text), c.input);
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
      // What production would leave out (AI10).
      misses.push(...groundCommsDraft(draft, commsDraftSource(c.input)).dropped.map((d) => `dropped ${d}`));
      const given = `${c.input.line} ${c.input.event?.link ?? ''}`;
      for (const link of all.match(/https?:\/\/[^\s"<]+|www\.[^\s"<]+|\b[a-z0-9-]+\.(?:ly|gl|io|co|in|com)\/[^\s"<]*/gi) ?? []) {
        if (!given.includes(link.replace(/^https?:\/\//, '').replace(/[.,)]+$/, ''))) misses.push(`invented link ${link}`);
      }
      if (c.input.whatsapp && draft.whatsappParams?.length !== c.input.whatsapp.paramCount) misses.push('whatsapp values');
    }
    if (!misses.length) passed++;
    console.log(`${misses.length ? '✗' : '✓'} ${c.id}${misses.length ? `: ${misses.join(', ')}` : ''}`);
    if (draft?.push) console.log(`  push: ${draft.push.title} / ${draft.push.body}`);
    if (draft?.email) console.log(`  email: ${draft.email.subject}\n  ${draft.email.html.replace(/<\/p><p>/g, '\n  ').replace(/<\/?p>/g, '')}`);
    if (draft?.whatsappParams) console.log(`  whatsapp: ${JSON.stringify(draft.whatsappParams)}`);
    if (draft) console.log('');
  }

  console.log(`${passed}/${cases.length} cases clean`);
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
