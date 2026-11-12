import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getMyUnreadCount } from '../lib/api/support';
import { openStoreReview } from '../utils/storeReview';
import useTopSpacing from '../hooks/useTopSpacing';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import BrandWordmark from '../components/BrandWordmark';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import IconTile, { TILES } from '../components/profile/IconTile';
import BrandIcon, { type Brand } from '../components/profile/BrandIcon';
import { column, spacing } from '../theme/spacing';
import { useCosmos } from '../theme/cosmos';
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

/**
 * Profile › Settings and help: the app's settings, help, About and Sign out,
 * moved off the Profile tab so the tab is about me. Guests get Appearance,
 * Help and About (what they had on the tab, plus the theme).
 */
export default function SettingsScreen() {
  const router = useRouter();
  const c = useCosmos();
  const { theme } = useTheme();
  const topSpacing = useTopSpacing();
  const { token, logout, isAuthenticated } = useAuth();
  const [supportUnread, setSupportUnread] = useState(0);
  const version = Application.nativeApplicationVersion;
  // A downloaded OTA waiting for a restart: point people at About to apply it.
  const { isUpdatePending } = Updates.useUpdates();

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      getMyUnreadCount()
        .then(setSupportUnread)
        .catch(() => {});
    }, [token]),
  );

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

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
      >
        <SettingsGroup flat style={[styles.group, styles.first]}>
          {isAuthenticated ? <SettingsRow icon={<IconTile {...TILES.account} />} label="Account" onPress={() => router.push('/account')} /> : null}
          {isAuthenticated ? (
            <SettingsRow icon={<IconTile {...TILES.notifications} />} label="Notifications" onPress={() => router.push('/notification-settings')} />
          ) : null}
          {isAuthenticated ? <SettingsRow icon={<IconTile {...TILES.permissions} />} label="Permissions" onPress={() => router.push('/permissions')} /> : null}
          <SettingsRow
            icon={<IconTile {...TILES.appearance} />}
            label="Appearance"
            value={theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            onPress={() => router.push('/appearance')}
          />
        </SettingsGroup>

        <SettingsGroup flat title="Help and more" style={styles.group}>
          <SettingsRow icon={<IconTile {...TILES.support} />} label="Contact support" value={supportUnread ? `${supportUnread} new` : undefined} onPress={() => router.push('/support')} />
          <SettingsRow icon={<IconTile {...TILES.whatsNew} />} label="What’s new" onPress={openWhatsNew} />
          <SettingsRow
            icon={<IconTile {...TILES.about} tone={isUpdatePending ? 'mint' : TILES.about.tone} />}
            label="About and updates"
            value={isUpdatePending ? 'Update ready' : version ? `v${version}` : undefined}
            onPress={() => router.push('/about')}
          />
          <SettingsRow icon={<IconTile {...TILES.rate} />} label="Rate Unifesto" external onPress={() => openStoreReview().catch(() => {})} />
        </SettingsGroup>

        {isAuthenticated ? (
          <SettingsGroup flat style={styles.group}>
            <SettingsRow icon={<IconTile {...TILES.signOut} />} label="Sign out" danger onPress={handleLogout} />
          </SettingsGroup>
        ) : null}

        {/* Apps show their real marks, bare, in one line above the wordmark. */}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  group: { marginHorizontal: GUTTER },
  // SettingsGroup's top margin is sized between sections; tighter under the header.
  first: { marginTop: spacing[4] },
  footer: { alignItems: 'center', gap: spacing[6], marginTop: spacing[12] },
  socials: { flexDirection: 'row', gap: spacing[8] },
});
