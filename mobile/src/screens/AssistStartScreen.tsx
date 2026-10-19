import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { startAssist } from '../lib/api/support';
import { Composer, GUTTER } from '../components/support/CaseThread';
import { AssistNotice } from '../components/support/AssistParts';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

/**
 * D14 front door: "Get help" and My help start here. The first message opens a
 * BOT case and Assist answers on the thread screen; when Assist is off or has
 * no answer, the same message becomes a request for a person.
 */
export default function AssistStartScreen() {
  const { eventId, registrationId, about } = useLocalSearchParams<{ eventId?: string; registrationId?: string; about?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useAnalyticsScreenTracking('AssistStart');

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    const t = await startAssist({ message: text, ...(registrationId ? { registrationId } : eventId ? { eventId } : {}) });
    setSending(false);
    if (!t) return AppAlert.alert("Couldn't send", 'Check your connection and try again.');
    router.replace(`/manage/support/${t.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topSpacing }]} keyboardShouldPersistTaps="handled">
        {about ? <Text style={[styles.about, { color: tokens.textMuted }]}>{about}</Text> : null}
        <Text style={[styles.title, { color: tokens.text }]}>How can we help?</Text>
        <Text style={[styles.body, { color: tokens.textMuted }]}>
          Ask about a booking, a refund or an event. Assist answers right away and passes it to a person when it can't.
        </Text>
        <View style={{ marginTop: spacing[5] }}>
          <AssistNotice />
        </View>
      </ScrollView>
      <Composer value={message} onChangeText={setMessage} onSend={send} sending={sending} placeholder="Type your question" bottomInset={insets.bottom} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[6] },
  about: { fontSize: typography.fontSize.sm, marginBottom: spacing[1], ...font() },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
});
