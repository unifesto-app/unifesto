import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CheckCircle, Trash } from 'phosphor-react-native';
import { UnIcon } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useTokens } from '../context/ThemeContext';
import * as AuthAPI from '../lib/api/auth';
import { setPrimaryIdentity, removeIdentity } from '../lib/api/auth';
import { cancelAccountDeletion, deleteAccount } from '../lib/api/profile';
import Skeleton from '../components/Skeleton';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import useTopSpacing from '../hooks/useTopSpacing';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';

const GUTTER = spacing[6];
const ICON = 28;

type IconName = React.ComponentProps<typeof UnIcon>['name'];

const PROVIDER: Record<AuthAPI.UserIdentity['provider'], { label: string; icon: IconName }> = {
  GOOGLE: { label: 'Google', icon: 'google' },
  APPLE: { label: 'Apple', icon: 'apple' },
  EMAIL: { label: 'Email', icon: 'mail' },
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

export default function AccountSettingsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { user, token, logout, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [identities, setIdentities] = useState<AuthAPI.UserIdentity[]>([]);
  const [managing, setManaging] = useState(false);

  const loadData = useCallback(async () => {
    if (!user || !token) {
      router.back();
      return;
    }
    try {
      const [userProfile, userIdentities] = await Promise.all([
        AuthAPI.getCurrentUser(token),
        AuthAPI.getUserIdentities(token),
      ]);
      setProfile(userProfile);
      setIdentities(userIdentities);
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
      await setPrimaryIdentity(token!, identityId);
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
            for (const identity of group.identities) await removeIdentity(token!, identity.id);
            await loadData();
          } catch (e: any) {
            AppAlert.alert('Error', e.message || 'Failed to remove account');
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
      <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: topSpacing }]}>
        {[2, 2, 1].map((rows, i) => (
          <Skeleton key={i} width="100%" height={rows * 56} borderRadius={borderRadius.xl} style={{ marginTop: spacing[8] }} />
        ))}
      </View>
    );
  }

  const unicon = (name: IconName) => <UnIcon name={name} size={ICON} />;
  const groups = groupByEmail(identities);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <SettingsGroup title="Account">
        <SettingsRow
          icon={unicon('at')}
          label="Username"
          value={profile?.username ? `@${profile.username}` : 'Not set'}
          onPress={() => router.push('/edit-profile')}
        />
        <SettingsRow icon={unicon('phone')} label="Phone" value={formatPhone(profile?.mobileNumber)} />
      </SettingsGroup>

      <SettingsGroup
        title="Sign-in methods"
        action={groups.length > 0 ? { label: managing ? 'Done' : 'Manage', onPress: () => setManaging((v) => !v) } : undefined}
      >
        {groups.length === 0 ? (
          <SettingsRow icon={unicon('mail')} label="No linked sign-ins" />
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
                  <UnIcon name={PROVIDER[first.provider].icon} size={20} />
                  <UnIcon name={PROVIDER[group.identities[1].provider].icon} size={16} />
                </View>
              ) : (
                unicon(PROVIDER[first.provider].icon)
              );

            const trailing = managing ? (
              <View style={styles.trailing}>
                {canMakePrimary ? (
                  <Pressable onPress={() => makePrimary(primaryIdentity.id)} hitSlop={8} accessibilityRole="button">
                    <Text style={[styles.inlineAction, { color: tokens.accent }]}>Make primary</Text>
                  </Pressable>
                ) : null}
                {canRemove ? (
                  <Pressable onPress={() => confirmRemove(group)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove">
                    <Trash size={20} color={tokens.danger} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.trailing}>
                {isPrimary ? <Text style={[styles.tag, { color: tokens.accent }]}>Primary</Text> : null}
                {isVerified ? <CheckCircle size={18} color={tokens.success} weight="fill" /> : null}
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

      <SettingsGroup>
        {profile?.deletionScheduledFor ? (
          <SettingsRow
            icon={<Trash size={24} color={tokens.danger} />}
            label={`Deleting on ${formatDeletionDate(profile.deletionScheduledFor)}`}
            danger
            trailing={
              <Pressable onPress={handleCancelDeletion} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel deletion">
                <Text style={[styles.inlineAction, { color: tokens.accent }]}>Cancel</Text>
              </Pressable>
            }
          />
        ) : (
          <SettingsRow
            icon={<Trash size={24} color={tokens.danger} />}
            label="Delete account"
            danger
            onPress={handleDeleteAccount}
          />
        )}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: GUTTER },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  iconPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  tag: { fontSize: typography.fontSize.sm, ...font('semibold') },
  inlineAction: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
