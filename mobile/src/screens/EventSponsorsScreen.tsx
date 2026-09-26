import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Export, Plus } from 'phosphor-react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  attachSponsor,
  detachSponsor,
  getEventLeads,
  getEventSponsors,
  getSponsors,
  getTiers,
  updateEventSponsor,
  SPONSOR_LEAD_SOURCE,
  type EventLead,
  type EventSponsor,
  type Sponsor,
  type SponsorTier,
} from '../lib/api/spaceSponsors';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { shareCsv, slugPart } from '../lib/csvShare';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import ChipPicker from '../components/manage/ChipPicker';
import SelectRow from '../components/manage/SelectRow';
import SponsorMark from '../components/manage/SponsorMark';
import { SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

type Tab = 'sponsors' | 'leads';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Sponsors on one event (from the space roster): tier, lead capture, removal,
 * plus every lead captured for them here, with a CSV export.
 */
export default function EventSponsorsScreen() {
  const params = useLocalSearchParams<{ eventId: string; spaceId?: string; title?: string }>();
  const eventId = params.eventId;
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [spaceId, setSpaceId] = useState(params.spaceId || '');
  const [title, setTitle] = useState(params.title || '');
  const [tab, setTab] = useState<Tab>('sponsors');
  const [attached, setAttached] = useState<EventSponsor[] | null>(null);
  const [roster, setRoster] = useState<Sponsor[]>([]);
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  const [leads, setLeads] = useState<EventLead[]>([]);
  const [sponsorFilter, setSponsorFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('EventSponsors');

  const load = useCallback(async () => {
    if (!eventId) return;
    // Opened without the space (deep link): the event knows which one it's in.
    let sid = spaceId;
    if (!sid || !title) {
      const ev = await getManagedEvent(eventId);
      if (ev.ok) {
        sid = sid || ev.data.spaceId;
        setSpaceId(sid);
        setTitle((t) => t || ev.data.title);
      }
    }
    if (!sid) {
      setError("Couldn't find this event's space.");
      setAttached([]);
      return;
    }
    const [es, rs, ts, ls] = await Promise.all([
      getEventSponsors(sid, eventId),
      getSponsors(sid),
      getTiers(sid),
      getEventLeads(sid, eventId),
    ]);
    if (es.ok) {
      setAttached([...es.data].sort((a, b) => (a.tier?.rank ?? 999) - (b.tier?.rank ?? 999) || a.order - b.order));
      setError('');
    } else {
      setError(es.denied ? 'Only Space admins can manage sponsors.' : es.message);
      setAttached((prev) => prev ?? []);
    }
    if (rs.ok) setRoster(rs.data);
    if (ts.ok) setTiers([...ts.data].sort((a, b) => a.rank - b.rank));
    if (ls.ok) setLeads(ls.data);
  }, [eventId, spaceId, title]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unattached = useMemo(() => {
    const taken = new Set((attached ?? []).map((a) => a.sponsorId));
    return roster.filter((s) => !taken.has(s.id));
  }, [attached, roster]);

  /** Same name twice in a roster is possible; the picker shows them apart. */
  const rosterLabel = (s: Sponsor) =>
    roster.filter((x) => x.name === s.name).length > 1 ? `${s.name} (${s.contactEmail || s.id.slice(0, 4)})` : s.name;

  const attach = async (label: string) => {
    const s = unattached.find((x) => rosterLabel(x) === label);
    if (!s) return;
    setBusy('attach');
    const res = await attachSponsor(spaceId, eventId!, { sponsorId: s.id });
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't add sponsor", res.message);
    void load();
  };

  const patch = async (es: EventSponsor, body: Parameters<typeof updateEventSponsor>[3]) => {
    setBusy(es.id);
    const res = await updateEventSponsor(spaceId, eventId!, es.id, body);
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't update", res.message);
    // The PATCH response has no lead count; keep the one we had.
    setAttached((list) => (list ?? []).map((a) => (a.id === es.id ? { ...res.data, _count: a._count } : a)));
  };

  const detach = (es: EventSponsor) =>
    AppAlert.alert(`Remove ${es.sponsor.name} from this event?`, 'Leads captured for them at this event are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(es.id);
          const res = await detachSponsor(spaceId, eventId!, es.id);
          setBusy(null);
          if (!res.ok) return AppAlert.alert("Couldn't remove", res.message);
          void load();
        },
      },
    ]);

  const shownLeads = sponsorFilter ? leads.filter((l) => l.sponsorId === sponsorFilter) : leads;

  const exportLeads = async () => {
    const ok = await shareCsv(
      `sponsor-leads-${slugPart(title || eventId!)}`,
      ['Sponsor', 'Name', 'Email', 'Phone', 'Source', 'Note', 'Captured at'],
      shownLeads.map((l) => [l.sponsorName, l.name, l.email, l.phone, SPONSOR_LEAD_SOURCE[l.source] ?? l.source, l.note, new Date(l.createdAt).toISOString()]),
    );
    if (!ok) AppAlert.alert("Couldn't export", 'Sharing is not available on this device.');
  };

  const contact = (l: EventLead) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (l.email) buttons.push({ text: 'Email', onPress: () => void Linking.openURL(`mailto:${l.email}`) });
    if (l.phone) buttons.push({ text: 'Call', onPress: () => void Linking.openURL(`tel:${l.phone}`) });
    const copy = [l.name, l.email, l.phone].filter(Boolean).join('\n');
    if (copy) buttons.push({ text: 'Copy details', onPress: () => void Clipboard.setStringAsync(copy) });
    buttons.push({ text: 'Close', style: 'cancel' });
    AppAlert.alert(l.name || l.email || 'Lead', `${l.sponsorName} · ${SPONSOR_LEAD_SOURCE[l.source] ?? l.source} · ${shortDate(l.createdAt)}`, buttons);
  };

  if (!attached) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sponsors', label: attached.length ? `Sponsors · ${attached.length}` : 'Sponsors' },
    { key: 'leads', label: leads.length ? `Leads · ${leads.length}` : 'Leads' },
  ];
  const tierNames = tiers.map((t) => t.name);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      keyboardShouldPersistTaps="handled"
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
      {error ? <Text style={[styles.intro, { color: tokens.danger, marginBottom: spacing[3] }]}>{error}</Text> : null}
      <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'sponsors' ? (
        <>
          <Text style={[styles.intro, { color: tokens.textSecondary }]}>
            Sponsors show on the event page, grouped by tier. With lead capture on, attendees can share their details with that
            sponsor, and the sponsor's people can scan tickets at their booth.
          </Text>

          {attached.map((es) => (
            <View key={es.id} style={{ marginTop: spacing[5] }}>
              <SettingsGroup plain>
                <SettingsRow
                  icon={<SponsorMark name={es.sponsor.name} logoUrl={es.overrideLogoUrl || es.sponsor.logoUrl} />}
                  label={es.sponsor.name}
                  onPress={() => router.push({ pathname: `/manage/space/${spaceId}/sponsor`, params: { sponsorId: es.sponsorId } })}
                />
                {tiers.length ? (
                  <SelectRow
                    label="Tier"
                    value={es.tier?.name ?? ''}
                    options={tierNames}
                    placeholder="No tier"
                    clearable
                    onChange={(name) => void patch(es, { tierId: tiers.find((t) => t.name === name)?.id ?? null })}
                  />
                ) : null}
                <SwitchRow
                  label="Lead capture"
                  hint="Attendees can opt in; the sponsor can scan tickets at the booth."
                  value={es.leadCaptureEnabled}
                  disabled={busy === es.id}
                  onValueChange={(v) => void patch(es, { leadCaptureEnabled: v })}
                />
                <SettingsRow
                  label="Leads"
                  value={String(es._count?.leads ?? 0)}
                  onPress={() => {
                    setSponsorFilter(es.sponsorId);
                    setTab('leads');
                  }}
                />
                <SettingsRow label="Remove from event" danger onPress={() => detach(es)} />
              </SettingsGroup>
            </View>
          ))}

          <View style={{ marginTop: spacing[6] }}>
            {unattached.length ? (
              <SettingsGroup title="Add a sponsor" plain>
                <SelectRow label="From your roster" value="" options={unattached.map(rosterLabel)} placeholder="Choose" onChange={(v) => void attach(v)} />
              </SettingsGroup>
            ) : (
              <Text style={[styles.intro, { color: tokens.textMuted }]}>
                {roster.length ? 'Every sponsor in your roster is on this event.' : 'Your roster is empty. Add a sponsor first.'}
              </Text>
            )}
            {busy === 'attach' ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[3] }} /> : null}
            <Button
              label="New sponsor"
              variant="ghost"
              fullWidth
              icon={<Plus size={18} color={tokens.accent} weight="bold" />}
              onPress={() => router.push({ pathname: `/manage/space/${spaceId}/sponsor`, params: { sponsorId: 'new' } })}
              style={{ marginTop: spacing[3] }}
            />
          </View>
        </>
      ) : (
        <>
          {attached.length > 1 ? (
            <View style={{ marginTop: spacing[4] }}>
              <ChipPicker
                options={attached.map((a) => ({ value: a.sponsorId, label: a.sponsor.name }))}
                value={sponsorFilter}
                onChange={setSponsorFilter}
                clearable
              />
            </View>
          ) : null}

          <View style={{ marginTop: spacing[4] }}>
            <SettingsGroup plain>
              {shownLeads.length === 0 ? (
                <SettingsRow label="No leads yet" value={attached.some((a) => a.leadCaptureEnabled) ? undefined : 'Lead capture is off'} />
              ) : null}
              {shownLeads.map((l) => (
                <View key={l.id}>
                  <SettingsRow label={l.name || l.email || l.phone || 'Attendee'} value={shortDate(l.createdAt)} onPress={() => contact(l)} />
                  <Text style={[styles.sub, { color: tokens.textMuted }]} onPress={() => contact(l)}>
                    {[attached.length > 1 && !sponsorFilter ? l.sponsorName : null, SPONSOR_LEAD_SOURCE[l.source] ?? l.source, l.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </SettingsGroup>
          </View>

          {shownLeads.length ? (
            <Button
              label="Export CSV"
              variant="secondary"
              fullWidth
              icon={<Export size={18} color={tokens.text} weight="bold" />}
              onPress={() => void exportLeads()}
              style={{ marginTop: spacing[5] }}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { marginTop: spacing[4], marginLeft: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
});
