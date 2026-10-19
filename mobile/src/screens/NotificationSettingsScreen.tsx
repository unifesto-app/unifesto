import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import useTopSpacing from '../hooks/useTopSpacing';
import OneSignalService from '../services/OneSignalService';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import DateTimeRow from '../components/manage/DateTimeRow';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import {
  NotificationSettings,
  getNotificationSettings,
  resubscribeToSpace,
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
  spaceUpdates: true,
  emailEventReminders: true,
  emailNewEvents: true,
  marketingEmail: true,
  marketingWhatsapp: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  spaceOptOuts: [],
};

/** Quiet hours when first turned on: 10 pm to 7 am. */
const QUIET_DEFAULT = { quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60 };

// Minutes after midnight (IST on the server) <-> a Date the picker can show.
const minutesToDate = (m: number) => {
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
};
const dateToMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Profile › Notifications. Push is the master switch (the server drops every
 * push category while it's off), so it leads. Below it a category × channel
 * grid (push, email): transactional email is always on, optional email has its
 * own switch. Then promotions (consent + per-channel marketing switches),
 * quiet hours, and the email master switch.
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

  const resubscribe = useCallback(
    async (spaceId: string) => {
      try {
        // Only the opt-out list: the server's pushEnabled doesn't know the OS
        // permission, which load() already folded in.
        const { spaceOptOuts } = await resubscribeToSpace(spaceId);
        const next = { ...notifsRef.current, spaceOptOuts };
        setNotifs(next);
        void persistLocal(next);
      } catch {
        AppAlert.alert('Update failed', 'Could not re-subscribe. Please try again.');
      }
    },
    [persistLocal],
  );

  const sw = (label: string, value: boolean, onToggle: () => void, disabled = false) => (
    <Switch
      value={value}
      onValueChange={onToggle}
      disabled={disabled}
      trackColor={{ false: c.input, true: c.primary }}
      thumbColor={value ? c.primaryFg : '#ffffff'}
      ios_backgroundColor={c.input}
      accessibilityLabel={label}
    />
  );

  // One toggle row: bare icon, label, native switch in the cosmos silver.
  const row = (icon: GlyphName, label: string, value: boolean, onToggle: () => void, disabled = false) => (
    <View style={disabled && styles.dim}>
      <SettingsRow
        icon={<UnGlyph name={icon} size={28} color={c.text} />}
        label={label}
        trailing={sw(label, value, onToggle, disabled)}
      />
    </View>
  );

  const pushOff = !notifs.pushEnabled;
  const emailOff = !notifs.emailEnabled;
  const note = (text: string) => <Text style={[styles.cell, styles.note, { color: c.muted }]}>{text}</Text>;

  /**
   * One grid row: push switch, then email as a switch (optional mail), a fixed
   * "Always" (transactional mail) or "None" (the category sends no email).
   */
  const gridRow = (
    icon: GlyphName,
    label: string,
    push: keyof NotifState,
    email: keyof NotifState | 'always' | 'none',
  ) => (
    <SettingsRow
      icon={<UnGlyph name={icon} size={28} color={c.text} />}
      label={label}
      trailing={
        <View style={styles.cells}>
          <View style={[styles.cell, pushOff && styles.dim]}>
            {sw(`${label} push`, !!notifs[push] && !pushOff, () => toggle(push), pushOff)}
          </View>
          {email === 'always' ? (
            note('Always')
          ) : email === 'none' ? (
            note('None')
          ) : (
            <View style={[styles.cell, emailOff && styles.dim]}>
              {sw(`${label} email`, !!notifs[email] && !emailOff, () => toggle(email), emailOff)}
            </View>
          )}
        </View>
      }
    />
  );

  const gridHeader = (
    <View style={styles.gridHeader}>
      <Text style={[styles.cell, styles.note, { color: c.muted }]}>Push</Text>
      <Text style={[styles.cell, styles.note, { color: c.muted }]}>Email</Text>
    </View>
  );

  const quietOn = notifs.quietHoursStart != null && notifs.quietHoursEnd != null;
  // The server rejects a window whose ends match; say why instead of a failed save.
  const setQuiet = (key: 'quietHoursStart' | 'quietHoursEnd', d: Date) => {
    const other = key === 'quietHoursStart' ? notifs.quietHoursEnd : notifs.quietHoursStart;
    if (dateToMinutes(d) === other) {
      AppAlert.alert('Pick another time', 'Quiet hours need to start and end at different times.');
      return;
    }
    void commit({ [key]: dateToMinutes(d) });
  };

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

        <Section
          title="Updates about my tickets"
          subtitle="Tickets, receipts, refunds, support replies and sign-in codes always arrive by email."
        >
          {gridHeader}
          <SettingsGroup style={styles.group}>
            {gridRow('ticket', 'Tickets and waitlist', 'registrationUpdates', 'always')}
          </SettingsGroup>
        </Section>

        <Section title="Events and spaces">
          {gridHeader}
          <SettingsGroup style={styles.group}>
            {gridRow('calendar-blank', 'Reminders', 'eventReminders', 'emailEventReminders')}
            {gridRow('sparkle', 'New events', 'newEvents', 'emailNewEvents')}
            {gridRow('megaphone', 'From hosts', 'organiserAnnouncements', 'none')}
            {gridRow('users-three', 'My spaces', 'spaceUpdates', 'always')}
            {gridRow('arrows-clockwise', 'Product news', 'productUpdates', 'none')}
          </SettingsGroup>
        </Section>

        <Section
          title="Promotions"
          subtitle="Offers from Unifesto need the first switch. Email and WhatsApp cover all marketing, from Unifesto and from spaces I joined."
        >
          <SettingsGroup style={styles.group}>
            {row('tag', 'Offers from Unifesto', notifs.promotions, () => toggle('promotions'))}
            {/* Hidden without an address on file: there's nothing to opt out of. */}
            {notifs.marketingEmail != null
              ? row('envelope-simple', 'Marketing email', notifs.marketingEmail, () => toggle('marketingEmail'))
              : null}
            {notifs.marketingWhatsapp != null
              ? row('whatsapp-logo', 'Marketing on WhatsApp', notifs.marketingWhatsapp, () => toggle('marketingWhatsapp'))
              : null}
          </SettingsGroup>
          {notifs.spaceOptOuts.length ? (
            <SettingsGroup title="Spaces I unsubscribed from" style={styles.group}>
              {notifs.spaceOptOuts.map((sp) => (
                <SettingsRow
                  key={sp.spaceId}
                  label={sp.spaceName}
                  trailing={
                    <Pressable onPress={() => resubscribe(sp.spaceId)} hitSlop={10} accessibilityRole="button">
                      <Text style={[styles.action, { color: c.primary }]}>Re-subscribe</Text>
                    </Pressable>
                  }
                />
              ))}
            </SettingsGroup>
          ) : null}
        </Section>

        <Section title="Quiet hours" subtitle="Pushes that can wait arrive when quiet hours end. Tickets and payments still come through. Times are IST.">
          <SettingsGroup style={styles.group}>
            {row('moon', 'Quiet hours', quietOn, () =>
              commit(quietOn ? { quietHoursStart: null, quietHoursEnd: null } : QUIET_DEFAULT),
            )}
            {quietOn ? (
              <DateTimeRow
                mode="time"
                label="From"
                value={minutesToDate(notifs.quietHoursStart!)}
                onChange={(d) => setQuiet('quietHoursStart', d)}
              />
            ) : null}
            {quietOn ? (
              <DateTimeRow
                mode="time"
                label="Until"
                value={minutesToDate(notifs.quietHoursEnd!)}
                onChange={(d) => setQuiet('quietHoursEnd', d)}
              />
            ) : null}
          </SettingsGroup>
        </Section>

        <Section title="Email" subtitle="Turns off all optional email. Tickets, receipts and sign-in codes still arrive.">
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
  // Grid: fixed-width channel columns so switches line up under the header.
  cells: { flexDirection: 'row', alignItems: 'center' },
  cell: { width: 64, alignItems: 'center', textAlign: 'center' },
  note: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  gridHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginHorizontal: GUTTER, paddingRight: spacing[4], marginBottom: spacing[2] },
  action: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  card: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  cardTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  cardBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
