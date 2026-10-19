import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, Export, Plus } from '@unifesto/unicon/react-native';
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
import { GroupCell, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen, { CosmosList } from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * The space's own lead funnel: people who tapped "Notify me" on an event, sent
 * an inquiry from the space page, or were added by hand. New → Contacted →
 * Converted, or Archived.
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
              <View style={[styles.notice, { backgroundColor: c.raised }]}>
                <Text style={[styles.body, { color: c.danger }]}>{error}</Text>
              </View>
            ) : null}
            <ManageStats
              stats={[
                { label: 'New', value: counts.NEW },
                { label: 'Contacted', value: counts.CONTACTED },
                { label: 'Converted', value: counts.CONVERTED },
              ]}
            />
          </View>

          <Section
            title="Leads"
            subtitle={leads.length ? undefined : 'People who tap Notify me on an event or send an inquiry from your space page'}
            style={styles.firstSection}
          >
            <View style={styles.pad}>
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
          </Section>
          <View style={styles.groupTop} />
        </>
      }
      ListEmptyComponent={
        <GroupCell index={0} count={1} plain style={styles.group}>
          <SettingsRow label={leads.length ? 'Nothing matches these filters' : 'No leads yet'} />
        </GroupCell>
      }
      renderItem={({ item, index }) => (
        <GroupCell index={index} count={shown.length} plain style={styles.group}>
          <LeadRow l={item} showStatus={!status} onOpen={open} />
        </GroupCell>
      )}
      ListFooterComponent={
        <View style={[styles.pad, styles.actions]}>
          <AuthButton
            label="Add lead"
            variant="secondary"
            icon={<Plus size={16} color={c.text} weight="bold" />}
            onPress={() => open('new')}
            style={styles.action}
          />
          {shown.length ? (
            <AuthButton
              label="Export CSV"
              variant="secondary"
              accessibilityLabel={`Export ${shown.length === leads.length ? 'all' : 'these'} leads as CSV`}
              icon={<Export size={16} color={c.text} weight="bold" />}
              onPress={() => void exportCsv()}
              style={styles.action}
            />
          ) : null}
        </View>
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
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {leadName(l)}
        </Text>
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.meta, { color: c.soft }]}>{shortDate(l.createdAt)}</Text>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  notice: { marginBottom: spacing[3], padding: spacing[5], borderRadius: cosmosCardRadius },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  groupTop: { height: spacing[5] },
  group: { marginHorizontal: GUTTER },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 64 },
  name: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  meta: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  // minHeight, not height: a fixed height clips the label at large Dynamic Type sizes.
  action: { flex: 1, height: undefined, minHeight: 52, paddingHorizontal: spacing[3] },
});
