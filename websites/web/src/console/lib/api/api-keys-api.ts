/**
 * K22: a space's registration API keys (console › Settings › API).
 * Space Admins only (`space:manage-integrations`).
 */
import backendClient, { apiCall, ApiError } from "./backend-client";

export interface ApiKey {
  id: string;
  name: string;
  /** The key's first characters, e.g. "uf_live_AbC1". */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Only in the create response: the key itself, shown once. */
export type NewApiKey = ApiKey & { key: string };

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;
const base = (spaceId: string) => `/spaces/${spaceId}/api-keys`;

export function listApiKeys(spaceId: string): Result<{ enabled: boolean; keys: ApiKey[] }> {
  return apiCall(backendClient.get(base(spaceId)));
}

export function createApiKey(spaceId: string, name: string): Result<NewApiKey> {
  return apiCall(backendClient.post(base(spaceId), { name }));
}

export function revokeApiKey(spaceId: string, keyId: string): Result<{ revoked: boolean }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/${keyId}`));
}
