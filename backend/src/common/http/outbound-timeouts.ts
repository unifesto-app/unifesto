/**
 * Timeouts for every outbound client (S32). Without them a hung WhatsApp,
 * Razorpay, S3, SES, Resend or LiveKit call held its request (and its DB
 * transaction, socket and memory) open until the OS gave up, minutes later.
 *
 * axios: `axios.defaults.timeout` is set in main.ts before any service is
 * constructed, so the shared instance (WhatsApp, OneSignal) and instances made
 * from it later (the Razorpay SDK's `axios.create`) all inherit it.
 */
export const OUTBOUND_TIMEOUT_MS = 15_000;

/** AWS SDK v3 shorthand for NodeHttpHandler options: connect + socket-idle limits. */
export const AWS_HTTP_TIMEOUTS = {
  requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
};

/** LiveKit server SDK clients take `requestTimeout` in seconds. */
export const LIVEKIT_CLIENT_OPTIONS = { requestTimeout: 10 };

/**
 * Reject when `promise` hasn't settled within `ms`. For SDKs with no timeout or
 * abort option (Resend): the call itself keeps running, but the caller is freed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
