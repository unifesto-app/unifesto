/**
 * Self-check for number answers (no test runner in this app). Run:
 *   npx tsc src/utils/formQuestions.check.ts --ignoreConfig --noCheck --outDir /tmp/fqc --module commonjs --target es2020 --skipLibCheck && node /tmp/fqc/utils/formQuestions.check.js
 */
import { answerProblem, numberDraft } from './formQuestions';

const eq = (a: unknown, b: unknown) => {
  if (a !== b) throw new Error(`${String(a)} !== ${String(b)}`);
};
const num = (config = {}) => ({ field_type: 'number', config }) as any;

// Typing "8.5" and "-3" keystroke by keystroke keeps every step.
for (const t of ['8', '8.', '8.5', '-', '-3', '.5', '']) eq(numberDraft(t), t);
eq(numberDraft('8,5'), '8.5');
for (const t of ['8.5.', 'abc', '8-', '--3', '1e5']) eq(numberDraft(t), null);

// CGPA 8.5 and negatives pass; limits still apply; a lone "-" doesn't.
eq(answerProblem(num({ min: 0, max: 10 }), '8.5'), null);
eq(answerProblem(num(), '-3'), null);
eq(answerProblem(num({ max: 10 }), '10.5'), 'must be at most 10');
eq(answerProblem(num(), '-'), 'must be a number');

console.log('formQuestions.check: ok');
