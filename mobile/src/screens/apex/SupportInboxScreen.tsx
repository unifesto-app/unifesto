import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { getTicketStats, listAllTickets, PRIORITY_LABEL, type AdminTicket, type TicketStats } from '../../lib/api/apexSupport';
import {
  CATEGORY_LABEL,
  DESK_STATUS_LABEL,
  KIND_LABEL,
  type SupportCaseKind,
  type SupportDesk,
  type SupportTicketStatus,
} from '../../lib/api/support';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, whenShort } from '../../components/apex/ApexRow';
import ChipPicker from '../../components/manage/ChipPicker';
import ManageStats from '../../components/manage/ManageStats';
import { personName } from '../../components/support/CaseThread';
import { spacing } from '../../theme/spacing';

type Filter = SupportTicketStatus | 'unread' | 'mine' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'OPEN', label: DESK_STATUS_LABEL.OPEN },
  { value: 'unread', label: 'Unread' },
  { value: 'PENDING', label: DESK_STATUS_LABEL.PENDING },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'all', label: 'All' },
];

const KINDS = (Object.keys(KIND_LABEL) as SupportCaseKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));
export const DESK_LABEL: Record<SupportDesk, string> = { PLATFORM: 'Unifesto', SPACE: 'Space desk' };
const DESKS = (Object.keys(DESK_LABEL) as SupportDesk[]).map((d) => ({ value: d, label: DESK_LABEL[d] }));

/**
 * Apex Assist inbox (D8 on mobile): every case, on either desk. OPEN means the
 * requester spoke last (the desk owes a reply); a desk reply moves it to
 * PENDING. Kind and desk filters are optional; tap the chosen one to clear it.
 */
export default function SupportInboxScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [kind, setKind] = useState<SupportCaseKind | ''>('');
  const [desk, setDesk] = useState<SupportDesk | ''>('');
  const [stats, setStats] = useState<TicketStats | null>(null);
  useAnalyticsScreenTracking('ApexSupport');

  // Counts move as cases are answered; refresh when coming back from a thread.
  useFocusEffect(
    useCallback(() => {
      void getTicketStats().then((r) => r.ok && setStats(r.data));
    }, []),
  );

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listAllTickets({
        status: filter === 'all' || filter === 'mine' || filter === 'unread' ? undefined : filter,
        assignedToId: filter === 'mine' ? user?.id : undefined,
        unread: filter === 'unread',
        kind: kind || undefined,
        desk: desk || undefined,
        search,
        page,
      });
      return r.ok ? { ok: true as const, data: { items: r.data.tickets, total: r.data.pagination.total } } : r;
    },
    [filter, kind, desk, user?.id],
  );

  return (
    <SearchList<AdminTicket>
      placeholder="Subject, #number or requester"
      noun={['case', 'cases']}
      refreshOnFocus
      fetchPage={fetchPage}
      keyOf={(t) => t.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          <ManageStats
            loading={!stats}
            stats={[
              { label: 'Unread', value: stats?.unread ?? 0 },
              { label: DESK_STATUS_LABEL.OPEN, value: stats?.open ?? 0 },
              { label: DESK_STATUS_LABEL.PENDING, value: stats?.pending ?? 0 },
            ]}
          />
          <ChipPicker options={FILTERS} value={filter} onChange={(v) => v && setFilter(v)} />
          <ChipPicker options={KINDS} value={kind} onChange={setKind} clearable />
          <ChipPicker options={DESKS} value={desk} onChange={setDesk} clearable />
        </View>
      }
      renderItem={(t) => {
        const urgent = t.priority === 'HIGH' || t.priority === 'URGENT';
        return (
          <ApexRow
            title={`#${t.ticketNumber} ${t.subject}`}
            meta={[
              t.space?.name ?? personName(t.requester),
              t.kind !== 'HELP' ? KIND_LABEL[t.kind] : CATEGORY_LABEL[t.category],
              t.desk === 'SPACE' ? DESK_LABEL.SPACE : null,
              whenShort(t.lastMessageAt),
            ]
              .filter(Boolean)
              .join('  ·  ')}
            value={urgent ? PRIORITY_LABEL[t.priority] : undefined}
            valueColor={t.priority === 'URGENT' ? tokens.danger : tokens.warning}
            unread={t.unread}
            onPress={() => router.push(`/apex/support/${t.id}`)}
          />
        );
      }}
    />
  );
}
