import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { CATEGORY_LABEL, createTicket, type SupportTicketCategory } from '../lib/api/support';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';

const GUTTER = spacing[6];
const CATEGORIES = (Object.keys(CATEGORY_LABEL) as SupportTicketCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

/** Raise a support request, tagged to the space it's about. */
export default function NewSupportTicketScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [category, setCategory] = useState<SupportTicketCategory>('EVENTS');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('NewSupportTicket');

  const send = async () => {
    if (subject.trim().length < 3) return setError('Add a short subject.');
    if (message.trim().length < 10) return setError('Tell us a bit more (10 characters or more).');
    setBusy(true);
    const t = await createTicket({ subject: subject.trim(), message: message.trim(), category, ...(spaceId ? { spaceId } : {}) });
    setBusy(false);
    if (!t) return setError("Couldn't send. Check your connection and try again.");
    router.replace(`/manage/support/${t.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BlockTitle>About</BlockTitle>
        <ChipPicker options={CATEGORIES} value={category} onChange={(v) => v && setCategory(v)} />
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
            placeholder="Which event, what you tried, what happened"
          />
        </SettingsGroup>
      </ScrollView>
      <SaveBar visible label="Send" onPress={send} loading={busy} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
});
