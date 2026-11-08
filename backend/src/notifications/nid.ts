/**
 * C19: which message a tap or click came from, so a booking it led to can be
 * credited to it. `<channel>:<ref>`: p push, i in-app copy, e email. The ref
 * is the channel campaign id (push_campaigns / email_campaigns, or the
 * campaigns row for an in-app-only campaign) or, for automatic sends, the
 * delivery kind. The app and website hand it back opaque with the order.
 */
export type NidChannel = 'p' | 'i' | 'e';

export const NID_PATTERN = /^[pie]:[\w.-]{1,64}$/;

export const nid = (channel: NidChannel, ref: string): string => `${channel}:${ref.slice(0, 64)}`;

/** The nid on a link into Unifesto's own site (an email click); other sites' links are left alone. */
export function withNid(url: string, id: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== 'unifesto.app' && !u.hostname.endsWith('.unifesto.app')) return url;
    u.searchParams.set('nid', id);
    return u.toString();
  } catch {
    return url;
  }
}
