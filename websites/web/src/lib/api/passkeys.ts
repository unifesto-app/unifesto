import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { call, type AuthResponse } from "@/lib/api/registration";

/* Passkeys: sign in with Face ID, a fingerprint or a screen lock. The same endpoints the app uses. */

export interface Passkey {
  id: string;
  /** Where I added it: "Chrome on macOS", "iPhone". */
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** I closed the passkey sheet, or a newer request replaced this one: nothing to report. */
export const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/**
 * Sign in with any passkey of mine. `autofill` waits for one picked from the
 * email field's suggestions instead of opening the sheet; a later call cancels it.
 */
export async function signInWithPasskey(autofill = false): Promise<AuthResponse> {
  const optionsJSON = await call<PublicKeyCredentialRequestOptionsJSON>("POST", "/auth/passkeys/sign-in/options");
  const answer = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
  return call<AuthResponse>("POST", "/auth/passkeys/sign-in", answer);
}

export const getPasskeys = (token: string) => call<Passkey[]>("GET", "/auth/passkeys", undefined, token);

/** This device makes a passkey for my account, then it's saved. */
export async function addPasskey(token: string): Promise<Passkey> {
  const optionsJSON = await call<PublicKeyCredentialCreationOptionsJSON>("POST", "/auth/passkeys/register/options", undefined, token);
  const answer = await startRegistration({ optionsJSON });
  return call<Passkey>("POST", "/auth/passkeys/register", answer, token);
}

export const removePasskey = (token: string, id: string) => call("DELETE", `/auth/passkeys/${id}`, undefined, token);
