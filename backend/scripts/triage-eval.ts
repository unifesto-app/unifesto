/*
 * D13 triage eval: runs the hand-labelled cases in triage-eval.cases.json
 * through the production prompt and reports agreement per field. Calls the
 * real API (about $0.002 a run), so it needs ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/triage-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd } from '../src/ai/ai.service';
import { triageRequest, type Triage, type TriageCase } from '../src/support/support-triage';

type Field = 'category' | 'priority' | 'routingHint' | 'language' | 'sentiment' | 'spam';
const FIELDS: Field[] = ['category', 'priority', 'routingHint', 'language', 'sentiment', 'spam'];

interface EvalCase {
  id: string;
  case: TriageCase;
  expected: Pick<Triage, Field>;
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'triage-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  const hits = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
  let failed = 0;
  let cost = 0;
  let cacheRead = 0;

  // One at a time so the system prompt is cached after the first case.
  for (const c of cases) {
    const req = triageRequest(c.case);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES.triage.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    cacheRead += res.usage.cache_read_input_tokens ?? 0;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    let got: Triage;
    try {
      if (res.stop_reason !== 'end_turn') throw new Error(res.stop_reason ?? 'no stop reason');
      got = JSON.parse(text) as Triage;
    } catch (err) {
      failed++;
      console.log(`✗ ${c.id}: no answer (${(err as Error).message})`);
      continue;
    }
    const misses = FIELDS.filter((f) => got[f] !== c.expected[f]);
    for (const f of FIELDS) if (!misses.includes(f)) hits[f]++;
    console.log(
      misses.length
        ? `✗ ${c.id}: ${misses.map((f) => `${f} ${String(c.expected[f])}→${String(got[f])}`).join(', ')} | ${got.reason}`
        : `✓ ${c.id}`,
    );
  }

  console.log(`\n${cases.length} cases, ${failed} without an answer`);
  for (const f of FIELDS) {
    console.log(`${f.padEnd(12)} ${hits[f]}/${cases.length} (${Math.round((100 * hits[f]) / cases.length)}%)`);
  }
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
