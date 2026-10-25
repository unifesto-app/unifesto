import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CosmosScreen from '../components/ui/CosmosScreen';
import { startAssist } from '../lib/api/support';
import { Composer, GUTTER } from '../components/support/CaseThread';
import { AssistNotice } from '../components/support/AssistParts';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * D14 front door: "Get help" and My help start here. The first message opens a
 * BOT case and Assist answers on the thread screen; when Assist is off or has
 * no answer, the same message becomes a request for a person.
 */
export default function AssistStartScreen() {
  const { eventId, registrationId, about } = useLocalSearchParams<{ eventId?: string; registrationId?: string; about?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

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
    <CosmosScreen
      keyboard
      bottom={spacing[6]}
      contentContainerStyle={styles.content}
      footer={<Composer value={message} onChangeText={setMessage} onSend={send} sending={sending} placeholder="Type your question" bottomInset={insets.bottom} />}
    >
        {about ? <Text style={[styles.about, { color: c.muted }]}>{about}</Text> : null}
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">How can we help?</Text>
        <Text style={[styles.body, { color: c.soft }]}>
          Ask about a booking, a refund or an event. Assist answers right away and passes it to a person when it can't.
        </Text>
        <View style={{ marginTop: spacing[5] }}>
          <AssistNotice />
        </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  about: { fontSize: typography.fontSize.sm, marginBottom: spacing[1], ...cosmosFont.body },
  title: { fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.display },
  body: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...cosmosFont.body },
});
