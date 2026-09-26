import * as FileSystem from 'expo-file-system/legacy';
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
 * POST a multipart form: one file plus plain text fields. Uses the native
 * uploader (expo-file-system `uploadAsync`) rather than fetch + FormData: on
 * iOS the RN `{ uri, name, type }` FormData file never left the device
 * ("No connection" with nothing in api_logs), while Android's okhttp coped.
 * Retries once after a silent token refresh, like makeAuthenticatedRequest.
 */
export async function postMultipart<T>(path: string, file: UploadFile, fields: Record<string, string> = {}): Promise<Result<T>> {
  const send = (token: string) =>
    FileSystem.uploadAsync(`${API_URL}${path}`, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: file.field,
      mimeType: file.type,
      parameters: fields,
      headers: { Authorization: `Bearer ${token}` },
    });

  try {
    const token = await getToken();
    if (!token) return { ok: false, denied: false, message: 'Sign in again to upload' };
    let res = await send(token);
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) res = await send(fresh);
    }
    let json: any = null;
    try {
      json = JSON.parse(res.body);
    } catch {
      // non-JSON body (proxy error page)
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, data: json as T };
    const message: string =
      (Array.isArray(json?.message) ? json.message[0] : json?.message) ||
      (res.status === 413 ? 'Image is too large' : `Upload failed (${res.status})`);
    return { ok: false, denied: res.status === 403, message };
  } catch (e) {
    if (__DEV__) console.warn('[upload] failed', path, e);
    const detail = e instanceof Error && e.message ? e.message : 'No connection';
    return { ok: false, denied: false, message: detail };
  }
}

/** POST one picked image to a multipart endpoint under `field`. */
export function uploadImage<T>(path: string, field: string, uri: string): Promise<Result<T>> {
  const name = uri.split('/').pop() || 'image.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return postMultipart<T>(path, { field, uri, name, type });
}
