import { EMAIL_RE } from '../lib/constants';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EnvelopeSimple, Phone, Trash } from '../components/ui/icons';
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
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import BrandIcon from '../components/profile/BrandIcon';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 28;

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
 * its details, or delete it. `leadId=new` adds one by hand. Who they are sits
 * on the page; ways to reach them are rows (WhatsApp with its real mark); the
 * details stay a form; Delete closes the page as a danger row.
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
            <Text style={[styles.meta, styles.error, { color: c.muted }]}>{error}</Text>
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

  // Ways to reach them, one row each; WhatsApp shows its real mark.
  const reach = lead
    ? [
        lead.email ? { label: 'Email', icon: <EnvelopeSimple size={ICON} color={c.text} />, value: lead.email, url: `mailto:${lead.email}` } : null,
        lead.phone ? { label: 'Call', icon: <Phone size={ICON} color={c.text} />, value: lead.phone, url: `tel:${lead.phone}` } : null,
        lead.phone ? { label: 'WhatsApp', icon: <BrandIcon brand="whatsapp" size={ICON} />, value: undefined, url: `https://wa.me/${waNumber(lead.phone)}` } : null,
      ].filter((r): r is { label: string; icon: React.ReactElement; value: string | undefined; url: string } => r !== null)
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
          {/* Who they are, on the page (no card). */}
          <View style={styles.pad}>
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
          </View>

          {reach.length > 0 ? (
            <SettingsGroup flat title="Reach out" style={styles.group}>
              {reach.map((r) => (
                <SettingsRow key={r.label} icon={r.icon} label={r.label} value={r.value} external onPress={() => open(r.url)} />
              ))}
            </SettingsGroup>
          ) : null}

          <View style={[styles.pad, styles.block]}>
            <Text style={[styles.listTitle, { color: c.muted }]} accessibilityRole="header">Stage</Text>
            <ChipPicker
                options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
                value={lead.status}
                onChange={(s) => void stage(s)}
              />
            {staging ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[3], alignSelf: 'flex-start' }} /> : null}
          </View>
        </>
      ) : null}

      {/* The form keeps its card: fields are controls. */}
      <SettingsGroup title="Details" plain style={[styles.group, lead ? null : styles.newFirst]}>
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
      {isNew ? <Text style={[styles.meta, styles.note, { color: c.muted }]}>Add at least an email or a phone number.</Text> : null}

      {lead ? (
        <SettingsGroup flat style={styles.group}>
          <SettingsRow
            icon={<Trash size={ICON} color={c.danger} />}
            label="Delete lead"
            value={deleting ? 'Deleting…' : undefined}
            danger
            onPress={saving || deleting ? undefined : remove}
          />
        </SettingsGroup>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  error: { marginTop: spacing[10], textAlign: 'center' },
  // A person's name: never display (DESIGN §4).
  name: { fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.strong },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  block: { marginTop: spacing[8] },
  // Same as SettingsGroup's title: muted Hanken SemiBold, sentence case.
  listTitle: { marginBottom: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[3], marginHorizontal: GUTTER + spacing[1] },
  // A new lead has no identity: the form leads the page.
  newFirst: { marginTop: 0 },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
});
