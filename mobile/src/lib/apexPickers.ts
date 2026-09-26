import { searchEvents, searchSpaces, searchUsers } from './api/apex';
import type { PickerItem } from '../components/apex/EntityPickerRow';

/*
 * Server searches shaped for EntityPickerRow. First page only: the picker is a
 * typeahead, so a sharper query beats scrolling.
 */

export async function pickUsers(q: string): Promise<PickerItem[]> {
  const res = await searchUsers(q);
  if (!res.ok) return [];
  return res.data.users.map((u) => ({
    id: u.id,
    title: u.fullName || (u.username ? `@${u.username}` : 'Unnamed'),
    subtitle: [u.username ? `@${u.username}` : null, u.email || u.mobileNumber].filter(Boolean).join(' · ') || undefined,
  }));
}

export async function pickSpaces(q: string): Promise<PickerItem[]> {
  const res = await searchSpaces(q);
  if (!res.ok) return [];
  return res.data.spaces.map((s) => ({ id: s.id, title: s.name, subtitle: `@${s.slug} · ${s.member_count} members` }));
}

export async function pickEvents(q: string): Promise<PickerItem[]> {
  const res = await searchEvents({ search: q });
  if (!res.ok) return [];
  return res.data.events.map((e) => ({
    id: e.id,
    title: e.title,
    subtitle: [e.space?.name, `${e._count.registrations} registrations`].filter(Boolean).join(' · '),
  }));
}
