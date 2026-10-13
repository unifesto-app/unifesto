import { headers } from "next/headers";

/** Set by middleware.ts on requests that arrive on a space's custom domain. */
export const TENANT_HOST = "x-tenant-host";
export const TENANT_SPACE = "x-tenant-space";

/** The custom domain this request is on, or null on unifesto.app. */
export async function getTenant(): Promise<{ host: string; spaceSlug: string } | null> {
  const h = await headers();
  const host = h.get(TENANT_HOST);
  const spaceSlug = h.get(TENANT_SPACE);
  return host && spaceSlug ? { host, spaceSlug } : null;
}
