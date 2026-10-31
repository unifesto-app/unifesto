// Loads env before anything else (imported first by instrument.ts). A laptop's
// .env.local (dev values) wins over .env; dotenv never overrides a variable that
// is already set. Then refuses to boot against the prod database outside production.
import { config } from 'dotenv';
import { assertNoProdDbOutsideProd } from './common/prod-db-guard';

// NODE_ENV as the shell or container set it, read before dotenv: a laptop .env
// that says "production" must not switch the guard off (J14, 28 Oct).
const nodeEnv = process.env.NODE_ENV;
config({ path: ['.env.local', '.env'], quiet: true });
assertNoProdDbOutsideProd({ ...process.env, NODE_ENV: nodeEnv });
