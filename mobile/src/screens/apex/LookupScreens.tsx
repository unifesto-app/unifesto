import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { searchEvents, searchSpaces, searchUsers, type AdminEventRow, type AdminSpaceRow, type AdminUserRow } from '../../lib/api/apex';
import { titleCase } from '../../lib/apexQueues';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, shortDate } from '../../components/apex/ApexRow';
import ChipPicker from '../../components/manage/ChipPicker';
import { inrShort } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { useCosmos } from '../../theme/cosmos';

/*
 * Read-only platform lookups: users, spaces, events. Each list pushes to its
 * detail screen under /apex/{users,spaces,events}/[id].
 */

const userName = (u: { fullName: string | null; username: string | null }) => u.fullName || (u.username ? `@${u.username}` : 'Unnamed');

export function UsersLookupScreen() {
  const router = useRouter();
  const fetchPage = useCallback(async (search: string, page: number) => {
    const r = await searchUsers(search, page);
    return r.ok ? { ok: true as const, data: { items: r.data.users, total: r.data.pagination.total } } : r;
  }, []);
  return (
    <SearchList<AdminUserRow>
      placeholder="Name, username, email or phone"
      noun={['user', 'users']}
      fetchPage={fetchPage}
      keyOf={(u) => u.id}
      renderItem={(u) => (
        <ApexRow
          imageUrl={u.avatarUrl}
          title={userName(u)}
          meta={[u.username ? `@${u.username}` : null, u.email || u.mobileNumber].filter(Boolean).join('  ·  ')}
          value={u.roles.includes('ADMIN') ? 'Admin' : undefined}
          onPress={() => router.push(`/apex/users/${u.id}`)}
        />
      )}
    />
  );
}

export function SpacesLookupScreen() {
  const router = useRouter();
  const c = useCosmos();
  const fetchPage = useCallback(async (search: string, page: number) => {
    const r = await searchSpaces(search, page);
    return r.ok ? { ok: true as const, data: { items: r.data.spaces, total: r.data.pagination.total } } : r;
  }, []);
  return (
    <SearchList<AdminSpaceRow>
      placeholder="Space name or slug"
      noun={['space', 'spaces']}
      fetchPage={fetchPage}
      keyOf={(s) => s.id}
      renderItem={(s) => (
        <ApexRow
          imageUrl={s.logo_url}
          title={s.name}
          meta={[s.city, `${s.member_count} people`, s.parentSpace ? `in ${s.parentSpace.name}` : null].filter(Boolean).join('  ·  ')}
          value={s.status === 'ACTIVE' ? undefined : titleCase(s.status)}
          valueColor={s.status === 'SUSPENDED' || s.status === 'REJECTED' ? c.danger : c.warn}
          onPress={() => router.push(`/apex/spaces/${s.id}`)}
        />
      )}
    />
  );
}

const EVENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Live' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function EventsLookupScreen() {
  const router = useRouter();
  const c = useCosmos();
  const [status, setStatus] = useState('');
  // New identity per filter → SearchList reloads from page 1.
  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await searchEvents({ search, status: status || undefined, page });
      return r.ok ? { ok: true as const, data: { items: r.data.events, total: r.data.pagination.total } } : r;
    },
    [status],
  );
  return (
    <SearchList<AdminEventRow>
      placeholder="Event title or slug"
      noun={['event', 'events']}
      fetchPage={fetchPage}
      keyOf={(e) => e.id}
      header={
        <View style={{ marginTop: spacing[3] }}>
          <ChipPicker options={EVENT_FILTERS} value={status} onChange={setStatus} />
        </View>
      }
      renderItem={(e) => (
        <ApexRow
          title={e.title}
          meta={[e.space?.name, shortDate(e.startDateTime), `${e._count?.registrations ?? 0} reg`].filter(Boolean).join('  ·  ')}
          value={e.sales?.grossSales ? inrShort(e.sales.grossSales) : titleCase(e.status)}
          valueColor={e.sales?.grossSales ? c.text : undefined}
          onPress={() => router.push(`/apex/events/${e.id}`)}
        />
      )}
    />
  );
}
