import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { CATEGORY_LABEL, createTicket, type SupportTicketCategory } from '../lib/api/support';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const CATEGORIES = (Object.keys(CATEGORY_LABEL) as SupportTicketCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
/** Unifesto answers these even about an event (decision D2, mirrors the backend). */
const PLATFORM_CATEGORIES: SupportTicketCategory[] = ['ACCOUNT', 'PAYMENTS', 'TECHNICAL'];

/**
 * Raise a case. From an event or ticket ("Get help") it carries eventId or
 * registrationId and `about` (the event's title), and the backend routes it to
 * that event's organiser unless it's an account, payment or app question.
 * From a space (operator support) it carries spaceId and goes to Unifesto.
 */
export default function NewSupportTicketScreen() {
  const { spaceId, eventId, registrationId, about } = useLocalSearchParams<{
    spaceId?: string;
    eventId?: string;
    registrationId?: string;
    about?: string;
  }>();
  const aboutEvent = !!(eventId || registrationId);
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<SupportTicketCategory>('EVENTS');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (subject.trim().length < 3) return setError('Add a short subject.');
    if (message.trim().length < 10) return setError('Tell us a bit more (10 characters or more).');
    setBusy(true);
    const t = await createTicket({
      subject: subject.trim(),
      message: message.trim(),
      category,
      ...(spaceId ? { spaceId } : {}),
      ...(registrationId ? { registrationId } : eventId ? { eventId } : {}),
    });
    setBusy(false);
    if (!t) return setError("Couldn't send. Check your connection and try again.");
    router.replace(`/manage/support/${t.id}`);
  };

  return (
    <CosmosScreen
      keyboard
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible label="Send" onPress={send} loading={busy} error={error} />}
    >
        {aboutEvent ? <Stack.Screen options={{ title: 'Get help' }} /> : null}
        {about ? <Text style={[styles.about, { color: c.text }]} accessibilityRole="header">{about}</Text> : null}
        <BlockTitle>About</BlockTitle>
        <ChipPicker options={CATEGORIES} value={category} onChange={(v) => v && setCategory(v)} />
        {aboutEvent ? (
          <Text style={[styles.hint, { color: c.muted }]}>
            {PLATFORM_CATEGORIES.includes(category)
              ? 'Unifesto answers account, payment and app questions.'
              : 'The organiser answers this, and can pass it to Unifesto.'}
          </Text>
        ) : null}
        <SettingsGroup plain>
          <FieldRow
            stacked
            label="Subject"
            value={subject}
            onChangeText={(v) => {
              setError('');
              setSubject(v);
            }}
            maxLength={150}
          />
          <FieldRow
            stacked
            multiline
            label="What's going on?"
            value={message}
            onChangeText={(v) => {
              setError('');
              setMessage(v);
            }}
            placeholder={aboutEvent ? 'What you tried, what happened' : 'Which event, what you tried, what happened'}
          />
        </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  about: { fontSize: typography.fontSize.lg, lineHeight: 26, marginBottom: spacing[2], ...cosmosFont.display },
  hint: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
