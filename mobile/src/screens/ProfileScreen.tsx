import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { CaretRight, UnGlyph } from '@unifesto/unicon/react-native';
import * as Updates from 'expo-updates';
import { useAuth } from '../context/AuthContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyUnreadCount } from '../lib/api/support';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { initials } from '../components/profile/IdentityHeader';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import IconTile, { TILES } from '../components/profile/IconTile';
import SystemGlyph from '../components/profile/SystemGlyph';
import AuthButton from '../components/auth/AuthButton';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

const AVATAR = 60;
/** Past this Dynamic Type scale the identity lines wrap instead of truncating. */
const LARGE_TEXT = 1.3;

interface Nudge {
  title: string;
  to: Href;
  tile: keyof typeof TILES;
}

/**
 * The single "finish your profile" row under my name, or null.
 * Home already nags for a username and a name; this is the Profile tab's own
 * chance to ask for what makes the public profile worth opening.
 */
function profileNudge(profile: AuthAPI.User): Nudge | null {
  if (!profile.avatarUrl) return { title: 'Add a photo', to: '/edit-profile', tile: 'photo' };
  if (!profile.bio) return { title: 'Write a short bio', to: '/edit-profile', tile: 'bio' };
  return null;
}

/**
 * Me in one row, like the top of iOS Settings: photo, name and handle, opening
 * my public profile. Bio, "since" and my numbers live on View profile.
 */
function IdentityRow({ profile, onPress }: { profile: AuthAPI.User; onPress: () => void }) {
  const c = useCosmos();
  const large = useWindowDimensions().fontScale > LARGE_TEXT;
  const name = profile.fullName || profile.username || 'My profile';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint="Opens my public profile"
      style={({ pressed }) => [styles.identity, pressed && { opacity: 0.6 }]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.avatar, { backgroundColor: c.raised }]}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={[styles.initials, { color: c.text }]}>{initials(name) || '·'}</Text>
        )}
      </View>
      <View style={styles.who}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={large ? undefined : 2}>{name}</Text>
        <Text style={[styles.sub, { color: c.muted }]} numberOfLines={large ? undefined : 1}>
          {profile.username ? `@${profile.username}` : 'View my profile'}
        </Text>
      </View>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
}

function IdentityRowSkeleton() {
  return (
    <View style={styles.identity} accessible accessibilityLabel="Loading profile">
      <Skeleton width={AVATAR} height={AVATAR} borderRadius={AVATAR / 2} />
      <View style={[styles.who, { gap: 8 }]}>
        <Skeleton width={150} height={18} borderRadius={6} />
        <Skeleton width={100} height={13} borderRadius={6} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const access = useSpaceAccess();
  const { token, isLoading: authLoading, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
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

  // A downloaded OTA waiting for a restart: Settings › About applies it.
  const { isUpdatePending } = Updates.useUpdates();

  const header = (
    <View style={[styles.header, { paddingTop: topInset + spacing[4] }]}>
      <Text accessibilityRole="header" style={[styles.pageTitle, { color: c.text }]}>Profile</Text>
      {isAuthenticated ? (
        <Pressable
          onPress={() => router.push('/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <SystemGlyph sf="pencil" glyph="pencil-simple" size={22} color={c.text} />
        </Pressable>
      ) : null}
    </View>
  );

  // Settings, help, About and Sign out live one level down (SettingsScreen).
  // What those rows used to flag (a support reply, an update waiting) rides here.
  const settings = (
    <SettingsGroup flat style={styles.group}>
      <SettingsRow
        icon={<IconTile {...TILES.settings} />}
        label="Settings and help"
        value={supportUnread ? `${supportUnread} new` : isUpdatePending ? 'Update ready' : undefined}
        onPress={() => router.push('/settings')}
      />
    </SettingsGroup>
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
          {settings}
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
          {profile ? <IdentityRow profile={profile} onPress={() => router.push('/user-profile')} /> : <IdentityRowSkeleton />}
        </View>

        {nudge ? (
          <SettingsGroup flat style={[styles.group, styles.first]}>
            <SettingsRow icon={<IconTile {...TILES[nudge.tile]} />} label={nudge.title} accent={c.sky} onPress={() => router.push(nudge.to)} />
          </SettingsGroup>
        ) : null}

        {/* Tickets has its own tab, so it isn't repeated here. */}
        <SettingsGroup flat title="My stuff" style={styles.group}>
          <SettingsRow icon={<IconTile {...TILES.saved} />} label="Saved" onPress={() => router.push('/favorites')} />
          <SettingsRow icon={<IconTile {...TILES.certificates} />} label="Certificates" onPress={() => router.push('/certificates')} />
          <SettingsRow icon={<IconTile {...TILES.spaces} />} label="My spaces" onPress={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })} />
        </SettingsGroup>

        {/* Hosts get a door into their Space tab. Starting one stays for everyone:
            people who already run a space can start another. */}
        {/* Starting something is an action, so those rows close the list in the sky accent. */}
        <SettingsGroup flat title="Hosting" style={styles.group}>
          {hosts ? <SettingsRow icon={<IconTile {...TILES.openSpace} />} label="Open my space" onPress={() => router.navigate('/space')} /> : null}
          <SettingsRow
            icon={<IconTile {...TILES.startSpace} />}
            label={hosts ? 'Start another space' : 'Start a space'}
            accent={c.sky}
            onPress={() => router.push('/space-request')}
          />
          {/* D7: no space yet? One event is enough to start. */}
          {!hosts ? (
            <SettingsRow icon={<IconTile {...TILES.hostEvent} />} label="Host one event" accent={c.sky} onPress={() => router.push('/event-request')} />
          ) : null}
        </SettingsGroup>

        {settings}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 140, flexGrow: 1 },
  pad: { paddingHorizontal: GUTTER },
  header: { paddingHorizontal: GUTTER, marginBottom: spacing[6], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: typography.fontSize['3xl'], lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 22, ...cosmosFont.strong },
  who: { flex: 1 },
  name: { fontSize: typography.fontSize.xl, lineHeight: 26, ...cosmosFont.strong },
  sub: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  // Grouped lists: SettingsGroup owns the section spacing and its muted title.
  group: { marginHorizontal: GUTTER },
  // Right under my name: the nudge reads as part of it.
  first: { marginTop: spacing[5] },
  guest: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: spacing[8] },
  guestTitle: { marginTop: spacing[4], fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  guestBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  guestButton: { marginTop: spacing[6], alignSelf: 'stretch' },
});
