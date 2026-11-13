import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { UnGlyph } from '../components/ui/icons';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyUnreadCount } from '../lib/api/support';
import { openStoreReview } from '../utils/storeReview';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import BrandWordmark from '../components/BrandWordmark';
import { GUTTER } from '../components/home/Section';
import IdentityHeader, { IdentityHeaderSkeleton } from '../components/profile/IdentityHeader';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import ProfileIcon, { type ProfileIconName } from '../components/profile/ProfileIcon';
import BrandIcon, { type Brand } from '../components/profile/BrandIcon';
import AuthButton from '../components/auth/AuthButton';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import { openWhatsNew } from '../components/WhatsNewSheet';

const openExternal = (url: string, name: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${name}`));

/** Where Unifesto posts: real marks in one line above the wordmark. */
const SOCIALS: { brand: Brand; name: string; url: string }[] = [
  { brand: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/unifesto.app/' },
  { brand: 'x', name: 'X', url: 'https://x.com/unifestoapp' },
  { brand: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/company/unifesto' },
  { brand: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/@unifesto-app' },
];

interface Nudge {
  title: string;
  to: Href;
  icon: ProfileIconName;
}

/**
 * The single "finish your profile" row under my name, or null.
 * Home already nags for a username and a name; this is the Profile tab's own
 * chance to ask for what makes the public profile worth opening.
 */
function profileNudge(profile: AuthAPI.User): Nudge | null {
  if (!profile.avatarUrl) return { title: 'Add a photo', to: '/edit-profile', icon: 'camera' };
  if (!profile.bio) return { title: 'Write a short bio', to: '/edit-profile', icon: 'pencil' };
  return null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const c = useCosmos();
  const { theme } = useTheme();
  const topInset = useStableTopInset();
  const access = useSpaceAccess();
  const { token, logout, isLoading: authLoading, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    // My numbers live on View profile now, so this tab only needs me and the support count.
    const [user, unread] = await Promise.allSettled([AuthAPI.getCurrentUser(), getMyUnreadCount()]);
    if (unread.status === 'fulfilled') setSupportUnread(unread.value);
    if (user.status === 'fulfilled') setProfile(user.value);
    else if (__DEV__) console.error('Failed to load profile:', user.reason);
  }, [token]);

  // On focus, so edits made in Edit profile show the moment you come back.
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && isAuthenticated) void load();
    }, [authLoading, isAuthenticated, load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLogout = () => {
    AppAlert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            router.replace('/login');
          } catch {
            AppAlert.alert('Error', 'Failed to sign out. Please try again.');
          }
        },
      },
    ]);
  };

  const version = Application.nativeApplicationVersion;
  // A downloaded OTA waiting for a restart: point people at About to apply it.
  const { isUpdatePending } = Updates.useUpdates();
  // Row icons (ProfileIcon) carry their job's accent: sky tickets, events and
  // actions, mint done, ivory the star, crimson sign out; plain settings stay text.

  const header = (
    <View style={[styles.header, { paddingTop: topInset + spacing[4] }]}>
      <Text accessibilityRole="header" style={[styles.pageTitle, { color: c.text }]}>Profile</Text>
    </View>
  );

  // Help is the same signed in or out.
  const help = (
    <SettingsGroup title="Help and more" style={styles.group}>
      <SettingsRow icon={<ProfileIcon name="help" />} label="Contact support" value={supportUnread ? `${supportUnread} new` : undefined} onPress={() => router.push('/support')} />
      <SettingsRow icon={<ProfileIcon name="light" color={c.sky} />} label="What’s new" onPress={openWhatsNew} />
      <SettingsRow
        icon={<ProfileIcon name="information" color={isUpdatePending ? c.mint : c.text} />}
        label="About and updates"
        value={isUpdatePending ? 'Update ready' : version ? `v${version}` : undefined}
        onPress={() => router.push('/about')}
      />
      <SettingsRow icon={<ProfileIcon name="star" color={c.ivory} />} label="Rate Unifesto" external onPress={() => openStoreReview().catch(() => {})} />
    </SettingsGroup>
  );

  // Apps show their real marks, bare, in one line above the wordmark.
  const footer = (
    <View style={styles.footer}>
      <View style={styles.socials}>
        {SOCIALS.map((s) => (
          <Pressable
            key={s.brand}
            onPress={() => openExternal(s.url, s.name)}
            accessibilityRole="link"
            accessibilityLabel={`Unifesto on ${s.name}`}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <BrandIcon brand={s.brand} size={26} />
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => router.push('/about')} accessibilityRole="button" accessibilityLabel="About and updates" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <BrandWordmark width={104} />
      </Pressable>
    </View>
  );

  // ── Guest ────────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={[column, styles.content]}>
          {header}
          {/* An empty state: one headline, one line, one button. */}
          <View style={styles.guest}>
            <UnGlyph name="user-circle" size={48} color={c.muted} />
            <Text accessibilityRole="header" style={[styles.guestTitle, { color: c.text }]}>Make it yours</Text>
            <Text style={[styles.guestBody, { color: c.muted }]}>
              Sign in to keep tickets, saved events and spaces in one place.
            </Text>
            <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={styles.guestButton} />
          </View>
          {help}
          {footer}
        </ScrollView>
      </View>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const nudge = profile ? profileNudge(profile) : null;
  const hosts = access.sections.length > 0;

  // A plain View wraps the ScrollView so the native tab host doesn't add its
  // own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[column, styles.content]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topInset} />
        }
      >
        {header}

        <View style={styles.pad}>
          {!profile ? (
            <IdentityHeaderSkeleton stats={false} />
          ) : (
            <IdentityHeader
              name={profile.fullName || profile.username || 'My profile'}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              bio={profile.bio}
              memberSince={profile.createdAt}
              onEdit={() => router.push('/edit-profile')}
              onViewPublic={() => router.push('/user-profile')}
            />
          )}
        </View>

        {nudge ? (
          <SettingsGroup style={[styles.group, styles.first]}>
            <SettingsRow icon={<ProfileIcon name={nudge.icon} color={c.sky} />} label={nudge.title} accent={c.sky} onPress={() => router.push(nudge.to)} />
          </SettingsGroup>
        ) : null}

        {/* Tickets has its own tab, so it isn't repeated here. */}
        <SettingsGroup title="My stuff" style={styles.group}>
          <SettingsRow icon={<ProfileIcon name="bookmark" color={c.sky} />} label="Saved" onPress={() => router.push('/favorites')} />
          <SettingsRow icon={<ProfileIcon name="file" color={c.mint} />} label="Certificates" onPress={() => router.push('/certificates')} />
          <SettingsRow icon={<ProfileIcon name="home" color={c.sky} />} label="My spaces" onPress={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })} />
        </SettingsGroup>

        <SettingsGroup title="Settings" style={styles.group}>
          <SettingsRow icon={<ProfileIcon name="profile" />} label="Account" onPress={() => router.push('/account')} />
          <SettingsRow icon={<ProfileIcon name="notification" />} label="Notifications" onPress={() => router.push('/notification-settings')} />
          <SettingsRow icon={<ProfileIcon name="toggle" />} label="Permissions" onPress={() => router.push('/permissions')} />
          <SettingsRow
            icon={<ProfileIcon name="brightness" />}
            label="Appearance"
            value={theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            onPress={() => router.push('/appearance')}
          />
        </SettingsGroup>

        {/* Hosts get a door into their Space tab. Starting one stays for everyone:
            people who already run a space can start another. */}
        {/* Starting something is an action, so those rows close the list in the sky accent. */}
        <SettingsGroup title="Hosting" style={styles.group}>
          {hosts ? <SettingsRow icon={<ProfileIcon name="layer" />} label="Open my space" onPress={() => router.navigate('/space')} /> : null}
          <SettingsRow
            icon={<ProfileIcon name="plus" color={c.sky} />}
            label={hosts ? 'Start another space' : 'Start a space'}
            accent={c.sky}
            onPress={() => router.push('/space-request')}
          />
          {/* D7: no space yet? One event is enough to start. */}
          {!hosts ? (
            <SettingsRow icon={<ProfileIcon name="clock" color={c.sky} />} label="Host one event" accent={c.sky} onPress={() => router.push('/event-request')} />
          ) : null}
        </SettingsGroup>

        {help}

        <SettingsGroup style={styles.group}>
          <SettingsRow icon={<ProfileIcon name="logout" color={c.danger} />} label="Sign out" danger onPress={handleLogout} />
        </SettingsGroup>

        {footer}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 140, flexGrow: 1 },
  pad: { paddingHorizontal: GUTTER },
  header: { paddingHorizontal: GUTTER, marginBottom: spacing[6] },
  pageTitle: { fontSize: typography.fontSize['3xl'], lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  // Right under my name and buttons: closer than a new section.
  first: { marginTop: spacing[6] },
  guest: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: spacing[8] },
  guestTitle: { marginTop: spacing[4], fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  guestBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  guestButton: { marginTop: spacing[6], alignSelf: 'stretch' },
  footer: { alignItems: 'center', gap: spacing[6], marginTop: spacing[12] },
  socials: { flexDirection: 'row', gap: spacing[8] },
});
