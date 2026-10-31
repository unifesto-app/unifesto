import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, PENDING_COOKIE, api, clearCookie, safeNext, setRefresh, shortCookie } from "@/lib/auth-server";
import { COGNITO_CLIENT_ID, COGNITO_DOMAIN, COGNITO_REDIRECT_URI } from "@/lib/cognito";

interface CognitoLogin {
  accessToken?: string;
  refreshToken?: string;
  requiresMobileVerification?: boolean;
  tempToken?: string;
}

/**
 * K18: GET /auth/callback, where Cognito returns after Google or Apple. Checks the
 * state, swaps the code (with the PKCE verifier) for an ID token, signs in
 * through POST /auth/cognito like the app, and keeps the refresh token in the
 * httpOnly cookie. Tokens never appear in a URL.
 */
export async function GET(req: NextRequest) {
  let flow: { verifier: string; state: string; next: string } | null = null;
  try {
    flow = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "");
  } catch {
    flow = null;
  }
  const next = safeNext(flow?.next);
  const back = (error?: string) => {
    const url = new URL(next, req.url);
    if (error) url.searchParams.set("signin_error", error);
    // Relative: standalone Next's req.url carries its bind address (0.0.0.0:3000), not ours.
    const res = new NextResponse(null, { status: 307, headers: { Location: url.pathname + url.search + url.hash } });
    clearCookie(res, OAUTH_COOKIE);
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  // Cancelled on Google, or a stale/forged callback.
  if (!flow || !code || !state || state !== flow.state) return back(req.nextUrl.searchParams.get("error") ? "cancelled" : "google");

  try {
    const tokenRes = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: COGNITO_CLIENT_ID,
        code,
        redirect_uri: COGNITO_REDIRECT_URI,
        code_verifier: flow.verifier,
      }).toString(),
      cache: "no-store",
    });
    const { id_token: idToken } = (await tokenRes.json().catch(() => ({}))) as { id_token?: string };
    if (!tokenRes.ok || !idToken) return back("google");

    const { status, data } = await api<CognitoLogin>("/auth/cognito", {
      method: "POST",
      body: { idToken },
      userAgent: req.headers.get("user-agent"),
    });
    if (status !== 200 && status !== 201) return back("google");

    const res = back();
    if (data.accessToken && data.refreshToken) {
      setRefresh(res, data.refreshToken);
    } else if (data.requiresMobileVerification && data.tempToken) {
      // New to Unifesto: the page asks for a mobile number next (/auth/session hands this over once).
      const email = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).email ?? "";
      res.cookies.set(PENDING_COOKIE, JSON.stringify({ tempToken: data.tempToken, email }), shortCookie);
    } else {
      return back("google");
    }
    return res;
  } catch {
    return back("google");
  }
}
