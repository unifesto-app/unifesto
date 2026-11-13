import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, Export, Plus } from '../components/ui/icons';
import {
  getLeads,
  leadName,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from '../lib/api/spaceLeads';
import { shareCsv } from '../lib/csvShare';
import ManageStats from '../components/manage/ManageStats';
import ChipPicker from '../components/manage/ChipPicker';
import { BlockTitle } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen, { CosmosList } from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * The space's own lead funnel: people who tapped "Notify me" on an event, sent
 * an inquiry from the space page, or were added by hand. New → Contacted →
 * Converted, or Archived. The counts card, the stage filters, then the leads
 * as rows on the page with full hairlines, closed by the sky actions.
 */
export default function LeadsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [status, setStatus] = useState<LeadStatus | ''>('NEW');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // One fetch, filtered here, so the counts always cover the whole funnel.
  const load = useCallback(async () => {
    if (!spaceId) return;
    const res = await getLeads(spaceId);
    if (res.ok) {
      setLeads(res.data);
      setError('');
    } else {
      setError(res.denied ? 'Only Space admins can see leads.' : res.message);
      setLeads((prev) => prev ?? []);
    }
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => {
    const n: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, ARCHIVED: 0 };
    for (const l of leads ?? []) n[l.status] += 1;
    return n;
  }, [leads]);

  const shown = useMemo(
    () => (leads ?? []).filter((l) => (!status || l.status === status) && (!source || l.source === source)),
    [leads, status, source],
  );

  // Only offer the sources that actually appear.
  const sources = useMemo(() => {
    const present = new Set((leads ?? []).map((l) => l.source));
    return (Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).filter((s) => present.has(s)).map((s) => ({ value: s, label: LEAD_SOURCE_LABEL[s] }));
  }, [leads]);

  const open = useCallback((leadId: string) => router.push({ pathname: `/manage/space/${spaceId}/lead`, params: { leadId } }), [router, spaceId]);

  const exportCsv = async () => {
    const ok = await shareCsv(
      `leads-${new Date().toISOString().slice(0, 10)}`,
      ['Name', 'Email', 'Phone', 'Source', 'Status', 'Event', 'Message', 'Created'],
      shown.map((l) => [l.name, l.email, l.phone, LEAD_SOURCE_LABEL[l.source], LEAD_STATUS_LABEL[l.status], l.event?.title, l.message, new Date(l.createdAt).toISOString()]),
    );
    if (!ok) AppAlert.alert("Couldn't export", 'Sharing is not available on this device.');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!leads) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={84} borderRadius={cosmosCardRadius} />
          <Skeleton width="100%" height={240} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosList
      refreshing={refreshing}
      onRefresh={onRefresh}
      data={shown}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <>
          <View style={styles.pad}>
            {error ? (
              <Text style={[styles.body, styles.notice, { color: c.danger }]}>{error}</Text>
            ) : null}
            <ManageStats
              stats={[
                { label: 'New', value: counts.NEW },
                { label: 'Contacted', value: counts.CONTACTED },
                { label: 'Converted', value: counts.CONVERTED },
              ]}
            />
          </View>

          <View style={[styles.pad, styles.filters]}>
            <Text style={[styles.listTitle, { color: c.muted }]} accessibilityRole="header">Leads</Text>
            <BlockTitle>Stage</BlockTitle>
              <ChipPicker
                options={LEAD_STATUSES.map((s) => ({ value: s, label: `${LEAD_STATUS_LABEL[s]} ${counts[s]}` }))}
                value={status}
                onChange={setStatus}
                clearable
              />
            {sources.length > 1 ? (
              <View style={{ marginTop: spacing[4] }}>
                <BlockTitle>Came from</BlockTitle>
                <ChipPicker options={sources} value={source} onChange={setSource} clearable />
              </View>
            ) : null}
          </View>
          <View style={styles.groupTop} />
        </>
      }
      // An empty state on the page: what lands here, no card.
      ListEmptyComponent={
        <View style={[styles.pad, styles.empty]}>
          {leads.length ? (
            <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>Nothing matches these filters.</Text>
          ) : (
            <>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No leads yet</Text>
              <Text style={[styles.body, { color: c.muted, textAlign: 'center' }]}>
                People who tap Notify me on an event or send an inquiry from your space page
              </Text>
            </>
          )}
        </View>
      }
      // Rows on the page: a full hairline between leads, no card.
      renderItem={({ item, index }) => (
        <View style={[styles.group, index > 0 && [styles.divider, { borderTopColor: c.border }]]}>
          <LeadRow l={item} showStatus={!status} onOpen={open} />
        </View>
      )}
      // Actions close the list in sky, under its last hairline.
      ListFooterComponent={
        <SettingsGroup flat style={[styles.group, styles.actions, shown.length ? { borderTopColor: c.border } : styles.noLine]}>
          <SettingsRow icon={<Plus size={ICON} color={c.sky} />} label="Add a lead" accent={c.sky} onPress={() => open('new')} />
          {shown.length ? (
            <SettingsRow
              icon={<Export size={ICON} color={c.sky} />}
              label={`Export ${shown.length === leads.length ? 'all' : 'these'} leads as CSV`}
              accent={c.sky}
              onPress={() => void exportCsv()}
            />
          ) : null}
        </SettingsGroup>
      }
    />
  );
}

const LeadRow = React.memo(function LeadRow({ l, showStatus, onOpen }: { l: Lead; showStatus: boolean; onOpen: (leadId: string) => void }) {
  const c = useCosmos();
  const meta = [showStatus ? LEAD_STATUS_LABEL[l.status] : null, LEAD_SOURCE_LABEL[l.source], l.event?.title].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => onOpen(l.id)}
      accessibilityRole="button"
      accessibilityLabel={`${leadName(l)}, ${meta}, ${shortDate(l.createdAt)}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {leadName(l)}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.date, { color: c.muted }]}>{shortDate(l.createdAt)}</Text>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  notice: { marginBottom: spacing[4], marginHorizontal: spacing[1] },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  filters: { marginTop: spacing[8] },
  // Same as SettingsGroup's title: muted Hanken SemiBold, sentence case.
  listTitle: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  groupTop: { height: spacing[4] },
  group: { marginHorizontal: GUTTER },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  // On the page: no side padding; the list draws full hairlines between rows.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], minHeight: 64 },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  meta: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  date: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  actions: { marginTop: 0, borderTopWidth: StyleSheet.hairlineWidth },
  noLine: { borderTopWidth: 0, marginTop: spacing[6] },
  empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[8] },
  emptyTitle: { fontSize: 20, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
});
