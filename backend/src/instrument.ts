// Imported first by main.ts so Sentry is initialised before anything else loads.
// Load .env here too (src/env.ts, which also refuses a prod DB outside
// production): compose mounts it as a file (no env_file), and ConfigModule
// only reads it inside AppModule, after SENTRY_DSN and LOG_FORMAT were already read
// at import time (Sentry stayed off; LOG_FORMAT=json crashed boot on a missing logger).
import './env';
import { initSentry } from './common/observability';

initSentry();
