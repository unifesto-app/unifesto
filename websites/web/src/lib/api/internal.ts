// Server-side calls skip Cloudflare + Caddy and hit the API over the private
// Docker network, tagged with a shared key so the backend doesn't put every
// SSR request into the web container's single rate-limit bucket. Only active
// when INTERNAL_API_KEY is set (server env, never in the client bundle);
// without it everything keeps using the public URL as before.
const internalKey = typeof window === "undefined" ? process.env.INTERNAL_API_KEY : undefined;

/** API base for this runtime: `API_INTERNAL_URL` on the server when keyed, else `publicUrl`. */
export function apiBase(publicUrl: string): string {
  return internalKey && process.env.API_INTERNAL_URL ? process.env.API_INTERNAL_URL : publicUrl;
}

/** Adds `x-internal-key` to a server-side request. No-op in the browser. */
export function withInternal(init: RequestInit = {}): RequestInit {
  if (!internalKey) return init;
  const headers = new Headers(init.headers);
  headers.set("x-internal-key", internalKey);
  return { ...init, headers };
}
