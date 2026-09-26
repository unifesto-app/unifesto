import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { Certificate, Handshake, Heart, SignOut, User, UsersThree } from 'phosphor-react-native';
import * as Application from 'expo-application';
import { UnIcon } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';
import * as AuthAPI from '../lib/api/auth';
import { getMyPartnerLinks } from '../lib/api/tracking';
import { openStoreReview } from '../utils/storeReview';
import { checkForAppUpdate } from '../lib/appUpdate';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { useStableTopInset } from '../components/CustomHeader';
import BrandGlow from '../components/ui/BrandGlow';
import { Button } from '../components/ui';
import UnifestoAppWordmark from '../components/UnifestoAppWordmark';
import ProfileHero, { ProfileHeroSkeleton } from '../components/profile/ProfileHero';
import QuickTiles from '../components/profile/QuickTiles';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';

const GUTTER = spacing[6];
const ICON = 28;

const openExternal = (url: string, name: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${name}`));

export default function ProfileScreen() {
  const router = useRouter();
  const { tokens, theme } = useTheme();
  const topInset = useStableTopInset();
  const { token, logout, isLoading: authLoading, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  // Only partners (an event curator added them) get the Partner stats row.
  const [isPartner, setIsPartner] = useState(false);

  useAnalyticsScreenTracking('Profile');

  const fetchProfile = async () => {
    try {
      if (token) {
        const [user, partner] = await Promise.all([AuthAPI.getCurrentUser(token), getMyPartnerLinks()]);
        setProfile(user);
        setIsPartner(partner.ok && partner.data.length > 0);
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to load profile:', error);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    fetchProfile().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, isAuthenticated]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
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

  const header = (
    <View style={{ paddingTop: topInset + spacing[4] }}>
      <Text style={[styles.pageTitle, { color: tokens.text }]}>Profile</Text>
    </View>
  );

  // ── Guest ────────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <BrandGlow />
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={[styles.content, { flexGrow: 1 }]}
        >
          {header}
          <View style={styles.guest}>
            <View style={styles.guestIcon}>
              <User size={48} color={tokens.accent} weight="duotone" />
            </View>
            <Text style={[styles.guestTitle, { color: tokens.text }]}>Make it yours</Text>
            <Text style={[styles.guestBody, { color: tokens.textMuted }]}>
              Sign in to save events, collect certificates and join the spaces you care about.
            </Text>
            <Button label="Sign in" size="lg" fullWidth onPress={() => router.push('/login')} style={{ marginTop: spacing[6], alignSelf: 'stretch' }} />
            <Text style={[styles.browse, { color: tokens.textSecondary }]} onPress={() => router.navigate('/(tabs)')} accessibilityRole="link">
              Browse events
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const unicon = (name: React.ComponentProps<typeof UnIcon>['name']) => <UnIcon name={name} size={ICON} />;

  // A plain View wraps the ScrollView so the native tab host doesn't add its
  // own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <BrandGlow />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topInset}
          />
        }
      >
        {header}

        <View style={{ marginTop: spacing[6] }}>
          {authLoading || isLoading ? (
            <ProfileHeroSkeleton />
          ) : (
            <ProfileHero
              name={profile?.fullName || profile?.username || 'My profile'}
              username={profile?.username}
              avatarUrl={profile?.avatarUrl}
              bio={profile?.bio}
              memberSince={profile?.createdAt}
              onEdit={() => router.push('/edit-profile')}
              onViewPublic={() => router.push('/user-profile')}
            />
          )}
        </View>

        <View style={{ marginTop: spacing[8] }}>
          <QuickTiles
            tiles={[
              { key: 'saved', label: 'Saved', icon: <Heart size={20} color={tokens.accent} weight="fill" />, onPress: () => router.push('/favorites') },
              { key: 'certs', label: 'Certificates', icon: <Certificate size={20} color={tokens.accent} weight="fill" />, onPress: () => router.push('/certificates') },
              { key: 'circles', label: 'My circles', icon: <UsersThree size={20} color={tokens.accent} weight="fill" />, onPress: () => router.push({ pathname: '/spaces', params: { mine: 'true' } }) },
            ]}
          />
        </View>

        <SettingsGroup title="Account">
          <SettingsRow icon={unicon('account')} label="Account settings" onPress={() => router.push('/account')} />
          <SettingsRow icon={unicon('notification')} label="Notifications" onPress={() => router.push('/notification-settings')} />
          <SettingsRow icon={unicon('permission')} label="Permissions" onPress={() => router.push('/permissions')} />
          <SettingsRow
            icon={unicon('appearance')}
            label="Appearance"
            value={theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            onPress={() => router.push('/appearance')}
          />
        </SettingsGroup>

        {/* Check-in and Judging live in the Space tab (operators only). */}
        <SettingsGroup title="For organisers">
          <SettingsRow icon={unicon('plus')} label="Request a space" onPress={() => router.push('/space-request')} />
          {isPartner ? (
            <SettingsRow
              icon={<Handshake size={ICON} color={tokens.accent} weight="fill" />}
              label="Partner stats"
              onPress={() => router.push('/partner')}
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title="Help and more">
          <SettingsRow icon={unicon('support')} label="Contact support" onPress={() => router.push('/support')} />
          <SettingsRow
            icon={unicon('update')}
            label="Check for updates"
            value={version ? `v${version}` : undefined}
            onPress={() => checkForAppUpdate({ manual: true })}
          />
          <SettingsRow icon={unicon('rate')} label="Rate Unifesto" external onPress={() => openStoreReview().catch(() => {})} />
          <SettingsRow icon={unicon('instagram')} label="Instagram" external onPress={() => openExternal('https://www.instagram.com/unifesto.app/', 'Instagram')} />
          <SettingsRow icon={unicon('x')} label="X" external onPress={() => openExternal('https://x.com/HeyUnifesto', 'X')} />
        </SettingsGroup>

        <Pressable
          onPress={handleLogout}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.signOut,
            LIQUID_GLASS
              ? { borderWidth: 0, transform: [{ scale: pressed ? 0.97 : 1 }] } // opacity/bg changes would fight the glass
              : { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: pressed ? 'rgba(239,68,68,0.1)' : 'transparent' },
          ]}
        >
          <GlassFill interactive tint="rgba(239,68,68,0.18)" />
          <SignOut size={18} color={tokens.danger} weight="bold" />
          <Text style={[styles.signOutText, { color: tokens.danger }]}>Sign out</Text>
        </Pressable>

        <View style={styles.footer}>
          <UnifestoAppWordmark width={112} height={34} />
          {version ? <Text style={[styles.version, { color: tokens.textMuted }]}>Version {version}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 140 },
  pageTitle: {
    fontSize: typography.fontSize['4xl'],
    lineHeight: typography.fontSize['4xl'] * 1.1,
    letterSpacing: -0.8,
    ...font('heading'),
  },
  signOut: {
    marginTop: spacing[8],
    height: 52,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  signOutText: { fontSize: typography.fontSize.base, ...font('semibold') },
  footer: { alignItems: 'center', marginTop: spacing[10], gap: 4, opacity: 0.7 },
  version: { fontSize: typography.fontSize.xs, ...font() },
  guest: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  guestIcon: { marginBottom: spacing[5] },
  guestTitle: { fontSize: typography.fontSize['2xl'], textAlign: 'center', ...font('heading') },
  guestBody: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
    ...font(),
  },
  browse: { marginTop: spacing[5], fontSize: typography.fontSize.sm, ...font('semibold') },
});
