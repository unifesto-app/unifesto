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
import { getMyPartnerLinks } from '../lib/api/tracking';
import { getMyUnreadCount } from '../lib/api/support';
import { openStoreReview } from '../utils/storeReview';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import BrandWordmark from '../components/BrandWordmark';
import { GUTTER, Section } from '../components/home/Section';
import PromptCard from '../components/home/PromptCard';
import IdentityCard, { IdentityCardSkeleton } from '../components/profile/IdentityCard';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import PressableScale from '../components/ui/PressableScale';

const ICON = 28;

const openExternal = (url: string, name: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${name}`));

interface Counts {
  upcoming: number;
  past: number;
  circles: number;
}

interface Nudge {
  title: string;
  body: string;
  to: Href;
  icon: GlyphName;
}

/**
 * The single "finish your profile" card under the identity card, or null.
 * Home already nags for a username and a name; this is the Profile tab's own
 * chance to ask for what makes the public profile worth opening.
 */
function profileNudge(profile: AuthAPI.User): Nudge | null {
  if (!profile.avatarUrl) {
    return { title: 'Add a photo', body: 'So friends and organisers know it’s you.', to: '/edit-profile', icon: 'image-square' };
  }
  if (!profile.bio) {
    return { title: 'Write a short bio', body: 'A line about you for your public profile.', to: '/edit-profile', icon: 'user' };
  }
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
  // Only partners (an event curator added them) get the Partner stats row.
  const [isPartner, setIsPartner] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);

  useAnalyticsScreenTracking('Profile');

  const load = useCallback(async () => {
    if (!token) return;
    const [user, partner, regs, spaces, unread] = await Promise.allSettled([
      AuthAPI.getCurrentUser(),
      getMyPartnerLinks(),
      getMyRegisteredEvents(1, 50),
      getUserSpaces(),
      getMyUnreadCount(),
    ]);
    if (unread.status === 'fulfilled') setSupportUnread(unread.value);
    if (user.status === 'fulfilled') setProfile(user.value);
    else if (__DEV__) console.error('Failed to load profile:', user.reason);
    if (partner.status === 'fulfilled') setIsPartner(partner.value.ok && partner.value.data.length > 0);

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
    const circles = spaces.status === 'fulfilled' ? new Set((spaces.value || []).map((s) => s.id)).size : 0;
    setCounts({ upcoming, past, circles });
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
  const icon = (name: GlyphName) => <UnGlyph name={name} size={ICON} color={c.text} />;

  const header = (
    <View style={[styles.header, { paddingTop: topInset + spacing[4] }]}>
      <Text accessibilityRole="header" style={[styles.pageTitle, { color: c.text }]}>Profile</Text>
    </View>
  );

  // Help is the same signed in or out.
  const help = (
    <Section title="Help and more">
      <SettingsGroup style={styles.group}>
        <SettingsRow icon={icon('lifebuoy')} label="Contact support" value={supportUnread ? `${supportUnread} new` : undefined} onPress={() => router.push('/support')} />
        <SettingsRow icon={icon('arrows-clockwise')} label="About and updates" value={isUpdatePending ? 'Update ready' : version ? `v${version}` : undefined} onPress={() => router.push('/about')} />
        <SettingsRow icon={icon('star')} label="Rate Unifesto" external onPress={() => openStoreReview().catch(() => {})} />
        <SettingsRow icon={icon('instagram-logo')} label="Instagram" external onPress={() => openExternal('https://www.instagram.com/unifesto.app/', 'Instagram')} />
        <SettingsRow icon={icon('x-logo')} label="X" external onPress={() => openExternal('https://x.com/unifestoapp', 'X')} />
        <SettingsRow icon={icon('linkedin-logo')} label="LinkedIn" external onPress={() => openExternal('https://www.linkedin.com/company/unifesto', 'LinkedIn')} />
        <SettingsRow icon={icon('play-circle')} label="YouTube" external onPress={() => openExternal('https://www.youtube.com/@unifesto-app', 'YouTube')} />
      </SettingsGroup>
    </Section>
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
        <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={styles.content}>
          {header}
          <View style={[styles.guest, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text accessibilityRole="header" style={[styles.guestTitle, { color: c.text }]}>Make it yours</Text>
            <Text style={[styles.guestBody, { color: c.soft }]}>
              Sign in to keep your tickets, save events, collect certificates and join the circles you care about.
            </Text>
            <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={{ marginTop: spacing[6] }} />
            <AuthButton label="Browse events" variant="secondary" onPress={() => router.navigate('/(tabs)')} style={{ marginTop: spacing[3] }} />
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
        contentContainerStyle={styles.content}
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
                { label: 'Circles', value: counts?.circles ?? null, onPress: () => router.push({ pathname: '/spaces', params: { mine: 'true' } }) },
              ]}
            />
          )}
        </View>

        {nudge ? (
          <View style={{ marginTop: spacing[4] }}>
            <PromptCard
              icon={<UnGlyph name={nudge.icon} size={24} color={c.text} />}
              title={nudge.title}
              body={nudge.body}
              onPress={() => router.push(nudge.to)}
            />
          </View>
        ) : null}

        <Section title="My stuff">
          <SettingsGroup style={styles.group}>
            <SettingsRow icon={icon('qr-code')} label="Tickets" onPress={() => router.navigate('/tickets')} />
            <SettingsRow icon={icon('tag')} label="Saved" onPress={() => router.push('/favorites')} />
            <SettingsRow icon={icon('file-text')} label="Certificates" onPress={() => router.push('/certificates')} />
            <SettingsRow icon={icon('users-three')} label="My circles" onPress={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })} />
          </SettingsGroup>
        </Section>

        <Section title="Settings">
          <SettingsGroup style={styles.group}>
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
        </Section>

        {/* Hosts get a door into their Space tab. Requesting stays for everyone:
            people who already run a space can still ask for another. */}
        <Section title="Hosting">
          <SettingsGroup style={styles.group}>
            {hosts ? <SettingsRow icon={icon('buildings')} label="Open my space" onPress={() => router.navigate('/space')} /> : null}
            <SettingsRow
              icon={icon('plus-circle')}
              label={hosts ? 'Request another space' : 'Request a space'}
              onPress={() => router.push('/space-request')}
            />
            {/* D7: no space yet? One event is enough to start. */}
            {!hosts ? (
              <SettingsRow icon={icon('calendar-plus')} label="Host one event" onPress={() => router.push('/event-request')} />
            ) : null}
            {isPartner ? <SettingsRow icon={icon('megaphone')} label="Partner stats" onPress={() => router.push('/partner')} /> : null}
          </SettingsGroup>
        </Section>

        {help}

        <View style={styles.pad}>
          <PressableScale onPress={handleLogout} accessibilityRole="button" style={[styles.signOut, { borderColor: c.border }]}>
            <UnGlyph name="sign-out" size={22} color={c.danger} />
            <Text style={[styles.signOutText, { color: c.danger }]}>Sign out</Text>
          </PressableScale>
        </View>

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
  pageTitle: { fontSize: 26, lineHeight: 34, ...cosmosFont.display },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  guest: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[6] },
  guestTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  guestBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  signOut: {
    marginTop: spacing[10],
    minHeight: 52,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  signOutText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  footer: { alignItems: 'center', marginTop: spacing[12] },
});
