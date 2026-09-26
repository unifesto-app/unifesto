import { API_URL } from '../constants';
import { getToken, refreshAccessToken } from './helpers';
import type { Result } from './manageEvent';

export interface UploadFile {
  field: string;
  uri: string;
  name: string;
  type: string;
}

/**
 * POST a multipart form: one file plus plain text fields. Goes around
 * makeAuthenticatedRequest on purpose: that helper forces a JSON
 * Content-Type, and multipart needs React Native to write its own header with
 * the boundary. Retries once after a silent token refresh, like the helper.
 */
export async function postMultipart<T>(path: string, file: UploadFile, fields: Record<string, string> = {}): Promise<Result<T>> {
  const send = (token: string) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    body.append(file.field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return fetch(`${API_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  };

  try {
    const token = await getToken();
    if (!token) return { ok: false, denied: false, message: 'Sign in again to upload' };
    let res = await send(token);
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) res = await send(fresh);
    }
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    const message: string = (Array.isArray(json?.message) ? json.message[0] : json?.message) || 'Upload failed';
    return { ok: false, denied: res.status === 403, message };
  } catch {
    return { ok: false, denied: false, message: 'No connection' };
  }
}

/** POST one picked image to a multipart endpoint under `field`. */
export function uploadImage<T>(path: string, field: string, uri: string): Promise<Result<T>> {
  const name = uri.split('/').pop() || 'image.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return postMultipart<T>(path, { field, uri, name, type });
}
