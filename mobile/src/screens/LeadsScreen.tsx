import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Export, Plus } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
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
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * The space's own lead funnel: people who tapped "Notify me" on an event, sent
 * an inquiry from the space page, or were added by hand. New → Contacted →
 * Converted, or Archived.
 */
export default function LeadsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [status, setStatus] = useState<LeadStatus | ''>('NEW');
  const [source, setSource] = useState<LeadSource | ''>('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('Leads');

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
    const c: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, ARCHIVED: 0 };
    for (const l of leads ?? []) c[l.status] += 1;
    return c;
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

  const open = (leadId: string) => router.push({ pathname: `/manage/space/${spaceId}/lead`, params: { leadId } });

  const exportCsv = async () => {
    const ok = await shareCsv(
      `leads-${new Date().toISOString().slice(0, 10)}`,
      ['Name', 'Email', 'Phone', 'Source', 'Status', 'Event', 'Message', 'Created'],
      shown.map((l) => [l.name, l.email, l.phone, LEAD_SOURCE_LABEL[l.source], LEAD_STATUS_LABEL[l.status], l.event?.title, l.message, new Date(l.createdAt).toISOString()]),
    );
    if (!ok) AppAlert.alert("Couldn't export", 'Sharing is not available on this device.');
  };

  if (!leads) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {error ? <Text style={[styles.intro, { color: tokens.danger }]}>{error}</Text> : null}

      <ManageStats
        stats={[
          { label: 'New', value: counts.NEW },
          { label: 'Contacted', value: counts.CONTACTED },
          { label: 'Converted', value: counts.CONVERTED },
        ]}
      />

      <View style={{ marginTop: spacing[6] }}>
        <BlockTitle>Stage</BlockTitle>
        <ChipPicker
          options={LEAD_STATUSES.map((s) => ({ value: s, label: `${LEAD_STATUS_LABEL[s]} ${counts[s]}` }))}
          value={status}
          onChange={setStatus}
          clearable
        />
      </View>
      {sources.length > 1 ? (
        <View style={{ marginTop: spacing[4] }}>
          <BlockTitle>Came from</BlockTitle>
          <ChipPicker options={sources} value={source} onChange={setSource} clearable />
        </View>
      ) : null}

      <View style={{ marginTop: spacing[5] }}>
        <SettingsGroup plain>
          {shown.length === 0 ? (
            <SettingsRow label={leads.length ? 'Nothing matches these filters' : 'No leads yet'} />
          ) : null}
          {shown.map((l) => (
            <View key={l.id}>
              <SettingsRow label={leadName(l)} value={shortDate(l.createdAt)} onPress={() => open(l.id)} />
              <Text style={[styles.sub, { color: tokens.textMuted }]} onPress={() => open(l.id)} numberOfLines={1}>
                {[status ? null : LEAD_STATUS_LABEL[l.status], LEAD_SOURCE_LABEL[l.source], l.event?.title].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
        </SettingsGroup>
      </View>
      {leads.length === 0 ? (
        <Text style={[styles.intro, { color: tokens.textMuted }]}>
          People land here when they tap Notify me on one of your events or send an inquiry from your space page.
        </Text>
      ) : null}

      <Button
        label="Add lead"
        variant="secondary"
        fullWidth
        icon={<Plus size={18} color={tokens.text} weight="bold" />}
        onPress={() => open('new')}
        style={{ marginTop: spacing[5] }}
      />
      {shown.length ? (
        <Button
          label={`Export ${shown.length === leads.length ? 'all' : 'these'} as CSV`}
          variant="ghost"
          fullWidth
          icon={<Export size={18} color={tokens.accent} weight="bold" />}
          onPress={() => void exportCsv()}
          style={{ marginTop: spacing[2] }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
});
