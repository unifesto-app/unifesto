import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { Button } from '../../components/ui';
import { GUTTER } from '../../components/home/Section';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import ManageStats from '../../components/manage/ManageStats';
import ChipPicker from '../../components/manage/ChipPicker';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, longDate, shortDate } from '../../components/apex/ApexRow';
import { titleCase } from '../../lib/apexQueues';
import {
  getAdminSession,
  listAdminSessions,
  type AdminSession,
  type AdminSessionDetail,
  type AdminSessionStatus,
} from '../../lib/api/apexPlatform';
import { inrShort } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../../theme/cosmos';

/* Apex Sessions (Unifesto Huddle), read-only like the web. */

const who = (u: { fullName: string | null; username: string | null }) => u.fullName || (u.username ? `@${u.username}` : 'Unnamed');

// ── Sessions ─────────────────────────────────────────────────────────────────

const SESSION_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PUBLISHED', label: 'Live' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function SessionsAdminScreen() {
  const router = useRouter();
  const c = useCosmos();
  const [status, setStatus] = useState('');
  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listAdminSessions({ search, status: (status || undefined) as AdminSessionStatus | undefined, page, limit: 20 });
      return r.ok ? { ok: true as const, data: { items: r.data.sessions, total: r.data.pagination.total } } : r;
    },
    [status],
  );
  return (
    <SearchList<AdminSession>
      placeholder="Session title"
      noun={['session', 'sessions']}
      fetchPage={fetchPage}
      keyOf={(s) => s.id}
      header={
        <View style={{ marginTop: spacing[3] }}>
          <ChipPicker options={SESSION_FILTERS} value={status} onChange={setStatus} />
        </View>
      }
      renderItem={(s) => (
        <ApexRow
          title={s.title}
          meta={[s.space?.name ?? who(s.creator), shortDate(s.startDateTime), `${s.registeredCount} joined`].join('  ·  ')}
          value={s.sales.grossSales ? inrShort(s.sales.grossSales) : titleCase(s.status)}
          valueColor={s.status === 'CANCELLED' ? c.danger : s.sales.grossSales ? c.ivory : undefined}
          onPress={() => router.push(`/apex/sessions/${s.id}`)}
        />
      )}
    />
  );
}

export function SessionAdminDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [s, setS] = useState<AdminSessionDetail | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    void getAdminSession(id!).then((r) => (r.ok ? setS(r.data) : setError(r.message)));
  }, [id]);

  useEffect(load, [load]);

  if (!s) {
    return (
      <CosmosScreen contentContainerStyle={styles.pad}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.muted, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={load} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const net = s.sales.grossSales - s.sales.processingFees - s.sales.refunded;
  return (
    <CosmosScreen contentContainerStyle={styles.pad}>
      <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{s.title}</Text>
      <Text style={[styles.muted, { color: c.muted, textAlign: 'left', marginTop: 4 }]}>
        {titleCase(s.status)} · {longDate(s.startDateTime)} · {s.durationMinutes} min
      </Text>

      <View style={{ marginTop: spacing[5] }}>
        <ManageStats
          stats={[
            { label: 'Joined', value: s.capacity ? `${s.registeredCount}/${s.capacity}` : s.registeredCount, tone: 'sky' },
            { label: 'Sales', value: inrShort(s.sales.grossSales), tone: 'ivory' },
            { label: 'Net', value: inrShort(net), tone: 'ivory' },
          ]}
        />
      </View>

      <SettingsGroup title="Details">
        <SettingsRow label="Space" value={s.space?.name ?? '–'} onPress={s.space ? () => router.push(`/apex/spaces/${s.space!.id}`) : undefined} />
        <SettingsRow label="Host" value={who(s.creator)} />
        <SettingsRow label="Platform" value={titleCase(s.platform)} />
        <SettingsRow label="Price" value={Number(s.price) ? inrShort(s.price) : 'Free'} />
        {s.meetingUrl ? <SettingsRow label="Meeting link" external onPress={() => void Linking.openURL(s.meetingUrl!)} /> : null}
        {s.cancellationReason ? <SettingsRow label="Cancelled because" value={s.cancellationReason} /> : null}
      </SettingsGroup>

      <SettingsGroup title={`${s.attendees.length} ${s.attendees.length === 1 ? 'attendee' : 'attendees'}`}>
        {s.attendees.length ? (
          s.attendees.map((a) => (
            <SettingsRow
              key={a.id}
              label={who(a.user)}
              value={`${titleCase(a.status)}${Number(a.totalAmount) ? ` · ${inrShort(a.totalAmount)}` : ''}`}
              onPress={() => router.push(`/apex/users/${a.user.id}`)}
            />
          ))
        ) : (
          <SettingsRow label="No one yet" />
        )}
      </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  title: { fontSize: 26, lineHeight: 32, ...cosmosFont.display, letterSpacing: displayTracking(26) },
});
