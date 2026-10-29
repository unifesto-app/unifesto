import { createHash, randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, safeNext, shortCookie } from "@/lib/auth-server";
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, COGNITO_REDIRECT_URI, appleSignInEnabled, googleSignInEnabled } from "@/lib/cognito";
import { isOwnHost } from "@/lib/own-host";

const b64url = (b: Buffer) => b.toString("base64url");

/** Our path → Cognito's identity provider name, and whether it's switched on. */
const PROVIDERS: Record<string, { idp: string; enabled: boolean }> = {
  google: { idp: "Google", enabled: googleSignInEnabled },
  apple: { idp: "SignInWithApple", enabled: appleSignInEnabled },
};

/**
 * K18: GET /auth/google|apple?next=/path. Starts sign-in on Cognito's hosted
 * UI with that provider; /auth/callback finishes it the same way for both.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = PROVIDERS[(await params).provider];
  if (!provider) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  // Cognito can't list every white-label domain, so they keep the email code.
  // Relative: standalone Next's req.url carries its bind address (0.0.0.0:3000), not ours.
  if (!provider.enabled || !isOwnHost(host)) return new NextResponse(null, { status: 307, headers: { Location: next } });

  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const url = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: "openid email profile phone",
    identity_provider: provider.idp,
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ verifier, state, next }), shortCookie);
  return res;
}
