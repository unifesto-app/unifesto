import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowSquareOut, Bell, CaretLeft, Envelope, LinkSimple, Star } from '@unifesto/unicon/react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, typography, borderRadius, shadows } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OneSignalService from '../services/OneSignalService';
import { getToken } from '../lib/api/helpers';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from '../lib/api/notifications';
import { AppAlert } from '../components/ui/AppAlert';

const PREFERENCES_KEY = 'notification_preferences';

export default function SettingsScreen() {
  const { colors } = useTheme();
  
  const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[12],
    paddingBottom: spacing[4],
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontFamily: getFontFamily('bold'),
    color: colors.text,
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    padding: spacing[6],
    paddingTop: spacing[4],
  },
  section: {
    marginBottom: spacing[6],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: getFontFamily('bold'),
    color: colors.text,
  },
  sectionTitleText: {
    fontSize: typography.fontSize.sm,
    fontFamily: getFontFamily('bold'),
    color: colors.textMuted,
    marginBottom: spacing[4],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadows.md,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    minHeight: 56,
  },
  preferenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    paddingRight: spacing[3],
  },
  switchContainer: {
    width: 52,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(52, 145, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceInfo: {
    flex: 1,
  },
  preferenceLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: getFontFamily('bold'),
    color: colors.text,
    marginBottom: spacing[1],
  },
  preferenceDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
  },
  preferenceDivider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: spacing[3],
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  resourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
    paddingRight: spacing[3],
  },
  resourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(52, 145, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceInfo: {
    flex: 1,
  },
  resourceLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: getFontFamily('bold'),
    color: colors.text,
    marginBottom: spacing[1],
  },
  resourceDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    lineHeight: typography.lineHeight.relaxed * typography.fontSize.xs,
  },
});

  const router = useRouter();

  // Preferences state
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [eventReminders, setEventReminders] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      // Local storage is the source of truth for the UI so toggles persist
      // reliably across screen reopens even if the backend response differs.
      let local: Record<string, boolean> | null = null;
      try {
        const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
        if (raw) local = JSON.parse(raw);
      } catch {}

      if (local) {
        setPushNotifications(local.push_notifications ?? true);
        setEmailNotifications(local.email_notifications ?? true);
        setEventReminders(local.event_reminders ?? true);
        setMarketingEmails(local.marketing_emails ?? false);
      }

      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Reconcile with backend only when we have no local copy yet.
      if (!local) {
        const settings = await getNotificationSettings();
        if (settings) {
          const merged = {
            push_notifications: settings.pushEnabled ?? true,
            email_notifications: settings.emailEnabled ?? true,
            event_reminders: settings.eventReminders ?? true,
            marketing_emails: settings.promotions ?? false,
          };
          setPushNotifications(merged.push_notifications);
          setEmailNotifications(merged.email_notifications);
          setEventReminders(merged.event_reminders);
          setMarketingEmails(merged.marketing_emails);
          try {
            await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged));
          } catch {}
        }
      }

      // If the OS permission is revoked, push can't be delivered — reflect off.
      const hasPermission = await OneSignalService.hasPermission();
      if (!hasPermission) {
        setPushNotifications(false);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async (preferences: any) => {
    // Persist locally first so the UI stays consistent regardless of network.
    try {
      const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
      const current = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ ...current, ...preferences })
      );
    } catch {}

    try {
      const token = await getToken();
      if (!token) {
        return;
      }

      // Map the screen's snake_case preference keys onto the backend's
      // notification-settings fields (PATCH /users/me/notification-settings).
      const keyMap: Record<string, keyof NotificationSettings> = {
        push_notifications: 'pushEnabled',
        email_notifications: 'emailEnabled',
        event_reminders: 'eventReminders',
        marketing_emails: 'promotions',
      };
      const payload: Partial<NotificationSettings> = {};
      for (const [key, value] of Object.entries(preferences)) {
        const backendKey = keyMap[key];
        if (backendKey) payload[backendKey] = value as boolean;
      }

      if (Object.keys(payload).length > 0) {
        await updateNotificationSettings(payload);
      }
    } catch (error) {
      AppAlert.alert('Error', 'Failed to save preferences');
    }
  };

  const handlePushNotificationsToggle = async (value: boolean) => {
    if (value) {
      // If OS permission is already granted, just opt back in.
      // Otherwise request it (shows the OS prompt on first ask).
      let granted = await OneSignalService.hasPermission();
      if (!granted) {
        granted = await OneSignalService.requestPermission();
      }

      if (granted) {
        setPushNotifications(true);
        OneSignalService.optInToPush();
        OneSignalService.setTags({ push_notifications: 'true' });
        savePreferences({ push_notifications: true });
      } else {
        // Permission denied at OS level — keep the toggle off and guide the user.
        setPushNotifications(false);
        AppAlert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to receive push notifications.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } else {
      // Disable push notifications. This always succeeds regardless of the
      // OS-level permission (which can't be revoked from within the app) —
      // we simply opt the user out of the push subscription and persist it.
      setPushNotifications(false);
      try {
        OneSignalService.optOutOfPush();
        OneSignalService.setTags({ push_notifications: 'false' });
      } catch {}
      savePreferences({ push_notifications: false });
    }
  };

  const handleEventRemindersToggle = (value: boolean) => {
    setEventReminders(value);
    OneSignalService.setTags({ event_reminders: value ? 'true' : 'false' });
    savePreferences({ event_reminders: value });
  };

  const handleEmailNotificationsToggle = (value: boolean) => {
    setEmailNotifications(value);
    OneSignalService.setTags({ email_notifications: value ? 'true' : 'false' });
    savePreferences({ email_notifications: value });
  };

  const handleMarketingEmailsToggle = (value: boolean) => {
    setMarketingEmails(value);
    OneSignalService.setTags({ marketing_emails: value ? 'true' : 'false' });
    savePreferences({ marketing_emails: value });
  };

  const handleRateApp = () => {
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/app/unifesto/id6738633431',
      android: 'https://play.google.com/store/apps/details?id=com.unifesto.app',
    });

    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {
        AppAlert.alert('Error', 'Unable to open app store');
      });
    }
  };

  const handleInstagram = () => {
    const instagramUrl = 'https://www.instagram.com/unifesto.app/';
    Linking.openURL(instagramUrl).catch(() => {
      AppAlert.alert('Error', 'Unable to open Instagram');
    });
  };

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <CaretLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Notifications Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Bell size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Notifications</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.preferenceItem}>
              <View style={styles.preferenceLeft}>
                <View style={styles.preferenceIcon}>
                  <Bell size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.preferenceInfo}>
                  <Text style={styles.preferenceLabel}>Push Notifications</Text>
                  <Text style={styles.preferenceDescription}>
                    Get notified about events and updates
                  </Text>
                </View>
              </View>
              <View style={styles.switchContainer}>
                <Switch
                  value={pushNotifications}
                  onValueChange={handlePushNotificationsToggle}
                  trackColor={{ false: colors.borderMuted, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View style={styles.preferenceDivider} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceLeft}>
                <View style={styles.preferenceIcon}>
                  <Bell size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.preferenceInfo}>
                  <Text style={styles.preferenceLabel}>Event Reminders</Text>
                  <Text style={styles.preferenceDescription}>
                    Get reminded before events start
                  </Text>
                </View>
              </View>
              <View style={styles.switchContainer}>
                <Switch
                  value={eventReminders}
                  onValueChange={handleEventRemindersToggle}
                  trackColor={{ false: colors.borderMuted, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Email Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Envelope size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Email</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.preferenceItem}>
              <View style={styles.preferenceLeft}>
                <View style={styles.preferenceIcon}>
                  <Envelope size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.preferenceInfo}>
                  <Text style={styles.preferenceLabel}>Email Notifications</Text>
                  <Text style={styles.preferenceDescription}>
                    Receive updates via email
                  </Text>
                </View>
              </View>
              <View style={styles.switchContainer}>
                <Switch
                  value={emailNotifications}
                  onValueChange={handleEmailNotificationsToggle}
                  trackColor={{ false: colors.borderMuted, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View style={styles.preferenceDivider} />

            <View style={styles.preferenceItem}>
              <View style={styles.preferenceLeft}>
                <View style={styles.preferenceIcon}>
                  <Envelope size={20} color={colors.textSecondary} />
                </View>
                <View style={styles.preferenceInfo}>
                  <Text style={styles.preferenceLabel}>Marketing Emails</Text>
                  <Text style={styles.preferenceDescription}>
                    Receive promotional content and offers
                  </Text>
                </View>
              </View>
              <View style={styles.switchContainer}>
                <Switch
                  value={marketingEmails}
                  onValueChange={handleMarketingEmailsToggle}
                  trackColor={{ false: colors.borderMuted, true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Resources Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleText}>Resources</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.resourceItem}
              onPress={handleRateApp}
              activeOpacity={0.7}
            >
              <View style={styles.resourceLeft}>
                <View style={styles.resourceIcon}>
                  <Star size={20} color={colors.primary} />
                </View>
                <View style={styles.resourceInfo}>
                  <Text style={styles.resourceLabel}>Rate in App Store</Text>
                  <Text style={styles.resourceDescription}>
                    Help us improve by rating the app
                  </Text>
                </View>
              </View>
              <ArrowSquareOut size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.preferenceDivider} />

            <TouchableOpacity
              style={styles.resourceItem}
              onPress={handleInstagram}
              activeOpacity={0.7}
            >
              <View style={styles.resourceLeft}>
                <View style={styles.resourceIcon}>
                  <LinkSimple size={20} color={colors.primary} />
                </View>
                <View style={styles.resourceInfo}>
                  <Text style={styles.resourceLabel}>Unifesto on Instagram</Text>
                  <Text style={styles.resourceDescription}>
                    Follow us for updates and news
                  </Text>
                </View>
              </View>
              <ArrowSquareOut size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

