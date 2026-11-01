/*
 * Shared runner for the AI3 risk-screen and AI19 broadcast-check evals: each
 * case is sent through the production prompt and scored on whether it was
 * flagged, and (for flags) whether the expected signal is among those named.
 * The score that matters before switching a check on: every bad case caught,
 * and no good case flagged.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AI_FEATURES, AI_MODEL, aiCostUsd, type AiFeature } from '../src/ai/ai.service';
import { parseRiskVerdict, type RiskSignal, type RiskVerdict } from '../src/ai/risk';
import type { AiRunInput } from '../src/ai/ai.service';

export interface RiskEvalCase<T> {
  id: string;
  input: T;
  flag: boolean;
  /** For a flag: a signal the verdict should name. */
  signal?: RiskSignal;
}

export async function runRiskEval<T>(
  feature: AiFeature,
  cases: RiskEvalCase<T>[],
  toRequest: (input: T) => Pick<AiRunInput, 'system' | 'messages' | 'outputConfig'>,
): Promise<void> {
  const client = new Anthropic();
  let caught = 0;
  let falseFlags = 0;
  let signals = 0;
  let cost = 0;
  const bad = cases.filter((c) => c.flag).length;

  // One at a time so the system prompt is cached after the first case.
  for (const c of cases) {
    const req = toRequest(c.input);
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_FEATURES[feature].maxTokens,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: req.outputConfig,
    });
    cost += aiCostUsd(res.usage);
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    let v: RiskVerdict | null = null;
    try {
      v = res.stop_reason === 'end_turn' ? parseRiskVerdict(JSON.parse(text)) : null;
    } catch {
      /* unparseable: no verdict */
    }
    if (!v) {
      console.log(`✗ ${c.id}: no verdict (${res.stop_reason})`);
      continue;
    }
    const right = v.flag === c.flag;
    if (c.flag && v.flag) caught++;
    if (!c.flag && v.flag) falseFlags++;
    const signalOk = !c.flag || !c.signal || v.signals.includes(c.signal);
    if (c.flag && v.flag && signalOk) signals++;
    console.log(
      `${right && signalOk ? '✓' : '✗'} ${c.id}: ${v.flag ? `flag [${v.signals.join(', ')}] ${v.reason}` : 'clear'}${
        !right ? ` (expected ${c.flag ? 'flag' : 'clear'})` : !signalOk ? ` (expected ${c.signal})` : ''
      }`,
    );
  }
  console.log(
    `${caught}/${bad} bad caught, ${falseFlags}/${cases.length - bad} good flagged, ${signals}/${bad} with the expected signal; cost $${cost.toFixed(4)}`,
  );
}
