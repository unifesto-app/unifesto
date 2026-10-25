// Loads env before anything else (imported first by instrument.ts). A laptop's
// .env.local (dev values) wins over .env; dotenv never overrides a variable that
// is already set. Then refuses to boot against the prod database outside production.
import { config } from 'dotenv';
import { assertNoProdDbOutsideProd } from './common/prod-db-guard';

config({ path: ['.env.local', '.env'], quiet: true });
assertNoProdDbOutsideProd();
