import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { getTicketStats, listAllTickets, PRIORITY_LABEL, type AdminTicket, type TicketStats } from '../../lib/api/apexSupport';
import { CATEGORY_LABEL, type SupportTicketStatus } from '../../lib/api/support';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, whenShort } from '../../components/apex/ApexRow';
import ChipPicker from '../../components/manage/ChipPicker';
import ManageStats from '../../components/manage/ManageStats';
import { spacing } from '../../theme/spacing';

type Filter = SupportTicketStatus | 'mine' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'OPEN', label: 'Needs reply' },
  { value: 'PENDING', label: 'Waiting on them' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'all', label: 'All' },
];

export const personName = (p?: { fullName: string | null; username: string | null } | null) =>
  p?.fullName || (p?.username ? `@${p.username}` : 'Someone');

/**
 * Apex support inbox: every ticket raised by attendees and spaces. OPEN means
 * the requester spoke last (it needs us); a staff reply moves it to PENDING.
 */
export default function SupportInboxScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [stats, setStats] = useState<TicketStats | null>(null);
  useAnalyticsScreenTracking('ApexSupport');

  // Counts move as tickets are answered; refresh when coming back from a thread.
  useFocusEffect(
    useCallback(() => {
      void getTicketStats().then((r) => r.ok && setStats(r.data));
    }, []),
  );

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listAllTickets({
        status: filter === 'all' || filter === 'mine' ? undefined : filter,
        assignedToId: filter === 'mine' ? user?.id : undefined,
        search,
        page,
      });
      return r.ok ? { ok: true as const, data: { items: r.data.tickets, total: r.data.pagination.total } } : r;
    },
    [filter, user?.id],
  );

  return (
    <SearchList<AdminTicket>
      placeholder="Subject or ticket number"
      noun={['ticket', 'tickets']}
      fetchPage={fetchPage}
      keyOf={(t) => t.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          <ManageStats
            loading={!stats}
            stats={[
              { label: 'Needs reply', value: stats?.open ?? 0 },
              { label: 'Waiting on them', value: stats?.pending ?? 0 },
              { label: 'Resolved', value: stats?.resolved ?? 0 },
            ]}
          />
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
        </View>
      }
      renderItem={(t) => {
        const urgent = t.priority === 'HIGH' || t.priority === 'URGENT';
        return (
          <ApexRow
            title={`#${t.ticketNumber} ${t.subject}`}
            meta={[t.space?.name ?? personName(t.requester), CATEGORY_LABEL[t.category], whenShort(t.lastMessageAt)].join('  ·  ')}
            value={urgent ? PRIORITY_LABEL[t.priority] : undefined}
            valueColor={t.priority === 'URGENT' ? tokens.danger : tokens.warning}
            unread={t.status === 'OPEN'}
            onPress={() => router.push(`/apex/support/${t.id}`)}
          />
        );
      }}
    />
  );
}
