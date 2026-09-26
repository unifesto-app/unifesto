import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CalendarBlank, PaperPlaneTilt, Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createSponsor,
  deleteSponsor,
  getSponsor,
  getSponsorUsers,
  inviteSponsorUser,
  revokeSponsorUser,
  updateSponsor,
  uploadSponsorLogo,
  type SponsorDetail,
  type SponsorUpdate,
  type SponsorUser,
} from '../lib/api/spaceSponsors';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SponsorMark from '../components/manage/SponsorMark';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const LOGO = 88;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Draft {
  name: string;
  logoUrl: string;
  websiteUrl: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

const EMPTY: Draft = { name: '', logoUrl: '', websiteUrl: '', description: '', contactName: '', contactEmail: '', contactPhone: '' };

const toDraft = (s: SponsorDetail): Draft => ({
  name: s.name,
  logoUrl: s.logoUrl ?? '',
  websiteUrl: s.websiteUrl ?? '',
  description: s.description ?? '',
  contactName: s.contactName ?? '',
  contactEmail: s.contactEmail ?? '',
  contactPhone: s.contactPhone ?? '',
});

/** "acme.com" → "https://acme.com"; blank stays blank. */
const withScheme = (url: string) => {
  const u = url.trim();
  return !u || /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/**
 * Add or edit one roster sponsor. For an existing sponsor this also shows where
 * it's attached and who can sign in to its portal (booth scanning + leads).
 */
export default function SponsorEditorScreen() {
  const { spaceId, sponsorId } = useLocalSearchParams<{ spaceId: string; sponsorId: string }>();
  const isNew = !sponsorId || sponsorId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [detail, setDetail] = useState<SponsorDetail | null>(null);
  const [users, setUsers] = useState<SponsorUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('SponsorEditor');

  const loadUsers = useCallback(async () => {
    if (isNew || !spaceId) return;
    const res = await getSponsorUsers(spaceId, sponsorId!);
    if (res.ok) setUsers(res.data.filter((u) => u.status !== 'REVOKED'));
  }, [isNew, spaceId, sponsorId]);

  useEffect(() => {
    if (isNew || !spaceId) return;
    void getSponsor(spaceId, sponsorId!).then((res) => {
      if (!res.ok) {
        setError(res.denied ? 'Only Space admins can manage sponsors.' : 'This sponsor no longer exists.');
        return;
      }
      const d = toDraft(res.data);
      initial.current = JSON.stringify(d);
      setDetail(res.data);
      setDraft(d);
    });
    void loadUsers();
  }, [isNew, spaceId, sponsorId, loadUsers]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = draft !== null && JSON.stringify(draft) !== initial.current;

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      AppAlert.alert('Photos access needed', 'Allow photo library access to choose a logo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    const up = await uploadSponsorLogo(spaceId!, res.assets[0].uri);
    setUploading(false);
    if (!up.ok) {
      AppAlert.alert("Couldn't upload", up.message);
      return;
    }
    set({ logoUrl: up.data.logoUrl });
  };

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const email = draft.contactEmail.trim();
    if (!name) return setError('Give the sponsor a name.');
    if (email && !EMAIL_RE.test(email)) return setError("That contact email doesn't look right.");
    // Blank = left out on create, null on update: the API's @IsUrl/@IsEmail
    // reject "", while @IsOptional lets null through and it clears the column.
    const clean = (v: string) => v.trim() || (isNew ? undefined : null);
    const body: SponsorUpdate = {
      name,
      logoUrl: clean(draft.logoUrl),
      websiteUrl: clean(withScheme(draft.websiteUrl)),
      description: clean(draft.description),
      contactName: clean(draft.contactName),
      contactEmail: clean(email),
      contactPhone: clean(draft.contactPhone),
    };
    setSaving(true);
    const res = isNew ? await createSponsor(spaceId!, body) : await updateSponsor(spaceId!, sponsorId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    // A new sponsor opens straight into its full page (events + portal access).
    if (isNew) router.replace({ pathname: `/manage/space/${spaceId}/sponsor`, params: { sponsorId: res.data.id } });
    else {
      initial.current = JSON.stringify(draft);
      setDraft({ ...draft });
    }
  };

  const remove = () =>
    AppAlert.alert(`Remove ${draft?.name}?`, 'It comes off every event it sponsors, and the leads captured for it are deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteSponsor(spaceId!, sponsorId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't remove", res.message);
          router.back();
        },
      },
    ]);

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!EMAIL_RE.test(email)) {
      AppAlert.alert('Check the email', 'Enter the email on their Unifesto account.');
      return;
    }
    setInviting(true);
    const res = await inviteSponsorUser(spaceId!, sponsorId!, email);
    setInviting(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't invite", res.message);
      return;
    }
    setInviteEmail('');
    void loadUsers();
  };

  const revoke = (u: SponsorUser) =>
    AppAlert.alert(`Remove ${u.user.fullName || u.invitedEmail || 'this person'}?`, "They lose access to this sponsor's leads and booth scanning.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const res = await revokeSponsorUser(spaceId!, sponsorId!, u.id);
          if (!res.ok) return AppAlert.alert("Couldn't remove", res.message);
          setUsers((list) => list.filter((x) => x.id !== u.id));
        },
      },
    ]);

  const title = isNew ? 'New sponsor' : 'Sponsor';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const events = detail?.eventSponsors ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <Pressable
          onPress={() => void pickLogo()}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={draft.logoUrl ? 'Change logo' : 'Add logo'}
          style={({ pressed }) => [styles.logoWrap, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <SponsorMark name={draft.name || '?'} logoUrl={draft.logoUrl || null} size={LOGO} />
          {uploading ? (
            <View style={styles.logoBusy}>
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.logoActions}>
          <Text style={[styles.link, { color: tokens.accent }]} onPress={() => void pickLogo()}>
            {draft.logoUrl ? 'Change logo' : 'Add logo'}
          </Text>
          {draft.logoUrl ? (
            <Text style={[styles.link, { color: tokens.textMuted }]} onPress={() => set({ logoUrl: '' })}>
              Remove
            </Text>
          ) : null}
        </View>

        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Acme Corp" />
          <FieldRow
            stacked
            label="Website"
            value={draft.websiteUrl}
            onChangeText={(v) => set({ websiteUrl: v })}
            placeholder="acme.com"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldRow
            stacked
            multiline
            label="Short description (shown on event pages)"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="What they do, in a line"
          />
        </SettingsGroup>

        <SettingsGroup title="Contact (only your team sees this)" plain>
          <FieldRow stacked label="Name" value={draft.contactName} onChangeText={(v) => set({ contactName: v })} />
          <FieldRow
            stacked
            label="Email"
            value={draft.contactEmail}
            onChangeText={(v) => set({ contactEmail: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldRow stacked label="Phone" value={draft.contactPhone} onChangeText={(v) => set({ contactPhone: v })} keyboardType="phone-pad" />
        </SettingsGroup>

        {!isNew ? (
          <>
            <SettingsGroup title="On events">
              {events.length === 0 ? <SettingsRow label="Not attached to any event yet" /> : null}
              {events.map((es) => (
                <SettingsRow
                  key={es.id}
                  icon={<CalendarBlank size={24} color={tokens.accent} weight="fill" />}
                  label={es.event.title}
                  onPress={() =>
                    router.push({ pathname: `/manage/event/${es.event.id}/sponsors`, params: { spaceId: spaceId!, title: es.event.title } })
                  }
                />
              ))}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>To attach it, open an event and go to Sponsors.</Text>

            <View style={{ marginTop: spacing[6] }}>
              <SettingsGroup title="Portal access" plain>
                {users.map((u) => (
                  <SettingsRow
                    key={u.id}
                    label={u.user.fullName || u.invitedEmail || 'Invited'}
                    value={u.status === 'ACTIVE' ? 'Active' : 'Invited'}
                    onPress={() => revoke(u)}
                  />
                ))}
                <FieldRow
                  stacked
                  label="Invite by email"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="person@company.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void invite()}
                />
              </SettingsGroup>
              <Text style={[styles.note, { color: tokens.textMuted }]}>
                People you invite can scan attendee tickets at the booth and see this sponsor's leads, in the Unifesto app or on the web.
                They need a Unifesto account with this email. Tap a person to remove them.
              </Text>
              <Button
                label="Send invite"
                variant="secondary"
                fullWidth
                loading={inviting}
                disabled={!inviteEmail.trim()}
                icon={<PaperPlaneTilt size={18} color={tokens.text} weight="bold" />}
                onPress={() => void invite()}
                style={{ marginTop: spacing[3] }}
              />
            </View>

            <Button
              label="Remove sponsor"
              variant="danger"
              size="lg"
              fullWidth
              loading={deleting}
              disabled={saving}
              icon={<Trash size={18} color={tokens.danger} weight="bold" />}
              onPress={remove}
              style={{ marginTop: spacing[10] }}
            />
          </>
        ) : null}
      </ScrollView>

      <SaveBar
        visible={isNew || dirty}
        label={isNew ? 'Add sponsor' : 'Save changes'}
        onPress={() => void save()}
        loading={saving}
        disabled={deleting || uploading}
        error={error}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  logoWrap: { alignSelf: 'center', marginTop: spacing[2] },
  logoBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 12,
  },
  logoActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing[5], marginTop: spacing[3], marginBottom: spacing[6] },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
