import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, PlusCircle, WhatsappLogo, X } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import { Button } from '../../components/ui';
import { getStatsRecipients, updateStatsRecipients } from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex "Stats recipients": the WhatsApp numbers that get the Unifesto Stats
 * daily snapshot, weekly digest and milestone messages. Edit the list locally,
 * then one Save replaces it on the server (which re-normalises to E.164).
 */

const GUTTER = spacing[6];
const ICON = 24;

/** Same rule as the server: bare 10 digits = India, else 11–15 digits with country code. */
function normalize(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+919848945690" → "+91 98489 45690"; other country codes are left as stored. */
function display(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((n, i) => n === b[i]);

export default function StatsRecipientsScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexStatsRecipients');

  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [input, setInput] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await getStatsRecipients();
    if (!res.ok) {
      setLoadError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
      return;
    }
    setSaved(res.data.numbers);
    setDraft(res.data.numbers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = !!saved && !!draft && !sameList(saved, draft);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(isDirty ? 0 : 140, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(isDirty ? 1 : 0, { duration: 180 }),
  }));

  const add = () => {
    if (!input.trim()) return;
    const e164 = normalize(input);
    if (!e164) {
      setError('Enter a 10-digit Indian number, or a full number with country code.');
      return;
    }
    if (draft?.includes(e164)) {
      setError(`${display(e164)} is already on the list.`);
      return;
    }
    setDraft((d) => (d ? [...d, e164] : d));
    setInput('');
    setError('');
    setNotice('');
  };

  const remove = (n: string) => {
    setDraft((d) => (d ? d.filter((x) => x !== n) : d));
    setError('');
    setNotice('');
  };

  const save = async () => {
    if (!isDirty || saving || !draft) return;
    setSaving(true);
    setError('');
    const res = await updateStatsRecipients(draft);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSaved(res.data.numbers);
    setDraft(res.data.numbers);
    setNotice('Saved. The next stats message goes to this list.');
  };

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <SettingsGroup title="Recipients">
          {draft.length === 0 ? (
            <SettingsRow label="No one yet" value="Stats won't be sent" />
          ) : (
            draft.map((n) => (
              <SettingsRow
                key={n}
                icon={<WhatsappLogo size={ICON} color={tokens.accent} weight="fill" />}
                label={display(n)}
                trailing={
                  <Pressable onPress={() => remove(n)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${display(n)}`}>
                    <X size={18} color={tokens.textMuted} weight="bold" />
                  </Pressable>
                }
              />
            ))
          )}
        </SettingsGroup>

        <SettingsGroup title="Add a number">
          <FormRow
            icon={<Phone size={ICON} color={tokens.accent} weight="fill" />}
            value={input}
            onChangeText={(v) => {
              setInput(v);
              setError('');
            }}
            placeholder="98489 45690"
            keyboardType="phone-pad"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={add}
            trailing={
              <Pressable onPress={add} hitSlop={12} disabled={!input.trim()} accessibilityRole="button" accessibilityLabel="Add number">
                <PlusCircle size={26} color={input.trim() ? tokens.accent : tokens.textMuted} weight="fill" />
              </Pressable>
            }
          />
        </SettingsGroup>

        <Text style={[styles.note, { color: tokens.textMuted }]}>
          These numbers get the Unifesto Stats WhatsApp: a daily snapshot at 8 AM, a weekly digest on Mondays at 9 AM, and
          milestone alerts. A 10-digit number is treated as Indian (+91).
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
  note: { marginTop: spacing[4], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  message: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
});
