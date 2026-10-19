import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { createEventRequest } from '../lib/api/spaces';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthField from '../components/auth/AuthField';
import AuthButton from '../components/auth/AuthButton';
import DateTimeRow from '../components/manage/DateTimeRow';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { GUTTER, Section } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const FORMATS = [
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'ONLINE', label: 'Online' },
] as const;

/** A week out at 6 pm, two hours long: a sane first guess for the pickers. */
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 0, 0, 0);
  return d;
}
const HOURS_2 = 2 * 3600_000;

/**
 * Assist D7: host one event without a space. Platform reviews it as a case in
 * My help; approval sets up a space they run with the event in it as a draft.
 */
export default function EventRequestScreen() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON');
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => new Date(defaultStart().getTime() + HOURS_2));
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ready = title.trim().length > 0 && end > start;

  // Moving the start keeps the length, so the end never lands before it.
  const moveStart = (d: Date) => {
    setEnd(new Date(d.getTime() + Math.max(end.getTime() - start.getTime(), HOURS_2)));
    setStart(d);
  };

  const handleSubmit = async () => {
    if (!ready) return;
    setSubmitting(true);
    try {
      await createEventRequest({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        city: city.trim() || undefined,
      });
      AppAlert.alert('Request sent', 'We’ll review it and reply in My help.');
      router.replace('/support');
    } catch (e: any) {
      AppAlert.alert('Could not send', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 150 + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text style={[styles.title, { color: c.text }]}>Host an event, no space needed</Text>
            <Text style={[styles.lead, { color: c.soft }]}>
              Tell us the basics. Once we approve it, we set up a space for you with the event inside as a draft, ready
              for tickets.
            </Text>
          </View>

          <Section title="Your event" style={styles.tightSection}>
            <View style={styles.fields}>
              <AuthField label="Name" value={title} onChangeText={setTitle} placeholder="e.g. Robotics night" maxLength={500} />
              <AuthField
                label="About (optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="What is it, and who is it for?"
                multiline
                maxLength={2000}
              />
            </View>
          </Section>

          <Section title="When">
            <View style={styles.pad}>
              <SettingsGroup plain>
                <DateTimeRow label="Starts" value={start} onChange={moveStart} minimumDate={new Date()} />
                <DateTimeRow label="Ends" value={end} onChange={setEnd} minimumDate={start} />
              </SettingsGroup>
            </View>
          </Section>

          <Section title="Where">
            <View style={[styles.pad, styles.chips]} accessibilityRole="radiogroup">
              {FORMATS.map((f) => {
                const active = type === f.value;
                return (
                  <Pressable
                    key={f.value}
                    onPress={() => setType(f.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? c.primary : c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.fields, { marginTop: spacing[4] }]}>
              <AuthField label="City (optional)" value={city} onChangeText={setCity} placeholder="City" maxLength={100} />
            </View>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <LinearGradient colors={[`${c.bg}00`, c.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <AuthButton label="Send request" arrow loading={submitting} disabled={!ready} onPress={handleSubmit} />
        {!ready ? (
          <Text style={[styles.hint, { color: c.muted }]}>
            {title.trim() ? 'The event has to end after it starts' : 'Add a name to send'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  tightSection: { marginTop: spacing[10] },
  card: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  title: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  lead: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  fields: { paddingHorizontal: GUTTER, gap: spacing[5] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[4], borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  hint: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
