/*
 * D15 desk copilot eval: runs the labelled cases in desk-eval.cases.json
 * through the production draft and summary prompts and checks each output
 * against its labels (must / must-not patterns) plus house rules (no em
 * dashes, short). Calls the real API (well under a cent a run), so it needs
 * ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/desk-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd } from '../src/ai/ai.service';
import { draftRequest, summaryRequest, type CopilotCase } from '../src/support/support-copilot';

interface EvalCase {
  id: string;
  task: 'draft' | 'summary';
  case: CopilotCase;
  /** Each a case-insensitive regex that must match. */
  mustInclude: string[];
  mustNotInclude: string[];
}

/** House rules every output must keep. */
function ruleMisses(task: EvalCase['task'], text: string): string[] {
  const misses: string[] = [];
  if (text.includes('—')) misses.push('em dash');
  const words = text.split(/\s+/).length;
  if (task === 'summary' && words > 110) misses.push(`${words} words`);
  if (task === 'draft' && words > 160) misses.push(`${words} words`);
  if (/\b(AI|language model|facts block|instructions)\b/.test(text)) misses.push('mentions internals');
  return misses;
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'desk-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  let passed = 0;
  let checks = 0;
  let hits = 0;
  let cost = 0;
  let cacheRead = 0;

  // One at a time so each system prompt is cached after its first case.
  for (const c of cases) {
    const req = c.task === 'draft' ? draftRequest(c.case) : summaryRequest(c.case);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES.desk.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    cacheRead += res.usage.cache_read_input_tokens ?? 0;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (res.stop_reason !== 'end_turn' || !text) {
      console.log(`✗ ${c.id}: no answer (${res.stop_reason})`);
      checks += c.mustInclude.length + c.mustNotInclude.length + 1;
      continue;
    }
    const misses = [
      ...c.mustInclude.filter((p) => !new RegExp(p, 'i').test(text)).map((p) => `missing /${p}/`),
      ...c.mustNotInclude.filter((p) => new RegExp(p, 'i').test(text)).map((p) => `has /${p}/`),
    ];
    const rules = ruleMisses(c.task, text);
    checks += c.mustInclude.length + c.mustNotInclude.length + 1;
    hits += c.mustInclude.length + c.mustNotInclude.length - misses.length + (rules.length ? 0 : 1);
    misses.push(...rules);
    if (!misses.length) passed++;
    console.log(`${misses.length ? '✗' : '✓'} ${c.id} (${c.task})${misses.length ? `: ${misses.join(', ')}` : ''}\n  ${text.replace(/\n/g, '\n  ')}\n`);
  }

  console.log(`${passed}/${cases.length} cases clean, ${hits}/${checks} checks`);
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
