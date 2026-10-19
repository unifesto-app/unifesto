// Imported first by main.ts so Sentry is initialised before anything else loads.
// In prod backend/.env is mounted as /app/.env (not env_file), so nothing is in
// process.env until it's loaded; load it here, before SENTRY_DSN and AppModule's
// LOG_FORMAT check read it, rather than waiting for ConfigModule.forRoot().
import 'dotenv/config';
import { initSentry } from './common/observability';

initSentry();
