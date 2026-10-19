import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.options";

export function register() {
  Sentry.init(sentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
