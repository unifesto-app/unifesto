import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../hooks/useTopSpacing';
import OneSignalService from '../services/OneSignalService';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import {
  NotificationSettings,
  getNotificationSettings,
  updateNotificationSettings,
} from '../lib/api/notifications';
import { AppAlert } from '../components/ui/AppAlert';

type NotifState = NotificationSettings;

const STORAGE_KEY = 'notification_settings_v1';

const DEFAULT_NOTIFS: NotifState = {
  pushEnabled: true,
  emailEnabled: true,
  eventReminders: true,
  newEvents: true,
  productUpdates: true,
  promotions: false,
  registrationUpdates: true,
  organiserAnnouncements: true,
};

/**
 * Profile › Notifications. Push is the master switch (the server drops every
 * push category while it's off), so it leads, and the categories below it go
 * quiet when it's off. Categories run from what matters most (my tickets) to
 * what's optional (promotions); email sits last as its own channel.
 */
export default function NotificationSettingsScreen() {
  const topSpacing = useTopSpacing();
  const c = useCosmos();
  const [notifs, setNotifs] = useState<NotifState>(DEFAULT_NOTIFS);
  const notifsRef = useRef<NotifState>(notifs);
  notifsRef.current = notifs;

  useAnalyticsScreenTracking('NotificationSettings');

  const persistLocal = useCallback(async (next: NotifState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore cache write failures.
    }
  }, []);

  // Load from cache immediately, then reconcile with backend + OS permission.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && cached) {
          setNotifs((prev) => ({ ...prev, ...(JSON.parse(cached) as Partial<NotifState>) }));
        }
      } catch {
        // Ignore cache read failures.
      }

      const remote = await getNotificationSettings();

      // Re-check OS push permission and correct pushEnabled if out of sync.
      let osGranted = false;
      try {
        osGranted = await OneSignalService.hasPermission();
      } catch {
        osGranted = false;
      }

      if (cancelled) return;

      setNotifs((prev) => {
        const base = remote ? { ...prev, ...remote } : prev;
        const next: NotifState = { ...base, pushEnabled: base.pushEnabled && osGranted };
        void persistLocal(next);
        return next;
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [persistLocal]);

  // Optimistically update state + cache, PATCH backend, revert on failure.
  const commit = useCallback(
    async (patch: Partial<NotifState>) => {
      const previous = notifsRef.current;
      const next = { ...previous, ...patch };
      setNotifs(next);
      void persistLocal(next);

      try {
        await updateNotificationSettings(patch);
      } catch {
        setNotifs(previous);
        void persistLocal(previous);
        AppAlert.alert(
          'Update failed',
          'Could not save your notification settings. Please try again.',
        );
      }
    },
    [persistLocal],
  );

  const toggle = useCallback(
    (key: keyof NotifState) => {
      void commit({ [key]: !notifsRef.current[key] } as Partial<NotifState>);
    },
    [commit],
  );

  const handlePushToggle = useCallback(async () => {
    const turningOn = !notifsRef.current.pushEnabled;

    if (!turningOn) {
      // Turning off always succeeds: opt out of the push subscription and
      // persist. OS-level permission can't be revoked from within the app.
      try {
        OneSignalService.optOutOfPush();
      } catch {
        // Ignore — still persist the user's off preference.
      }
      void commit({ pushEnabled: false });
      return;
    }

    try {
      // If the OS permission is already granted, just opt back in.
      // Otherwise request it (shows the OS prompt on first ask).
      let granted = await OneSignalService.hasPermission();
      if (!granted) {
        granted = await OneSignalService.requestPermission();
      }

      if (granted) {
        try {
          OneSignalService.optInToPush();
        } catch {
          // Ignore — still persist the user's on preference.
        }
        void commit({ pushEnabled: true });
      } else {
        // Keep OFF and guide the user to system settings.
        void commit({ pushEnabled: false });
        AppAlert.alert(
          'Permission required',
          'Please enable notifications in your device settings to receive push notifications.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch {
      void commit({ pushEnabled: false });
      AppAlert.alert(
        'Update failed',
        'Could not update push notification permissions. Please try again.',
      );
    }
  }, [commit]);

  // One toggle row: bare icon, label, native switch in the cosmos silver.
  const row = (icon: GlyphName, label: string, value: boolean, onToggle: () => void, disabled = false) => (
    <View style={disabled && styles.dim}>
      <SettingsRow
        icon={<UnGlyph name={icon} size={28} color={c.text} />}
        label={label}
        trailing={
          <Switch
            value={value}
            onValueChange={onToggle}
            disabled={disabled}
            trackColor={{ false: c.input, true: c.primary }}
            thumbColor={value ? c.primaryFg : '#ffffff'}
            ios_backgroundColor={c.input}
            accessibilityLabel={label}
          />
        }
      />
    </View>
  );

  const pushOff = !notifs.pushEnabled;
  const category = (icon: GlyphName, label: string, key: keyof NotifState) =>
    row(icon, label, notifs[key] && !pushOff, () => toggle(key), pushOff);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {pushOff ? (
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Push is off</Text>
            <Text style={[styles.cardBody, { color: c.soft }]}>
              You won’t hear about waitlist spots, reminders before your events or changes from hosts.
            </Text>
            <AuthButton label="Turn on push" onPress={handlePushToggle} style={{ marginTop: spacing[5] }} />
          </View>
        ) : (
          <View style={styles.firstGroup}>
            <SettingsGroup style={styles.group}>
              {row('bell', 'Push notifications', true, handlePushToggle)}
            </SettingsGroup>
          </View>
        )}

        <Section title="Your events" subtitle="Tickets, reminders and word from hosts">
          <SettingsGroup style={styles.group}>
            {category('ticket', 'Ticket and waitlist updates', 'registrationUpdates')}
            {category('calendar-blank', 'Event reminders', 'eventReminders')}
            {category('megaphone', 'Announcements from hosts', 'organiserAnnouncements')}
          </SettingsGroup>
        </Section>

        <Section title="Discover" subtitle="New events from the circles you follow">
          <SettingsGroup style={styles.group}>
            {category('sparkle', 'New events', 'newEvents')}
          </SettingsGroup>
        </Section>

        <Section title="From Unifesto">
          <SettingsGroup style={styles.group}>
            {category('arrows-clockwise', 'Product updates', 'productUpdates')}
            {category('tag', 'Offers and promotions', 'promotions')}
          </SettingsGroup>
        </Section>

        <Section title="Email" subtitle="Tickets, receipts and sign-in codes always arrive by email.">
          <SettingsGroup style={styles.group}>
            {row('envelope-simple', 'Email', notifs.emailEnabled, () => toggle('emailEnabled'))}
          </SettingsGroup>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // SettingsGroup's own top margin doubles Section's; Section owns spacing.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  firstGroup: { marginTop: spacing[4] },
  dim: { opacity: 0.45 },
  card: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  cardTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  cardBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
