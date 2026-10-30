import { NextResponse, type NextRequest } from "next/server";
import { REFRESH_COOKIE, api, clearRefresh, sameOrigin } from "@/lib/auth-server";

/** K18: POST /auth/logout. Ends the session on the backend and drops the cookie. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  // Best effort: the cookie goes either way.
  if (token) await api("/auth/logout", { method: "POST", token, body: { refreshToken } }).catch(() => null);
  const res = new NextResponse(null, { status: 204 });
  clearRefresh(res);
  return res;
}
