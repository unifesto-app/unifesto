import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EnvelopeSimple, Phone, Trash, WhatsappLogo } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
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
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 26;
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
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
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
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const icon = (I: typeof Phone) => <I size={ICON} color={tokens.accent} weight="fill" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {lead ? (
          <>
            <Text style={[styles.name, { color: tokens.text }]}>{leadName(lead)}</Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {[
                LEAD_SOURCE_LABEL[lead.source],
                lead.event?.title,
                new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>

            {lead.email || lead.phone ? (
              <View style={{ marginTop: spacing[5] }}>
                <SettingsGroup>
                  {lead.email ? <SettingsRow icon={icon(EnvelopeSimple)} label="Email" value={lead.email} external onPress={() => open(`mailto:${lead.email}`)} /> : null}
                  {lead.phone ? <SettingsRow icon={icon(Phone)} label="Call" value={lead.phone} external onPress={() => open(`tel:${lead.phone}`)} /> : null}
                  {lead.phone ? (
                    <SettingsRow icon={icon(WhatsappLogo)} label="WhatsApp" external onPress={() => open(`https://wa.me/${waNumber(lead.phone!)}`)} />
                  ) : null}
                </SettingsGroup>
              </View>
            ) : null}

            <View style={{ marginTop: spacing[6] }}>
              <BlockTitle>Stage</BlockTitle>
              <ChipPicker
                options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))}
                value={lead.status}
                onChange={(s) => void stage(s)}
              />
              {staging ? <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[2], alignSelf: 'flex-start' }} /> : null}
            </View>

            <View style={{ marginTop: spacing[8] }}>
              <BlockTitle>Details</BlockTitle>
            </View>
          </>
        ) : null}

        <SettingsGroup plain>
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
        {isNew ? <Text style={[styles.note, { color: tokens.textMuted }]}>Add at least an email or a phone number.</Text> : null}

        {lead ? (
          <Button
            label="Delete lead"
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={isNew || dirty} label={isNew ? 'Add lead' : 'Save changes'} onPress={() => void save()} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  name: { fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.2, ...font('heading') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
