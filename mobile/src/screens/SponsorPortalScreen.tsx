import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Export, QrCode } from '@unifesto/unicon/react-native';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import { useAuth } from '../context/AuthContext';
import { dismissBoothScan, syncBoothScans, useBoothScanQueue } from '../lib/offline/boothScanQueue';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { getPortalLeads, updatePortalLead, type PortalLead, type PortalLeadStatus } from '../lib/api/sponsorPortal';
import { SPONSOR_LEAD_SOURCE } from '../lib/api/spaceSponsors';
import { shareCsv, slugPart } from '../lib/csvShare';
import { relativeWhen } from '../utils/eventFormat';
import ChipPicker from '../components/manage/ChipPicker';
import ManageStats from '../components/manage/ManageStats';
import SponsorMark from '../components/manage/SponsorMark';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const STATUS: Record<PortalLeadStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', CONVERTED: 'Converted', ARCHIVED: 'Archived' };

/**
 * What a sponsor's own people see: the events they sponsor, a booth scanner for
 * each event with lead capture on, and every lead they've collected.
 */
export default function SponsorPortalScreen() {
  const { sponsorId } = useLocalSearchParams<{ sponsorId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const { sponsorships, refresh: refreshAccess } = useSpaceAccess();
  const sponsor = sponsorships.find((s) => s.sponsorId === sponsorId);
  const [leads, setLeads] = useState<PortalLead[] | null>(null);
  const [eventFilter, setEventFilter] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const userId = useAuth().user?.id;
  const queued = useBoothScanQueue(userId, sponsorId ?? '');
  const waiting = queued.filter((q) => q.state === 'pending').length;
  const refused = queued.filter((q) => q.state === 'failed');

  const load = useCallback(async () => {
    if (!sponsorId) return;
    const res = await getPortalLeads(sponsorId);
    if (res.ok) {
      setLeads(res.data);
      setError('');
    } else {
      setError(res.denied ? 'You no longer have access to this sponsor.' : res.message);
      setLeads((prev) => prev ?? []);
    }
  }, [sponsorId]);

  // Back from the scanner: new leads should be there.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // Offline scans just synced: show them.
  const lastWaiting = useRef(waiting);
  useEffect(() => {
    if (waiting < lastWaiting.current) void load();
    lastWaiting.current = waiting;
  }, [waiting, load]);

  const now = new Date();
  const events = useMemo(
    () => [...(sponsor?.events ?? [])].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()),
    [sponsor],
  );
  const shown = (leads ?? []).filter((l) => !eventFilter || l.eventId === eventFilter);
  const scans = (leads ?? []).filter((l) => l.source === 'BOOTH_SCAN').length;
  const converted = (leads ?? []).filter((l) => l.status === 'CONVERTED').length;
  /** Booth stats per event (E3): "12 leads · 9 scans · 2 converted". */
  const boothLine = (eventSponsorId: string) => {
    const mine = (leads ?? []).filter((l) => l.eventSponsorId === eventSponsorId);
    const n = (k: (l: PortalLead) => boolean) => mine.filter(k).length;
    return [`${mine.length} lead${mine.length === 1 ? '' : 's'}`, `${n((l) => l.source === 'BOOTH_SCAN')} scans`, `${n((l) => l.status === 'CONVERTED')} converted`].join(' · ');
  };

  const setStatus = async (l: PortalLead, status: PortalLeadStatus) => {
    const res = await updatePortalLead(sponsorId!, l.id, { status });
    if (res.ok) setLeads((ls) => ls?.map((x) => (x.id === l.id ? { ...x, status: res.data.status } : x)) ?? ls);
    else AppAlert.alert("Couldn't update", res.message);
  };

  const exportCsv = async () => {
    const ok = await shareCsv(
      `${slugPart(sponsor?.name ?? 'sponsor')}-leads`,
      ['Name', 'Email', 'Phone', 'Source', 'Status', 'Note', 'Event', 'Captured'],
      shown.map((l) => [
        l.name,
        l.email,
        l.phone,
        SPONSOR_LEAD_SOURCE[l.source] ?? l.source,
        STATUS[l.status] ?? l.status,
        l.note,
        l.eventTitle,
        new Date(l.createdAt).toISOString(),
      ]),
    );
    if (!ok) AppAlert.alert("Couldn't export", 'Sharing is not available on this device.');
  };

  const contact = (l: PortalLead) => {
    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
    if (l.email) buttons.push({ text: 'Email', onPress: () => void Linking.openURL(`mailto:${l.email}`) });
    if (l.phone) buttons.push({ text: 'Call', onPress: () => void Linking.openURL(`tel:${l.phone}`) });
    const copy = [l.name, l.email, l.phone].filter(Boolean).join('\n');
    if (copy) buttons.push({ text: 'Copy details', onPress: () => void Clipboard.setStringAsync(copy) });
    // Follow-up (E3): one tap to the next step. Notes are edited on the web portal.
    if (l.status !== 'CONTACTED' && l.status !== 'CONVERTED') buttons.push({ text: 'Mark contacted', onPress: () => void setStatus(l, 'CONTACTED') });
    if (l.status !== 'CONVERTED') buttons.push({ text: 'Mark converted', onPress: () => void setStatus(l, 'CONVERTED') });
    buttons.push({ text: 'Close', style: 'cancel' });
    const meta = `${l.eventTitle} · ${SPONSOR_LEAD_SOURCE[l.source] ?? l.source} · ${shortDate(l.createdAt)} · ${STATUS[l.status] ?? l.status}`;
    AppAlert.alert(l.name || l.email || 'Lead', l.note ? `${meta}\n\n${l.note}` : meta, buttons);
  };

  if (!sponsor) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.emptyText, { color: c.soft }]}>This sponsor isn't linked to your account any more.</Text>
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), refreshAccess()]);
        setRefreshing(false);
      }}
    >
      <View style={styles.hero}>
        <SponsorMark name={sponsor.name} logoUrl={sponsor.logoUrl} size={64} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
            {sponsor.name}
          </Text>
          <Text style={[styles.muted, { color: c.muted }]}>Sponsoring with {sponsor.spaceName}</Text>
        </View>
      </View>

      <View style={{ marginTop: spacing[6] }}>
        <ManageStats
          loading={!leads}
          stats={[
            { label: 'Leads', value: leads?.length ?? 0 },
            { label: 'Booth scans', value: scans },
            { label: 'Converted', value: converted },
          ]}
        />
      </View>

      <View style={{ marginTop: spacing[8] }}>
        <SettingsGroup title="Events">
          {events.length === 0 ? <SettingsRow label="Not on any event yet" /> : null}
          {events.map((e) => (
            <SettingsRow
              key={e.eventSponsorId}
              icon={<QrCode size={ICON} color={e.leadCaptureEnabled ? c.primary : c.muted} weight="fill" />}
              label={e.title}
              value={leads ? boothLine(e.eventSponsorId) : e.leadCaptureEnabled ? relativeWhen(e.startDateTime, now) : 'Scanning off'}
              onPress={
                e.leadCaptureEnabled
                  ? () => router.push({ pathname: `/sponsoring/${sponsorId}/scan`, params: { eventSponsorId: e.eventSponsorId, title: e.title, sponsorName: sponsor.name } })
                  : () => AppAlert.alert('Booth scanning is off', `Ask the organiser to turn on lead capture for ${sponsor.name} at this event.`)
              }
            />
          ))}
        </SettingsGroup>
        <Text style={[styles.note, { color: c.muted }]}>
          Tap an event to scan attendees' ticket QR codes at your booth. The attendee confirms on your phone before their
          contact is shared. Scans work without signal and are added once you're back online.
        </Text>
      </View>

      {waiting || refused.length ? (
        <View style={{ marginTop: spacing[8] }}>
          <SettingsGroup title="Offline scans">
            {waiting ? (
              <SettingsRow
                label={`${waiting} waiting for signal`}
                value="Send now"
                onPress={() => userId && void syncBoothScans(userId)}
              />
            ) : null}
            {refused.map((q) => (
              <SettingsRow
                key={q.id}
                label={`Not added: ${q.message ?? 'refused'}`}
                value={shortDate(q.scannedAt)}
                onPress={() =>
                  AppAlert.alert('Scan not added', q.message, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Dismiss', onPress: () => void dismissBoothScan(q.id) },
                  ])
                }
              />
            ))}
          </SettingsGroup>
        </View>
      ) : null}

      <View style={{ marginTop: spacing[8] }}>
        <Text style={[styles.section, { color: c.text }]} accessibilityRole="header">Leads</Text>
        {events.length > 1 ? (
          <View style={{ marginTop: spacing[3] }}>
            <ChipPicker options={events.map((e) => ({ value: e.eventId, label: e.title }))} value={eventFilter} onChange={setEventFilter} clearable />
          </View>
        ) : null}
        {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}
        <View style={{ marginTop: spacing[3] }}>
          {!leads ? (
            <ActivityIndicator color={c.text} />
          ) : (
            <SettingsGroup plain>
              {shown.length === 0 ? <SettingsRow label="No leads yet" /> : null}
              {shown.map((l) => (
                <View key={l.id}>
                  <SettingsRow label={l.name || l.email || l.phone || 'Attendee'} value={shortDate(l.createdAt)} onPress={() => contact(l)} />
                  <Text style={[styles.sub, { color: c.muted }]} onPress={() => contact(l)} numberOfLines={1}>
                    {[STATUS[l.status] ?? l.status, SPONSOR_LEAD_SOURCE[l.source] ?? l.source, events.length > 1 && !eventFilter ? l.eventTitle : null, l.email]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </SettingsGroup>
          )}
        </View>
        {shown.length ? (
          <Button
            label="Export CSV"
            variant="secondary"
            fullWidth
            icon={<Export size={18} color={c.text} weight="bold" />}
            onPress={() => void exportCsv()}
            style={{ marginTop: spacing[5] }}
          />
        ) : null}
      </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  name: { fontSize: typography.fontSize.xl, lineHeight: typography.fontSize.xl * 1.35, ...cosmosFont.display },
  section: { fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, textAlign: 'left', ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
