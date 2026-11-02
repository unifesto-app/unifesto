import { EMAIL_RE } from '../lib/constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CalendarBlank, PaperPlaneTilt, Trash } from '@unifesto/unicon/react-native';
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
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const LOGO = 72;
const ICON = 28;

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
 * Identity sits on the page; fields keep their form cards; lists are rows;
 * Send invite is the sky action and Remove the danger row.
 */
export default function SponsorEditorScreen() {
  const { spaceId, sponsorId } = useLocalSearchParams<{ spaceId: string; sponsorId: string }>();
  const isNew = !sponsorId || sponsorId === 'new';
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
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
      AppAlert.alert('Check the email', 'Enter the email to send their invite to.');
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
      <CosmosScreen>
        <Stack.Screen options={{ title }} />
        <View style={styles.pad}>
          {error ? (
            <Text style={[styles.body, styles.error, { color: c.muted }]}>{error}</Text>
          ) : (
            <>
              <Skeleton width="100%" height={120} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={220} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  const events = detail?.eventSponsors ?? [];

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      footer={
        <SaveBar
          visible={isNew || dirty}
          label={isNew ? 'Add sponsor' : 'Save changes'}
          onPress={() => void save()}
          loading={saving}
          disabled={deleting || uploading}
          error={error}
        />
      }
    >
      <Stack.Screen options={{ title }} />

      {/* Logo + live name, on the page: what attendees see on event pages */}
      <View style={[styles.pad, styles.identity]}>
        <Pressable
          onPress={() => void pickLogo()}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={draft.logoUrl ? 'Change logo' : 'Add logo'}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <SponsorMark name={draft.name || '?'} logoUrl={draft.logoUrl || null} size={LOGO} />
          {uploading ? (
            <View style={[styles.logoBusy, { backgroundColor: c.raised }]}>
              <ActivityIndicator color={c.text} />
            </View>
          ) : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: draft.name ? c.text : c.muted }]} numberOfLines={2}>
            {draft.name || 'Sponsor name'}
          </Text>
          <View style={styles.logoActions}>
            <Text style={[styles.link, { color: c.text }]} onPress={() => void pickLogo()} accessibilityRole="button">
              {draft.logoUrl ? 'Change logo' : 'Add logo'}
            </Text>
            {draft.logoUrl ? (
              <Text style={[styles.link, { color: c.muted }]} onPress={() => set({ logoUrl: '' })} accessibilityRole="button">
                Remove
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <SettingsGroup title="Details" plain style={[styles.group, styles.first]}>
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

      <SettingsGroup title="Contact" plain style={styles.group}>
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
      <Text style={[styles.note, { color: c.muted }]}>Only your team sees the contact.</Text>

      {!isNew ? (
        <>
          <SettingsGroup flat title="On events" style={styles.group}>
            {events.length === 0 ? <SettingsRow label="Not attached to any event yet" /> : null}
            {events.map((es) => (
              <SettingsRow
                key={es.id}
                icon={<CalendarBlank size={ICON} color={c.sky} />}
                label={es.event.title}
                onPress={() =>
                  router.push({ pathname: `/manage/event/${es.event.id}/sponsors`, params: { spaceId: spaceId!, title: es.event.title } })
                }
              />
            ))}
          </SettingsGroup>
          <Text style={[styles.note, { color: c.muted }]}>To attach it, open an event and go to Sponsors.</Text>

          {/* Booth scanning and this sponsor's leads, in the app or on the web. */}
          <SettingsGroup flat title="Portal access" style={styles.group}>
            {users.length === 0 ? <SettingsRow label="No one yet" /> : null}
            {users.map((u) => (
              <SettingsRow
                key={u.id}
                label={u.user.fullName || u.invitedEmail || 'Invited'}
                value={u.status === 'ACTIVE' ? 'Active' : 'Invited'}
                onPress={() => revoke(u)}
              />
            ))}
          </SettingsGroup>
          <SettingsGroup plain style={[styles.group, { marginTop: spacing[4] }]}>
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
          <Text style={[styles.note, { color: c.muted }]}>
            We email them an invite. They sign in with this email, no account needed first. Tap a person to remove them.
          </Text>
          {/* Sending is the action: sky, muted and inert until there's an email. */}
          <SettingsGroup flat style={[styles.group, { marginTop: spacing[2] }]}>
            <SettingsRow
              icon={<PaperPlaneTilt size={ICON} color={inviteEmail.trim() ? c.sky : c.muted} />}
              label="Send invite"
              value={inviting ? 'Sending…' : undefined}
              accent={inviteEmail.trim() ? c.sky : c.muted}
              onPress={inviting || !inviteEmail.trim() ? undefined : () => void invite()}
            />
          </SettingsGroup>

          <SettingsGroup flat style={styles.group}>
            <SettingsRow
              icon={<Trash size={ICON} color={c.danger} />}
              label="Remove sponsor"
              value={deleting ? 'Removing…' : undefined}
              danger
              onPress={saving || deleting ? undefined : remove}
            />
          </SettingsGroup>
        </>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  error: { marginTop: spacing[10], textAlign: 'center' },
  body: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  name: { fontSize: typography.fontSize.lg, lineHeight: 24, ...cosmosFont.strong },
  logoBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
    borderRadius: LOGO / 4,
  },
  logoActions: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[2] },
  link: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  first: { marginTop: spacing[8] },
  // Grouped lists and forms: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  note: {
    marginTop: spacing[3],
    marginHorizontal: GUTTER + spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    ...cosmosFont.body,
  },
});
