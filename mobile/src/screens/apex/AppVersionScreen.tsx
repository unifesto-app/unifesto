import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AndroidLogo, AppleLogo, ArrowCircleUp, ShieldWarning } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { SettingsGroup } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { getAppVersionPolicy, updateAppVersionPolicy, type AppVersionPolicy, type StoreVersionPolicy } from '../../lib/api/apex';
import { compareVersions } from '../../lib/appUpdate';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex "App Version" parity: per-store latest/minimum version + store URL that
 * drive the in-app update prompt. One Save bar, full-object PATCH like web.
 */

const GUTTER = spacing[6];
const ICON = 24;
const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const URL_RE = /^https?:\/\/\S+$/i;

type Store = 'ios' | 'android';
const STORES: { key: Store; title: string; Logo: typeof AppleLogo }[] = [
  { key: 'ios', title: 'iOS · App Store', Logo: AppleLogo },
  { key: 'android', title: 'Android · Play Store', Logo: AndroidLogo },
];

const sameStore = (a: StoreVersionPolicy, b: StoreVersionPolicy) =>
  a.latestVersion === b.latestVersion && a.minimumVersion === b.minimumVersion && a.storeUrl.trim() === b.storeUrl.trim();

/** First problem with the form, or '' when it can be saved. */
function validate(v: AppVersionPolicy): string {
  for (const { key, title } of STORES) {
    const { latestVersion, minimumVersion } = v[key];
    if (latestVersion && !VERSION_RE.test(latestVersion)) return `${title}: latest version should look like 2.1.0, or stay empty.`;
    if (!VERSION_RE.test(minimumVersion)) return `${title}: minimum version should look like 2.0.0.`;
    // Builds up to 4.x skip the minimum when latest is empty.
    if (!latestVersion && !/^0(\.0)*$/.test(minimumVersion)) return `${title}: set a latest version before raising the minimum.`;
    if (latestVersion && compareVersions(minimumVersion, latestVersion) > 0)
      return `${title}: minimum ${minimumVersion} is above the latest ${latestVersion}. Everyone would be forced to a build that doesn't exist.`;
    if (!URL_RE.test(v[key].storeUrl.trim())) return `${title}: store URL must start with https://`;
  }
  return '';
}

export default function AppVersionScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();

  const [saved, setSaved] = useState<AppVersionPolicy | null>(null);
  const [draft, setDraft] = useState<AppVersionPolicy | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await getAppVersionPolicy();
    if (!res.ok) {
      setLoadError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
      return;
    }
    setSaved(res.data);
    setDraft(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = !!saved && !!draft && STORES.some(({ key }) => !sameStore(saved[key], draft[key]));

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(isDirty ? 0 : 140, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(isDirty ? 1 : 0, { duration: 180 }),
  }));

  const set = (store: Store, field: keyof StoreVersionPolicy) => (value: string) => {
    setError('');
    setNotice('');
    const next = field === 'storeUrl' ? value : value.trim();
    setDraft((d) => (d ? { ...d, [store]: { ...d[store], [field]: next } } : d));
  };

  const save = async () => {
    if (!isDirty || saving || !draft) return;
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const FIELDS: [keyof StoreVersionPolicy, string][] = [
      ['latestVersion', 'latest'],
      ['minimumVersion', 'minimum'],
      ['storeUrl', 'store URL'],
    ];
    const diff = STORES.flatMap(({ key, title }) =>
      FIELDS.filter(([f]) => saved![key][f].trim() !== draft[key][f].trim()).map(
        ([f, label]) => `${title} ${label}: ${saved![key][f] || 'empty'} → ${draft[key][f].trim() || 'empty'}`,
      ),
    );
    const forced = STORES.some(({ key }) => compareVersions(draft[key].minimumVersion, saved![key].minimumVersion) > 0);
    AppAlert.alert(
      'Update the app version policy?',
      `${diff.join('\n')}${forced ? '\n\nAnyone below the new minimum is forced to update before they can use the app.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', style: forced ? 'destructive' : 'default', onPress: () => void commit() },
      ],
    );
  };

  const commit = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    const res = await updateAppVersionPolicy({
      ios: { ...draft.ios, storeUrl: draft.ios.storeUrl.trim() },
      android: { ...draft.android, storeUrl: draft.android.storeUrl.trim() },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(res.data);
    setDraft(res.data);
    setNotice('Saved. New app launches pick this up right away.');
  };

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const hint = (text: string) => <Text style={[styles.hint, { color: tokens.textMuted }]}>{text}</Text>;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {STORES.map(({ key, title, Logo }) => (
          <SettingsGroup key={key} title={title}>
            <FormRow
              icon={<ArrowCircleUp size={ICON} color={tokens.text} />}
              value={draft[key].latestVersion}
              onChangeText={set(key, 'latestVersion')}
              placeholder="Empty = no update prompt"
              keyboardType="decimal-pad"
              autoCorrect={false}
              trailing={hint('Latest')}
            />
            <FormRow
              icon={<ShieldWarning size={ICON} color={tokens.text} />}
              value={draft[key].minimumVersion}
              onChangeText={set(key, 'minimumVersion')}
              placeholder="2.0.0"
              keyboardType="decimal-pad"
              autoCorrect={false}
              trailing={hint('Minimum')}
            />
            <FormRow
              icon={<Logo size={ICON} color={tokens.text} />}
              value={draft[key].storeUrl}
              onChangeText={set(key, 'storeUrl')}
              placeholder="https://…"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </SettingsGroup>
        ))}

        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Below minimum forces an update; below latest shows an optional prompt. Set minimum to 0.0.0 to never force.
          The app re-reads this on every launch.
        </Text>

        {error ? <Text style={[styles.message, { color: tokens.danger }]}>{error}</Text> : null}
        {notice && !isDirty ? <Text style={[styles.message, { color: tokens.accent }]}>{notice}</Text> : null}
      </ScrollView>

      <Animated.View pointerEvents={isDirty ? 'auto' : 'none'} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }, barStyle]}>
        <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Button label="Save changes" onPress={save} loading={saving} size="lg" fullWidth />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  hint: { fontSize: typography.fontSize.sm, ...font('medium') },
  note: { marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  message: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
});
