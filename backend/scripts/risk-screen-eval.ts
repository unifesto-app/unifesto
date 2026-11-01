/*
 * AI3 risk screen eval: seeded good and bad spaces and first events in
 * risk-screen-eval.cases.json, through the production prompt. Run before
 * switching risk_screen on. Calls the real API (under a cent), so it needs
 * ANTHROPIC_API_KEY.
 *
 *   npx ts-node -T scripts/risk-screen-eval.ts   (-T: tsc already type-checks it)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { riskScreenRequest, type RiskListing } from '../src/ai/risk';
import { runRiskEval, type RiskEvalCase } from './risk-eval.shared';

const cases = JSON.parse(readFileSync(join(__dirname, 'risk-screen-eval.cases.json'), 'utf8')) as RiskEvalCase<RiskListing>[];
runRiskEval('risk_screen', cases, riskScreenRequest).catch((err) => {
  console.error(err);
  process.exit(1);
});
