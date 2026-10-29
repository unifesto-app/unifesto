import { NextResponse, type NextRequest } from "next/server";
import { PENDING_COOKIE, REFRESH_COOKIE, clearCookie, profile, refreshCookie, rotate, sameOrigin } from "@/lib/auth-server";

/**
 * K18: POST /auth/session. Pages call it once per load to get an access token
 * (kept in memory) from the refresh cookie, rotating the cookie as it goes.
 * Right after an email or phone code they post the new refresh token here
 * instead: it is rotated at once, so the copy the page saw is already spent.
 *
 * 200 { accessToken, email, fullName } | 200 { pending: { tempToken, email } }
 * (a Google account that still needs a mobile number) | 401 (signed out).
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { refreshToken?: string };
  const given = typeof body.refreshToken === "string" ? body.refreshToken : "";
  const stored = req.cookies.get(REFRESH_COOKIE)?.value ?? "";

  if (!given && !stored) {
    const pending = req.cookies.get(PENDING_COOKIE)?.value;
    if (!pending) return NextResponse.json({ message: "Signed out" }, { status: 401 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(pending);
    } catch {
      parsed = null;
    }
    // Handed over once; the phone step carries the temp token from here.
    const res = parsed ? NextResponse.json({ pending: parsed }) : NextResponse.json({ message: "Signed out" }, { status: 401 });
    clearCookie(res, PENDING_COOKIE);
    return res;
  }

  const tokens = await rotate(given || stored);
  if (!tokens) {
    const res = NextResponse.json({ message: "Signed out" }, { status: 401 });
    clearCookie(res, REFRESH_COOKIE);
    return res;
  }
  const res = NextResponse.json({ accessToken: tokens.accessToken, ...(await profile(tokens.accessToken)) });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookie);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
