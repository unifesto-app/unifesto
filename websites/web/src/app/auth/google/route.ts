import { createHash, randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, safeNext, shortCookie } from "@/lib/auth-server";
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, COGNITO_REDIRECT_URI, googleSignInEnabled } from "@/lib/cognito";
import { isOwnHost } from "@/lib/own-host";

const b64url = (b: Buffer) => b.toString("base64url");

/** K18: GET /auth/google?next=/path. Starts Google sign-in on Cognito's hosted UI. */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  // Cognito can't list every white-label domain, so they keep the email code.
  if (!googleSignInEnabled || !isOwnHost(host)) return NextResponse.redirect(new URL(next, req.url));

  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const url = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: "openid email profile phone",
    identity_provider: "Google",
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ verifier, state, next }), shortCookie);
  return res;
}
