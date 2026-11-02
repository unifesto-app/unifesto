import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyRegisteredEvents } from '../lib/api/events';
import { getUserSpaces } from '../lib/api/spaces';
import { getMyUnreadCount } from '../lib/api/support';
import { openStoreReview } from '../utils/storeReview';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import BrandWordmark from '../components/BrandWordmark';
import { GUTTER } from '../components/home/Section';
import IdentityCard, { IdentityCardSkeleton } from '../components/profile/IdentityCard';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import BrandIcon from '../components/profile/BrandIcon';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import { openWhatsNew } from '../components/WhatsNewSheet';

const ICON = 28;

const openExternal = (url: string, name: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${name}`));

interface Counts {
  upcoming: number;
  past: number;
  spaces: number;
}

interface Nudge {
  title: string;
  to: Href;
  icon: GlyphName;
}

/**
 * The single "finish your profile" row under the identity card, or null.
 * Home already nags for a username and a name; this is the Profile tab's own
 * chance to ask for what makes the public profile worth opening.
 */
function profileNudge(profile: AuthAPI.User): Nudge | null {
  if (!profile.avatarUrl) return { title: 'Add a photo', to: '/edit-profile', icon: 'image-square' };
  if (!profile.bio) return { title: 'Write a short bio', to: '/edit-profile', icon: 'user' };
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
  const [counts, setCounts] = useState<Counts | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    const [user, regs, spaces, unread] = await Promise.allSettled([
      AuthAPI.getCurrentUser(),
      getMyRegisteredEvents(1, 50),
      getUserSpaces(),
      getMyUnreadCount(),
    ]);
    if (unread.status === 'fulfilled') setSupportUnread(unread.value);
    if (user.status === 'fulfilled') setProfile(user.value);
    else if (__DEV__) console.error('Failed to load profile:', user.reason);

    // Same counting as the public profile: one per event, split at now.
    const rows: any[] = regs.status === 'fulfilled' ? regs.value?.data || regs.value?.events || [] : [];
    const events = rows.map((r) => (r.event ? r.event : r)).filter((e) => e?.id);
    const ids = new Set<string>();
    let upcoming = 0;
    let past = 0;
    const now = Date.now();
    for (const e of events) {
      if (ids.has(e.id)) continue;
      ids.add(e.id);
      if (new Date(e.startDateTime).getTime() >= now) upcoming++;
      else past++;
    }
    // /users/me/spaces returns one row per role: count spaces, not rows.
    const mySpaces = spaces.status === 'fulfilled' ? new Set((spaces.value || []).map((s) => s.id)).size : 0;
    setCounts({ upcoming, past, spaces: mySpaces });
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
  // Glyphs carry the card accent of their job (sky tickets and events, mint
  // done, ivory the gold star); settings chrome stays monochrome.
  const icon = (name: GlyphName, color: string = c.text) => <UnGlyph name={name} size={ICON} color={color} />;

  const header = (
    <View style={[styles.header, { paddingTop: topInset + spacing[4] }]}>
      <Text accessibilityRole="header" style={[styles.pageTitle, { color: c.text }]}>Profile</Text>
    </View>
  );

  // Help is the same signed in or out. Apps show their real marks.
  const help = (
    <>
      <SettingsGroup flat title="Help and more" style={styles.group}>
        <SettingsRow icon={icon('lifebuoy')} label="Contact support" value={supportUnread ? `${supportUnread} new` : undefined} onPress={() => router.push('/support')} />
        <SettingsRow icon={icon('sparkle', c.sky)} label="What’s new" onPress={openWhatsNew} />
        <SettingsRow
          icon={icon('arrows-clockwise', isUpdatePending ? c.mint : c.text)}
          label="About and updates"
          value={isUpdatePending ? 'Update ready' : version ? `v${version}` : undefined}
          onPress={() => router.push('/about')}
        />
        <SettingsRow icon={icon('star', c.ivory)} label="Rate Unifesto" external onPress={() => openStoreReview().catch(() => {})} />
      </SettingsGroup>
      <SettingsGroup flat title="Follow Unifesto" style={styles.group}>
        <SettingsRow icon={<BrandIcon brand="instagram" />} label="Instagram" external onPress={() => openExternal('https://www.instagram.com/unifesto.app/', 'Instagram')} />
        <SettingsRow icon={<BrandIcon brand="x" />} label="X" external onPress={() => openExternal('https://x.com/unifestoapp', 'X')} />
        <SettingsRow icon={<BrandIcon brand="linkedin" />} label="LinkedIn" external onPress={() => openExternal('https://www.linkedin.com/company/unifesto', 'LinkedIn')} />
        <SettingsRow icon={<BrandIcon brand="youtube" />} label="YouTube" external onPress={() => openExternal('https://www.youtube.com/@unifesto-app', 'YouTube')} />
      </SettingsGroup>
    </>
  );

  const footer = (
    <View style={styles.footer}>
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
          <SettingsGroup flat title="Make it yours" style={[styles.group, styles.first]}>
            <SettingsRow icon={icon('sign-in', c.sky)} label="Sign in" accent={c.sky} onPress={() => router.push('/login')} />
            <SettingsRow icon={icon('magnifying-glass')} label="Browse events" onPress={() => router.navigate('/(tabs)')} />
          </SettingsGroup>
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
            <IdentityCardSkeleton />
          ) : (
            <IdentityCard
              name={profile.fullName || profile.username || 'My profile'}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              bio={profile.bio}
              memberSince={profile.createdAt}
              onEdit={() => router.push('/edit-profile')}
              onViewPublic={() => router.push('/user-profile')}
              stats={[
                { label: 'Going to', value: counts?.upcoming ?? null, onPress: () => router.navigate('/tickets') },
                { label: 'Been to', value: counts?.past ?? null, onPress: () => router.push('/user-profile') },
                { label: 'Spaces', value: counts?.spaces ?? null, onPress: () => router.push({ pathname: '/spaces', params: { mine: 'true' } }) },
              ]}
            />
          )}
        </View>

        {nudge ? (
          <SettingsGroup flat style={[styles.group, styles.nudge]}>
            <SettingsRow icon={icon(nudge.icon, c.sky)} label={nudge.title} accent={c.sky} onPress={() => router.push(nudge.to)} />
          </SettingsGroup>
        ) : null}

        <SettingsGroup flat title="My stuff" style={styles.group}>
          <SettingsRow icon={icon('qr-code', c.sky)} label="Tickets" onPress={() => router.navigate('/tickets')} />
          <SettingsRow icon={icon('tag', c.sky)} label="Saved" onPress={() => router.push('/favorites')} />
          <SettingsRow icon={icon('certificate', c.mint)} label="Certificates" onPress={() => router.push('/certificates')} />
          <SettingsRow icon={icon('users-three', c.sky)} label="My spaces" onPress={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })} />
        </SettingsGroup>

        <SettingsGroup flat title="Settings" style={styles.group}>
          <SettingsRow icon={icon('user-circle')} label="Account" onPress={() => router.push('/account')} />
          <SettingsRow icon={icon('bell')} label="Notifications" onPress={() => router.push('/notification-settings')} />
          <SettingsRow icon={icon('lock-simple')} label="Permissions" onPress={() => router.push('/permissions')} />
          <SettingsRow
            icon={icon('circle-half')}
            label="Appearance"
            value={theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            onPress={() => router.push('/appearance')}
          />
        </SettingsGroup>

        {/* Hosts get a door into their Space tab. Starting one stays for everyone:
            people who already run a space can start another. */}
        {/* Starting something is an action, so those rows close the list in the sky accent. */}
        <SettingsGroup flat title="Hosting" style={styles.group}>
          {hosts ? <SettingsRow icon={icon('buildings')} label="Open my space" onPress={() => router.navigate('/space')} /> : null}
          <SettingsRow
            icon={icon('plus-circle', c.sky)}
            label={hosts ? 'Start another space' : 'Start a space'}
            accent={c.sky}
            onPress={() => router.push('/space-request')}
          />
          {/* D7: no space yet? One event is enough to start. */}
          {!hosts ? (
            <SettingsRow icon={icon('calendar-plus', c.sky)} label="Host one event" accent={c.sky} onPress={() => router.push('/event-request')} />
          ) : null}
        </SettingsGroup>

        {help}

        <SettingsGroup flat style={styles.group}>
          <SettingsRow icon={icon('sign-out', c.danger)} label="Sign out" danger onPress={handleLogout} />
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
  // Right under the header or the identity card, closer than a new section.
  first: { marginTop: 0 },
  nudge: { marginTop: spacing[4] },
  footer: { alignItems: 'center', marginTop: spacing[12] },
});
