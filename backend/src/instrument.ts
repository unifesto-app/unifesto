// Imported first by main.ts so Sentry is initialised before anything else loads.
// Load .env here too: compose mounts it as a file (no env_file), and ConfigModule
// only reads it inside AppModule, after SENTRY_DSN and LOG_FORMAT were already read
// at import time (Sentry stayed off; LOG_FORMAT=json crashed boot on a missing logger).
import 'dotenv/config';
import { initSentry } from './common/observability';

initSentry();
