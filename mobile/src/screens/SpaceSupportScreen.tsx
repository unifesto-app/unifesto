import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  CATEGORY_LABEL,
  DESK_STATUS_LABEL,
  KIND_LABEL,
  listSpaceDesk,
  type SupportTicket,
  type SupportTicketStatus,
} from '../lib/api/support';
import SearchList from '../components/apex/SearchList';
import { ApexRow, whenShort } from '../components/apex/ApexRow';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { personName } from '../components/support/CaseThread';
import { spacing } from '../theme/spacing';

type Filter = SupportTicketStatus | 'unread' | 'all';

// Same filters as the Space web inbox (D9).
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'OPEN', label: DESK_STATUS_LABEL.OPEN },
  { value: 'PENDING', label: DESK_STATUS_LABEL.PENDING },
  { value: 'RESOLVED', label: DESK_STATUS_LABEL.RESOLVED },
];

/**
 * The space's Assist desk (D9 on mobile): questions attendees raise about this
 * space and its events. Space Admins see every case; event support teams see
 * their events'. A case escalated to Unifesto stays listed, read-only.
 * Space Admins also get the way to ask Unifesto something about the space.
 */
export default function SpaceSupportScreen() {
  const { spaceId, admin } = useLocalSearchParams<{ spaceId: string; admin?: string }>();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');

  useAnalyticsScreenTracking('SpaceSupport');

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listSpaceDesk(spaceId, {
        status: filter === 'all' || filter === 'unread' ? undefined : filter,
        unread: filter === 'unread',
        search,
        page,
      });
      return r.ok ? { ok: true as const, data: { items: r.data.tickets, total: r.data.pagination.total } } : r;
    },
    [spaceId, filter],
  );

  return (
    <SearchList<SupportTicket>
      placeholder="Subject, #number or attendee"
      noun={['case', 'cases']}
      deniedMessage="You don't answer support for this space."
      refreshOnFocus
      fetchPage={fetchPage}
      keyOf={(t) => t.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          {admin ? (
            <SettingsGroup plain style={{ marginTop: 0 }}>
              <SettingsRow
                label="Ask Unifesto about this space"
                onPress={() => router.push({ pathname: '/manage/support/new', params: { spaceId } })}
              />
            </SettingsGroup>
          ) : null}
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
        </View>
      }
      renderItem={(t) => (
        <ApexRow
          title={`#${t.ticketNumber} ${t.subject}`}
          meta={[
            personName(t.requester),
            t.kind !== 'HELP' ? KIND_LABEL[t.kind] : CATEGORY_LABEL[t.category],
            t.desk === 'PLATFORM' ? 'With Unifesto' : DESK_STATUS_LABEL[t.status],
            whenShort(t.lastMessageAt),
          ].join('  ·  ')}
          unread={t.unread}
          onPress={() => router.push(`/manage/support/${t.id}`)}
        />
      )}
    />
  );
}
