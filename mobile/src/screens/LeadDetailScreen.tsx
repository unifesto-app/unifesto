import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EnvelopeSimple, Phone, Trash, WhatsappLogo } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createLead,
  deleteLead,
  getLeads,
  leadName,
  LEAD_SOURCE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  updateLead,
  type Lead,
  type LeadStatus,
} from '../lib/api/spaceLeads';
import ChipPicker from '../components/manage/ChipPicker';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import PressableScale from '../components/ui/PressableScale';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const ICON = 24;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Draft {
  name: string;
  email: string;
  phone: string;
  message: string;
}

const EMPTY: Draft = { name: '', email: '', phone: '', message: '' };
const toDraft = (l: Lead): Draft => ({ name: l.name ?? '', email: l.email ?? '', phone: l.phone ?? '', message: l.message ?? '' });

/** Digits for a wa.me link; a bare 10-digit number is taken as Indian. */
const waNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

/**
 * One lead: reach out (email / call / WhatsApp), move it along the funnel, fix
 * its details, or delete it. `leadId=new` adds one by hand.
 */
export default function LeadDetailScreen() {
  const { spaceId, leadId } = useLocalSearchParams<{ spaceId: string; leadId: string }>();
  const isNew = !leadId || leadId === 'new';
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [lead, setLead] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [staging, setStaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('LeadDetail');

  // No GET-by-id route: find it in the space's list.
  useEffect(() => {
    if (isNew || !spaceId) return;
    void getLeads(spaceId).then((res) => {
      const l = res.ok ? res.data.find((x) => x.id === leadId) : undefined;
      if (!l) {
        setError(res.ok ? 'This lead no longer exists.' : res.message);
        return;
      }
      const d = toDraft(l);
      initial.current = JSON.stringify(d);
      setLead(l);
      setDraft(d);
    });
  }, [isNew, spaceId, leadId]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = draft !== null && JSON.stringify(draft) !== initial.current;

  const stage = async (status: LeadStatus | '') => {
    if (!lead || !status || status === lead.status) return;
    setStaging(true);
    const res = await updateLead(spaceId!, lead.id, { status });
    setStaging(false);
    if (!res.ok) return AppAlert.alert("Couldn't update", res.message);
    setLead({ ...lead, status: res.data.status });
  };

  const save = async () => {
    if (!draft) return;
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    if (!email && !phone) return setError('Add an email or a phone number.');
    if (email && !EMAIL_RE.test(email)) return setError("That email doesn't look right.");
    const body = {
      name: draft.name.trim() || undefined,
      email: email || undefined,
      phone: phone || undefined,
      message: draft.message.trim() || undefined,
    };
    setSaving(true);
    const res = isNew ? await createLead(spaceId!, body) : await updateLead(spaceId!, lead!.id, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    if (isNew) {
      router.back();
      return;
    }
    initial.current = JSON.stringify(draft);
    setLead(res.data);
    setDraft({ ...draft });
  };

  const remove = () =>
    AppAlert.alert('Delete this lead?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteLead(spaceId!, lead!.id);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const open = (url: string) => Linking.openURL(url).catch(() => AppAlert.alert("Couldn't open", 'No app on this phone can handle that.'));

  const title = isNew ? 'New lead' : 'Lead';

  if (!draft) {
    return (
      <CosmosScreen>
        <Stack.Screen options={{ title }} />
        <View style={styles.pad}>
          {error ? (
            <View style={[styles.card, { backgroundColor: c.raised }]}>
              <Text style={[styles.meta, { color: c.soft, textAlign: 'center' }]}>{error}</Text>
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={170} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={220} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  // Ways to reach them, as one-tap actions in the identity card.
  const reach = lead
    ? [
        lead.email ? { label: 'Email', I: EnvelopeSimple, url: `mailto:${lead.email}` } : null,
        lead.phone ? { label: 'Call', I: Phone, url: `tel:${lead.phone}` } : null,
        lead.phone ? { label: 'WhatsApp', I: WhatsappLogo, url: `https://wa.me/${waNumber(lead.phone)}` } : null,
      ].filter((r): r is { label: string; I: typeof Phone; url: string } => r !== null)
    : [];

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      footer={
        <SaveBar visible={isNew || dirty} label={isNew ? 'Add lead' : 'Save changes'} onPress={() => void save()} loading={saving} disabled={deleting} error={error} />
      }
    >
      <Stack.Screen options={{ title }} />

      {lead ? (
        <>
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <Text style={[styles.name, { color: c.text }]} accessibilityRole="header">
              {leadName(lead)}
            </Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {[
                LEAD_SOURCE_LABEL[lead.source],
                lead.event?.title,
                new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {reach.length > 0 ? (
              <View style={styles.reach}>
                {reach.map(({ label, I, url }) => (
                  <PressableScale
                    key={label}
                    onPress={() => open(url)}
                    accessibilityRole="link"
                    accessibilityLabel={label}
                    style={[styles.reachBtn, { borderColor: c.outline }]}
                  >
                    <I size={ICON} color={c.text} weight="fill" />
                    <Text style={[styles.reachText, { color: c.text }]}>{label}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
          </View>

          <Section title="Stage" style={styles.firstSection}>
            <View style={styles.pad}>
              <ChipPicker
                options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
                value={lead.status}
                onChange={(s) => void stage(s)}
              />
              {staging ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[3], alignSelf: 'flex-start' }} /> : null}
            </View>
          </Section>
        </>
      ) : null}

      <Section
        title="Details"
        subtitle={isNew ? 'Add at least an email or a phone number' : undefined}
        style={lead ? undefined : styles.newFirst}
      >
        <SettingsGroup plain style={styles.group}>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} />
          <FieldRow
            stacked
            label="Email"
            value={draft.email}
            onChangeText={(v) => set({ email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldRow stacked label="Phone" value={draft.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
          <FieldRow stacked multiline label={isNew ? 'Note' : 'Message or note'} value={draft.message} onChangeText={(v) => set({ message: v })} />
        </SettingsGroup>
      </Section>

      {lead ? (
        <View style={styles.pad}>
          <AuthButton
            label="Delete lead"
            variant="danger"
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={c.danger} />}
            onPress={remove}
            style={{ marginTop: spacing[12] }}
          />
        </View>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[5] },
  name: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  reach: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  reachBtn: {
    flex: 1,
    minHeight: 64,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing[2],
  },
  reachText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  firstSection: { marginTop: spacing[10] },
  // A new lead has no identity card: the form leads the page.
  newFirst: { marginTop: 0 },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
});
