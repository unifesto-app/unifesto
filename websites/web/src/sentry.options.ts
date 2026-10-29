// Shared by instrumentation.ts (server) and instrumentation-client.ts (browser).
// Errors only, no PII: emails and Indian phone numbers are masked before an
// event leaves the process. Without NEXT_PUBLIC_SENTRY_DSN the SDK is a no-op.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+91[\s-]?|\b)[6-9]\d{9}\b/g;

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend<T>(event: T): T {
    // The public site and the console (Track V) share this project; `surface` tells them apart.
    const e = event as { request?: { url?: string }; tags?: Record<string, unknown> };
    const path = (() => {
      try {
        return new URL(e.request?.url ?? "", "https://www.unifesto.app").pathname;
      } catch {
        return "";
      }
    })();
    e.tags = { ...e.tags, surface: path === "/console" || path.startsWith("/console/") ? "console" : "public" };
    return JSON.parse(
      JSON.stringify(event).replace(EMAIL, "[email]").replace(PHONE, "[phone]"),
    );
  },
};
