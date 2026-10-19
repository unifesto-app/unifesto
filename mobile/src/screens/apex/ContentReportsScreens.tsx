import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import {
  listContentReports,
  moveContentReport,
  REPORT_STATUS_LABEL,
  type ContentReport,
  type ReportStatus,
} from '../../lib/api/apexSupport';
import { REPORT_REASONS, type ReportTarget } from '../../lib/api/contentReports';
import SearchList from '../../components/apex/SearchList';
import { ApexRow, longDate, whenShort } from '../../components/apex/ApexRow';
import ChipPicker from '../../components/manage/ChipPicker';
import ManageStats from '../../components/manage/ManageStats';
import { FieldRow } from '../../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { personName } from '../../components/support/CaseThread';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

type StatusFilter = ReportStatus | 'all';
type TypeFilter = ReportTarget | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'REVIEWING', label: 'Reviewing' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'EVENT', label: 'Events' },
  { value: 'SPACE', label: 'Spaces' },
  { value: 'REGISTRATION', label: 'Tickets' },
];

const TYPE_NOUN: Record<ReportTarget, string> = { EVENT: 'Event', SPACE: 'Space', REGISTRATION: 'Ticket' };

export const reasonLabel = (r: Pick<ContentReport, 'targetType' | 'reason'>) =>
  REPORT_REASONS[r.targetType]?.find((x) => x.key === r.reason)?.label ?? r.reason;

const isActive = (s: ReportStatus) => s === 'OPEN' || s === 'REVIEWING';

// No GET-by-id on the server: the list hands a report to the detail screen, which
// falls back to re-reading the (≤200 row) queue after a cold open.
const handoff = new Map<string, ContentReport>();

/** Where "Open the reported thing" goes in Apex: event, space, or the ticket's transaction. */
function targetRoute(r: ContentReport): string | null {
  if (r.targetName === '(deleted)') return null;
  if (r.targetType === 'EVENT') return `/apex/events/${r.targetId}`;
  if (r.targetType === 'SPACE') return `/apex/spaces/${r.targetId}`;
  return `/apex/money/transactions/${r.targetId}`;
}

/** The moderation queue for events, spaces and tickets people reported from the app. */
export function ContentReportsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [type, setType] = useState<TypeFilter>('all');
  const [counts, setCounts] = useState<Record<ReportStatus, number> | null>(null);
  // Bumped on focus so a decision made on the detail screen shows on return.
  const [version, setVersion] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  // The server returns the whole queue (capped at 200), so filter and search here.
  const fetchPage = useCallback(
    async (search: string, page: number) => {
      if (page > 1) return { ok: true as const, data: { items: [], total: 0 } };
      const r = await listContentReports();
      if (!r.ok) return r;
      const c = { OPEN: 0, REVIEWING: 0, RESOLVED: 0, DISMISSED: 0 };
      for (const x of r.data) {
        c[x.status] += 1;
        handoff.set(x.id, x);
      }
      setCounts(c);
      const q = search.trim().toLowerCase();
      const items = r.data.filter(
        (x) =>
          (status === 'all' || x.status === status) &&
          (type === 'all' || x.targetType === type) &&
          (!q || [x.targetName, reasonLabel(x), x.details, personName(x.reporter)].join(' ').toLowerCase().includes(q)),
      );
      return { ok: true as const, data: { items, total: items.length } };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, type, version],
  );

  return (
    <SearchList<ContentReport>
      placeholder="Name, reason or reporter"
      noun={['report', 'reports']}
      fetchPage={fetchPage}
      keyOf={(r) => r.id}
      header={
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          <ManageStats
            loading={!counts}
            stats={[
              { label: 'Open', value: counts?.OPEN ?? 0 },
              { label: 'Reviewing', value: counts?.REVIEWING ?? 0 },
              { label: 'Closed out', value: counts ? counts.RESOLVED + counts.DISMISSED : 0 },
            ]}
          />
          <ChipPicker options={STATUS_FILTERS} value={status} onChange={(v) => v && setStatus(v)} />
          <ChipPicker options={TYPE_FILTERS} value={type} onChange={(v) => v && setType(v)} />
        </View>
      }
      renderItem={(r) => (
        <ApexRow
          title={r.targetName}
          meta={[TYPE_NOUN[r.targetType], reasonLabel(r), whenShort(r.createdAt)].join('  ·  ')}
          value={status === 'all' || status !== r.status ? REPORT_STATUS_LABEL[r.status] : undefined}
          valueColor={isActive(r.status) ? tokens.warning : tokens.textMuted}
          unread={r.status === 'OPEN'}
          onPress={() => router.push(`/apex/reports/${r.id}`)}
        />
      )}
    />
  );
}

/** One report: what was reported and why, who said so, and the review actions. */
export function ContentReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [report, setReport] = useState<ContentReport | null>(() => (id ? handoff.get(id) ?? null : null));
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ReportStatus | null>(null);

  useEffect(() => {
    if (report || !id) return;
    void listContentReports().then((r) => {
      const hit = r.ok ? r.data.find((x) => x.id === id) : undefined;
      if (hit) setReport(hit);
      else setError(r.ok ? 'This report is no longer in the queue.' : r.message);
    });
  }, [id, report]);

  useEffect(() => {
    if (report?.resolutionNote) setNote(report.resolutionNote);
  }, [report?.resolutionNote]);

  const move = async (next: ReportStatus) => {
    if (!report) return;
    setBusy(next);
    const r = await moveContentReport(report.id, next, note);
    setBusy(null);
    if (!r.ok) return AppAlert.alert("Couldn't update the report", r.message);
    // The PATCH returns the bare row (no reporter / targetName), so merge.
    const merged = { ...report, ...r.data, reporter: report.reporter, targetName: report.targetName };
    handoff.set(merged.id, merged);
    setReport(merged);
    if (!isActive(next)) router.back();
  };

  if (!report) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.meta, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const active = isActive(report.status);
  const route = targetRoute(report);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: tokens.text }]}>{reasonLabel(report)}</Text>
      <Text style={[styles.meta, { color: tokens.textMuted }]}>
        {REPORT_STATUS_LABEL[report.status]} · reported {longDate(report.createdAt)}
      </Text>

      {report.details ? <Text style={[styles.details, { color: tokens.textSecondary }]}>{report.details}</Text> : null}

      <SettingsGroup plain>
        <SettingsRow
          label={TYPE_NOUN[report.targetType]}
          value={report.targetName}
          onPress={route ? () => router.push(route as never) : undefined}
        />
        <SettingsRow
          label="Reported by"
          value={personName(report.reporter)}
          onPress={report.reporter ? () => router.push(`/apex/users/${report.reporter!.id}`) : undefined}
        />
        {report.resolvedAt ? (
          <SettingsRow label={report.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'} value={longDate(report.resolvedAt)} />
        ) : null}
      </SettingsGroup>

      {active ? (
        <SettingsGroup plain>
          <FieldRow
            label="Internal note"
            stacked
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="What you checked or did (optional)"
            maxLength={2000}
          />
        </SettingsGroup>
      ) : report.resolutionNote ? (
        <Text style={[styles.details, { color: tokens.textSecondary }]}>Note: {report.resolutionNote}</Text>
      ) : null}

      <View style={styles.actions}>
        {report.status === 'OPEN' ? (
          <Button label="Start review" variant="secondary" size="lg" fullWidth loading={busy === 'REVIEWING'} disabled={!!busy} onPress={() => move('REVIEWING')} />
        ) : null}
        {active ? (
          <>
            <Button label="Resolve" size="lg" fullWidth loading={busy === 'RESOLVED'} disabled={!!busy} onPress={() => move('RESOLVED')} />
            <Button label="Dismiss" variant="ghost" size="lg" fullWidth loading={busy === 'DISMISSED'} disabled={!!busy} onPress={() => move('DISMISSED')} />
          </>
        ) : (
          <Button label="Reopen" variant="secondary" size="lg" fullWidth loading={busy === 'OPEN'} disabled={!!busy} onPress={() => move('OPEN')} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  details: { marginTop: spacing[4], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...font() },
  actions: { marginTop: spacing[6], gap: spacing[3] },
});
