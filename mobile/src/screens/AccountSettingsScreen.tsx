import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle, Trash } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import * as AuthAPI from '../lib/api/auth';
import { setPrimaryIdentity, removeIdentity } from '../lib/api/auth';
import { cancelAccountDeletion, deleteAccount } from '../lib/api/profile';
import Skeleton from '../components/Skeleton';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { CardBackdrop } from '../components/ui/CardSurface';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const ICON = 28;

type IconName = GlyphName;

const PROVIDER: Record<AuthAPI.UserIdentity['provider'], { label: string; icon: IconName }> = {
  GOOGLE: { label: 'Google', icon: 'google-logo' },
  APPLE: { label: 'Apple', icon: 'apple-logo' },
  EMAIL: { label: 'Email', icon: 'envelope-simple' },
};

/** "+919876543210" → "+91 98765 43210"; anything else is shown as-is. */
const formatPhone = (n?: string | null) => {
  if (!n) return 'Not set';
  const m = n.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : n;
};

/** "2026-10-25T…" → "25 October 2026". */
export const formatDeletionDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** A linked device's last activity: "Now", "3h ago", "12 Oct". */
const lastActive = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 10) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** One row per email: Google and Email sign-ins on the same address merge. */
function groupByEmail(identities: AuthAPI.UserIdentity[]) {
  const groups: { email: string | null; identities: AuthAPI.UserIdentity[] }[] = [];
  for (const identity of identities) {
    const existing = identity.email ? groups.find((g) => g.email === identity.email) : null;
    if (existing) existing.identities.push(identity);
    else groups.push({ email: identity.email, identities: [identity] });
  }
  return groups;
}

/**
 * Profile › Account: a pending deletion first (it's the one thing with a
 * deadline), then who I am here, how I sign in, and finally how to leave.
 */
export default function AccountSettingsScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const { user, token, logout, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [identities, setIdentities] = useState<AuthAPI.UserIdentity[]>([]);
  // null hides the section: a failed load shouldn't take the whole screen down.
  const [devices, setDevices] = useState<AuthAPI.LinkedDevice[] | null>(null);
  const [managing, setManaging] = useState(false);

  const loadData = useCallback(async () => {
    if (!user || !token) {
      router.back();
      return;
    }
    try {
      const [userProfile, userIdentities, linkedDevices] = await Promise.all([
        AuthAPI.getCurrentUser(),
        AuthAPI.getUserIdentities(),
        AuthAPI.getLinkedDevices().catch(() => null),
      ]);
      setProfile(userProfile);
      setIdentities(userIdentities);
      setDevices(linkedDevices);
    } catch (error) {
      if (__DEV__) console.error('Failed to load data:', error);
      AppAlert.alert('Error', 'Failed to load account settings');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Refresh on every focus so a username changed in Edit profile shows here.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const makePrimary = async (identityId: string) => {
    try {
      await setPrimaryIdentity(identityId);
      await loadData();
    } catch (e: any) {
      AppAlert.alert('Error', e.message || 'Failed to set primary email');
    }
  };

  const confirmRemove = (group: ReturnType<typeof groupByEmail>[number]) => {
    AppAlert.alert('Remove sign-in', `Remove ${group.email || PROVIDER[group.identities[0].provider].label} from your account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const identity of group.identities) await removeIdentity(identity.id);
            await loadData();
          } catch (e: any) {
            AppAlert.alert('Error', e.message || 'Failed to remove account');
          }
        },
      },
    ]);
  };

  const confirmSignOutDevice = (device: AuthAPI.LinkedDevice) => {
    AppAlert.alert(`Sign out ${device.name}?`, "It's signed out right away, and a phone stops getting notifications.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await AuthAPI.signOutDevice(device.id);
            await loadData();
          } catch (e: any) {
            AppAlert.alert('Error', e.message || "Couldn't sign that device out");
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    AppAlert.alert(
      'Delete account',
      "Your account will be deleted in 30 days. Until then you can sign in and cancel.\n\nAfter that it's permanent: your profile and sign-ins are removed and can't be recovered.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            // Blocked deletions (still owning a space, an upcoming ticket) come
            // back as a message telling the user what to do first.
            const result = await deleteAccount();
            if (!result.success) {
              AppAlert.alert("Couldn't delete account", result.error);
              return;
            }
            AppAlert.alert(
              'Deletion scheduled',
              `Your account will be deleted on ${formatDeletionDate(result.deletionScheduledFor)}. Sign in before then to keep it.`,
            );
            await logout();
            router.replace('/login');
          },
        },
      ],
    );
  };

  const handleCancelDeletion = async () => {
    try {
      await cancelAccountDeletion();
      updateUser({ deletionScheduledFor: null });
      await loadData();
      AppAlert.alert('Deletion cancelled', 'Your account will stay active.');
    } catch (e: any) {
      AppAlert.alert('Error', e.message || 'Failed to cancel account deletion');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <View style={{ paddingTop: topSpacing, paddingHorizontal: GUTTER }}>
          {[4, 2, 2].map((rows, i) => (
            <Skeleton key={i} width="100%" height={rows * 56} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
          ))}
        </View>
      </View>
    );
  }

  const unicon = (name: IconName) => <UnGlyph name={name} size={ICON} color={c.text} />;
  const groups = groupByEmail(identities);
  const since = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {profile?.deletionScheduledFor ? (
          <View style={[styles.card, styles.alert]}>
            <CardBackdrop shape={styles.card} />
            <Text style={[styles.cardTitle, { color: c.danger }]}>Deleting on {formatDeletionDate(profile.deletionScheduledFor)}</Text>
            <Text style={[styles.cardBody, { color: c.soft }]}>
              Until then everything is still here. Keep your account and nothing is lost.
            </Text>
            <AuthButton label="Keep my account" onPress={handleCancelDeletion} style={{ marginTop: spacing[5] }} />
          </View>
        ) : null}

        <Section title="My details" subtitle="Change these in Edit profile" style={styles.firstSection}>
          <SettingsGroup style={styles.group}>
            <SettingsRow icon={unicon('user')} label="Name" value={profile?.fullName || 'Not set'} onPress={() => router.push('/edit-profile')} />
            <SettingsRow
              icon={unicon('at')}
              label="Username"
              value={profile?.username ? `@${profile.username}` : 'Not set'}
              onPress={() => router.push('/edit-profile')}
            />
            <SettingsRow icon={unicon('phone')} label="Phone" value={formatPhone(profile?.mobileNumber)} />
            {since ? <SettingsRow icon={unicon('calendar-blank')} label="Member since" value={since} /> : null}
          </SettingsGroup>
        </Section>

        <Section title="Sign-in methods" subtitle="Ways you can get into Unifesto" style={styles.section}>
          <SettingsGroup
            style={styles.group}
            action={groups.length > 0 ? { label: managing ? 'Done' : 'Manage', onPress: () => setManaging((v) => !v) } : undefined}
          >
            {groups.length === 0 ? (
              <SettingsRow icon={unicon('envelope-simple')} label="No linked sign-ins" />
            ) : (
              groups.map((group) => {
                const first = group.identities[0];
                const primaryIdentity = group.identities.find((i) => i.isPrimary) || first;
                const isPrimary = group.identities.some((i) => i.isPrimary);
                const isVerified = group.identities.some((i) => i.emailVerified);
                const isPrivateRelay = !!group.email?.includes('privaterelay.appleid.com');
                const canMakePrimary = !isPrimary && !!group.email && !isPrivateRelay;
                const canRemove = groups.length > 1;

                // Two providers on one email: both marks, side by side, no framing.
                const icon =
                  group.identities.length > 1 ? (
                    <View style={styles.iconPair}>
                      <UnGlyph name={PROVIDER[first.provider].icon} size={20} color={c.text} />
                      <UnGlyph name={PROVIDER[group.identities[1].provider].icon} size={16} color={c.text} />
                    </View>
                  ) : (
                    unicon(PROVIDER[first.provider].icon)
                  );

                const trailing = managing ? (
                  <View style={styles.trailing}>
                    {canMakePrimary ? (
                      <Pressable onPress={() => makePrimary(primaryIdentity.id)} hitSlop={8} accessibilityRole="button">
                        <Text style={[styles.inlineAction, { color: c.text }]}>Make primary</Text>
                      </Pressable>
                    ) : null}
                    {canRemove ? (
                      <Pressable onPress={() => confirmRemove(group)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove">
                        <Trash size={20} color={c.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.trailing}>
                    {isPrimary ? <Text style={[styles.tag, { color: c.soft }]}>Primary</Text> : null}
                    {isVerified ? (
                      <CheckCircle size={18} color={c.success} weight="fill" accessibilityLabel="Verified" />
                    ) : null}
                  </View>
                );

                return (
                  <SettingsRow
                    key={group.email || first.id}
                    icon={icon}
                    label={group.email || PROVIDER[first.provider].label}
                    trailing={trailing}
                  />
                );
              })
            )}
          </SettingsGroup>
          {managing && groups.length === 1 ? (
            <Text style={[styles.note, { color: c.muted }]}>Add another sign-in before removing this one.</Text>
          ) : null}
        </Section>

        {devices?.length ? (
          <Section title="Linked devices" subtitle="Phones and browsers signed in to my account">
            <SettingsGroup style={styles.group} action={{ label: 'Link a device', onPress: () => router.push('/link-device') }}>
              {devices.map((d) => (
                <SettingsRow
                  key={d.id}
                  icon={unicon(d.kind === 'app' ? 'device-mobile' : 'desktop')}
                  label={d.name}
                  value={d.current ? 'This phone' : lastActive(d.lastActiveAt)}
                  trailing={
                    d.current ? undefined : (
                      <Pressable onPress={() => confirmSignOutDevice(d)} hitSlop={8} accessibilityRole="button">
                        <Text style={[styles.inlineAction, { color: c.text }]}>Sign out</Text>
                      </Pressable>
                    )
                  }
                />
              ))}
            </SettingsGroup>
          </Section>
        ) : null}

        {profile?.deletionScheduledFor ? null : (
          <Section title="Delete account" style={styles.section}>
            <View style={styles.card}>
              <CardBackdrop shape={styles.card} />
              <Text style={[styles.cardBody, { color: c.soft, marginTop: 0 }]}>
                You get 30 days to change your mind: sign in before then and cancel. After that your profile and
                sign-ins are gone for good.
              </Text>
              <AuthButton
                label="Delete my account"
                variant="danger"
                icon={<Trash size={18} color={c.danger} />}
                onPress={handleDeleteAccount}
                style={{ marginTop: spacing[5] }}
              />
            </View>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Section's default top margin is sized for Home; tighter at the top of a page.
  firstSection: { marginTop: spacing[6] },
  // A settings page steps by spacing[8] between sections (Home's are looser).
  section: { marginTop: spacing[8] },
  // SettingsGroup's own top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[5] },
  alert: { marginTop: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.lg, lineHeight: 24, ...cosmosFont.strong },
  cardBody: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: 21, ...cosmosFont.body },
  note: { marginTop: spacing[3], marginHorizontal: GUTTER, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  iconPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  tag: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  inlineAction: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
