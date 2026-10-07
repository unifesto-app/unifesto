import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import ManageStats from '../../components/manage/ManageStats';
import ChipPicker from '../../components/manage/ChipPicker';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, longDate, shortDate, whenShort } from '../../components/apex/ApexRow';
import { titleCase } from '../../lib/apexQueues';
import {
  getAdminSession,
  getLogStats,
  listAdminSessions,
  listLogs,
  type AdminSession,
  type AdminSessionDetail,
  type AdminSessionStatus,
  type ApiLog,
  type LogStats,
  type LogStatusFilter,
} from '../../lib/api/apexPlatform';
import { inrShort } from '../../utils/money';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/* Apex Sessions (Unifesto Huddle) and API logs, both read-only like the web. */

const GUTTER = spacing[6];
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
  const tokens = useTokens();
  const [status, setStatus] = useState('');
  useAnalyticsScreenTracking('ApexSessions');
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
          valueColor={s.status === 'CANCELLED' ? tokens.danger : undefined}
          onPress={() => router.push(`/apex/sessions/${s.id}`)}
        />
      )}
    />
  );
}

export function SessionAdminDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexSessionDetail');
  const [s, setS] = useState<AdminSessionDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void getAdminSession(id!).then((r) => (r.ok ? setS(r.data) : setError(r.message)));
  }, [id]);

  if (!s) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const net = s.sales.grossSales - s.sales.processingFees - s.sales.refunded;
  return (
    <ScrollView style={{ backgroundColor: tokens.bg }} contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}>
      <Text style={[styles.title, { color: tokens.text }]}>{s.title}</Text>
      <Text style={[styles.muted, { color: tokens.textMuted, textAlign: 'left', marginTop: 4 }]}>
        {titleCase(s.status)} · {longDate(s.startDateTime)} · {s.durationMinutes} min
      </Text>

      <View style={{ marginTop: spacing[5] }}>
        <ManageStats
          stats={[
            { label: 'Joined', value: s.capacity ? `${s.registeredCount}/${s.capacity}` : s.registeredCount },
            { label: 'Sales', value: inrShort(s.sales.grossSales) },
            { label: 'Net', value: inrShort(net) },
          ]}
        />
      </View>

      <SettingsGroup title="Details">
        <SettingsRow label="Space" value={s.space?.name ?? '—'} onPress={s.space ? () => router.push(`/apex/spaces/${s.space!.id}`) : undefined} />
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
    </ScrollView>
  );
}

// ── Logs ─────────────────────────────────────────────────────────────────────

const LOG_FILTERS = [
  { value: '', label: 'All' },
  { value: 'error', label: 'Errors' },
  { value: 'server_error', label: '5xx' },
  { value: 'client_error', label: '4xx' },
  { value: 'success', label: 'OK' },
];

export function LogsScreen() {
  const tokens = useTokens();
  const [status, setStatus] = useState('error');
  const [stats, setStats] = useState<LogStats | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useAnalyticsScreenTracking('ApexLogs');

  useEffect(() => {
    void getLogStats().then((r) => r.ok && setStats(r.data));
  }, []);

  const fetchPage = useCallback(
    async (search: string, page: number) => {
      const r = await listLogs({ search, status: (status || undefined) as LogStatusFilter | undefined, page, limit: 30 });
      return r.ok ? { ok: true as const, data: { items: r.data.logs, total: r.data.pagination.total } } : r;
    },
    [status],
  );

  const codeColor = (c: number) => (c >= 500 ? tokens.danger : c >= 400 ? tokens.warning : tokens.success);

  return (
    <SearchList<ApiLog>
      placeholder="Path, e.g. /events"
      noun={['request', 'requests']}
      fetchPage={fetchPage}
      keyOf={(l) => l.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[3] }}>
          <ManageStats
            loading={!stats}
            stats={[
              { label: 'Last 24h', value: stats?.last24h ?? 0 },
              { label: 'Errors 24h', value: stats?.errors24h ?? 0 },
              { label: 'Avg time', value: stats ? `${Math.round(stats.avgDurationMs)}ms` : 0 },
            ]}
          />
          <ChipPicker options={LOG_FILTERS} value={status} onChange={setStatus} />
        </View>
      }
      renderItem={(l) => (
        <Pressable
          onPress={() => setOpenId((cur) => (cur === l.id ? null : l.id))}
          accessibilityRole="button"
          accessibilityLabel={`${l.method} ${l.path}, status ${l.statusCode}`}
          accessibilityState={{ expanded: openId === l.id }}
          style={styles.log}
        >
          <View style={styles.logHead}>
            <Text style={[styles.code, { color: codeColor(l.statusCode) }]}>{l.statusCode}</Text>
            <Text style={[styles.path, { color: tokens.text }]} numberOfLines={openId === l.id ? undefined : 1}>
              {l.method} {l.path}
            </Text>
          </View>
          <Text style={[styles.logMeta, { color: tokens.textMuted }]}>
            {whenShort(l.createdAt)} · {l.durationMs}ms{l.userId ? ' · signed in' : ''}
          </Text>
          {openId === l.id ? (
            <View style={{ marginTop: spacing[2], gap: 4 }}>
              {l.errorMessage ? <Text style={[styles.detail, { color: tokens.danger }]} selectable>{l.errorMessage}</Text> : null}
              <Text style={[styles.detail, { color: tokens.textSecondary }]} selectable>
                {longDate(l.createdAt)}
                {l.userId ? `\nUser ${l.userId}` : ''}
                {l.ipAddress ? `\nIP ${l.ipAddress}` : ''}
                {l.userAgent ? `\n${l.userAgent}` : ''}
              </Text>
            </View>
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  log: { paddingVertical: spacing[3] },
  logHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  code: { width: 36, fontSize: typography.fontSize.sm, ...font('semibold') },
  path: { flex: 1, fontSize: typography.fontSize.sm, ...font('medium') },
  logMeta: { marginTop: 2, marginLeft: 36 + spacing[2], fontSize: typography.fontSize.xs, ...font() },
  detail: { marginLeft: 36 + spacing[2], fontSize: typography.fontSize.xs, lineHeight: 17, ...font() },
});
