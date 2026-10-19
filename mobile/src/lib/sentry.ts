import * as Sentry from '@sentry/react-native';

// Errors and native crashes only, no PII: emails and Indian phone numbers are
// masked before an event leaves the device. A DSN is public, so it lives here
// rather than in .env (which would also feed the runtime fingerprint).
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+91[\s-]?|\b)[6-9]\d{9}\b/g;

Sentry.init({
  dsn: 'https://283e04f315030a1472ea513a5beac2ba@o4512283096383488.ingest.us.sentry.io/4512283128758272',
  enabled: !__DEV__,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    return JSON.parse(
      JSON.stringify(event).replace(EMAIL, '[email]').replace(PHONE, '[phone]'),
    );
  },
});
