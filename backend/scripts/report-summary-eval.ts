/*
 * M3 post-event report summary eval: runs the labelled cases in
 * report-summary-eval.cases.json through the production facts builder and
 * prompt, then checks each summary against its labels (must / must-not
 * patterns) plus house rules. The key rule: every number in the summary must
 * appear in the facts, so the model never changes or computes a figure. Calls
 * the real API (well under a cent a run), so it needs ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/report-summary-eval.ts   (-T: tsc already type-checks it)
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AI_FEATURES, AI_MODEL, aiCostUsd } from '../src/ai/ai.service';
import { reportSummaryFacts, reportSummaryRequest, type ReportSummaryInput } from '../src/reports/report-summary';

interface EvalCase {
  id: string;
  /** Dates as ISO strings; revived below. */
  input: ReportSummaryInput;
  /** Each a case-insensitive regex that must match. */
  mustInclude: string[];
  mustNotInclude: string[];
}

/** Every number as written, commas dropped, so "₹1,23,456" and "123456" compare equal. */
const numbers = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));

/** House rules every summary must keep. */
function ruleMisses(text: string, facts: string[]): string[] {
  const misses: string[] = [];
  if (text.includes('—')) misses.push('em dash');
  const words = text.split(/\s+/).length;
  if (words > 130) misses.push(`${words} words`);
  if (/\b(AI|language model|facts block|instructions)\b/.test(text)) misses.push('mentions internals');
  if (/^#|\n\s*[-*] /m.test(text)) misses.push('markdown');
  const allowed = new Set(numbers(facts.join('\n')));
  const invented = numbers(text).filter((n) => !allowed.has(n));
  if (invented.length) misses.push(`numbers not in facts: ${invented.join(', ')}`);
  return misses;
}

function revive(i: ReportSummaryInput): ReportSummaryInput {
  const d = (v: Date | string | null) => (v == null ? null : new Date(v));
  return {
    ...i,
    event: { ...i.event, startDateTime: d(i.event.startDateTime)!, endDateTime: d(i.event.endDateTime)! },
    window: { from: d(i.window.from), to: d(i.window.to) },
  };
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, 'report-summary-eval.cases.json'), 'utf8')) as EvalCase[];
  const client = new Anthropic();
  let passed = 0;
  let checks = 0;
  let hits = 0;
  let cost = 0;
  let cacheRead = 0;

  // One at a time so the system prompt is cached after the first case.
  for (const c of cases) {
    const facts = reportSummaryFacts(revive(c.input));
    const req = reportSummaryRequest(facts);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES.report_summary.maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    cacheRead += res.usage.cache_read_input_tokens ?? 0;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    checks += c.mustInclude.length + c.mustNotInclude.length + 1;
    if (res.stop_reason !== 'end_turn' || !text) {
      console.log(`✗ ${c.id}: no answer (${res.stop_reason})`);
      continue;
    }
    const misses = [
      ...c.mustInclude.filter((p) => !new RegExp(p, 'i').test(text)).map((p) => `missing /${p}/`),
      ...c.mustNotInclude.filter((p) => new RegExp(p, 'i').test(text)).map((p) => `has /${p}/`),
    ];
    const rules = ruleMisses(text, facts);
    hits += c.mustInclude.length + c.mustNotInclude.length - misses.length + (rules.length ? 0 : 1);
    misses.push(...rules);
    if (!misses.length) passed++;
    console.log(`${misses.length ? '✗' : '✓'} ${c.id}${misses.length ? `: ${misses.join(', ')}` : ''}\n  ${text.replace(/\n/g, '\n  ')}\n`);
  }

  console.log(`${passed}/${cases.length} cases clean, ${hits}/${checks} checks`);
  console.log(`cost $${cost.toFixed(5)}, cache-read tokens ${cacheRead}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
