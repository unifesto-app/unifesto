/*
 * AI19 broadcast check eval: seeded good and bad organiser messages in
 * broadcast-check-eval.cases.json, through the production prompt. Run before
 * switching broadcast_check on. Calls the real API (under a cent), so it
 * needs ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/broadcast-check-eval.ts   (-T: tsc already type-checks it)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { broadcastCheckRequest, type BroadcastMessage } from '../src/ai/risk';
import { runRiskEval, type RiskEvalCase } from './risk-eval.shared';

const cases = JSON.parse(readFileSync(join(__dirname, 'broadcast-check-eval.cases.json'), 'utf8')) as RiskEvalCase<BroadcastMessage>[];
runRiskEval('broadcast_check', cases, broadcastCheckRequest).catch((err) => {
  console.error(err);
  process.exit(1);
});
