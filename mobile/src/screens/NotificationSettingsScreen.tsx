import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../hooks/useTopSpacing';
import OneSignalService from '../services/OneSignalService';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
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
};

export default function NotificationSettingsScreen() {
  const topSpacing = useTopSpacing();
  const tokens = useTokens();
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

  // One toggle row: bare icon, label, native switch in the accent colour.
  const row = (icon: GlyphName, label: string, value: boolean, onToggle: () => void) => (
    <SettingsRow
      icon={<UnGlyph name={icon} size={28} color={tokens.text} />}
      label={label}
      trailing={
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: tokens.fillStrong, true: tokens.accent }}
          thumbColor="#ffffff"
          ios_backgroundColor={tokens.fillStrong}
          accessibilityLabel={label}
        />
      }
    />
  );

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
    >
      <SettingsGroup title="Channels">
        {row('bell', 'Push notifications', notifs.pushEnabled, handlePushToggle)}
        {row('envelope-simple', 'Email', notifs.emailEnabled, () => toggle('emailEnabled'))}
      </SettingsGroup>
      <Text style={[styles.caption, { color: tokens.textMuted }]}>
        Tickets, receipts and sign-in codes always arrive by email.
      </Text>

      <SettingsGroup title="Events">
        {row('calendar-blank', 'Event reminders', notifs.eventReminders, () => toggle('eventReminders'))}
        {row('megaphone', 'New events', notifs.newEvents, () => toggle('newEvents'))}
      </SettingsGroup>

      <SettingsGroup title="From Unifesto">
        {row('arrows-clockwise', 'Product updates', notifs.productUpdates, () => toggle('productUpdates'))}
        {row('tag', 'Promotions', notifs.promotions, () => toggle('promotions'))}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing[6], paddingBottom: 100 },
  caption: { fontSize: typography.fontSize.sm, marginTop: spacing[2], marginHorizontal: spacing[1] },
});
