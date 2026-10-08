import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneRight, Phone } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import {
  conversationName,
  getWhatsappConversation,
  messagePreview,
  replyWhatsapp,
  type WhatsappConversation,
  type WhatsappMessage,
} from '../../lib/api/apex';
import { whenShort } from '../../components/apex/ApexRow';
import { AppAlert } from '../../components/ui/AppAlert';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../../components/ui/CardSurface';

// While the thread is open, check for new messages this often.
const POLL_MS = 10_000;
const MAX_REPLY = 4096; // WhatsApp's text body limit

/**
 * One WhatsApp conversation. Opening it marks it read. Free-form replies only
 * work within 24h of their last message (Meta's rule); after that, reach them
 * with a template from Apex on the web.
 */
export default function WhatsappThreadScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing(8);
  const insets = useSafeAreaInsets();
  const [convo, setConvo] = useState<WhatsappConversation | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  useAnalyticsScreenTracking('ApexWhatsappThread');

  const load = useCallback(async () => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    const res = await getWhatsappConversation(id);
    inFlight.current = false;
    if (res.ok) {
      setConvo(res.data);
      setError('');
    } else {
      setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
    }
  }, [id]);

  // Load now, then poll while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || !id) return;
    setSending(true);
    const res = await replyWhatsapp(id, body);
    setSending(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't send", res.message);
      return;
    }
    setDraft('');
    await load();
  };

  const title = convo ? conversationName(convo) : name || 'WhatsApp';
  const messages = [...(convo?.messages ?? [])].reverse(); // newest first for the inverted list
  const windowOpen = !!convo?.replyWindowOpen;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? topSpacing - 8 : 0}
    >
      <Stack.Screen
        options={{
          title,
          headerRight: convo
            ? () => (
                <Pressable hitSlop={12} onPress={() => void Linking.openURL(`tel:+${convo.waId}`)} accessibilityLabel="Call">
                  <Phone size={22} color={tokens.accent} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {!convo ? (
        <View style={styles.center}>
          {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListFooterComponent={<View style={{ height: topSpacing }} />}
          renderItem={({ item }) => <Bubble message={item} />}
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        />
      )}

      {convo ? (
        windowOpen ? (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]), borderTopColor: tokens.border }]}>
            <View style={styles.inputWrap}>
              <CardBackdrop shape={styles.inputWrap} />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Reply on WhatsApp"
                placeholderTextColor={tokens.textMuted}
                multiline
                maxLength={MAX_REPLY}
                style={[styles.input, { color: tokens.text }]}
              />
            </View>
            <Pressable
              onPress={() => void send()}
              disabled={!draft.trim() || sending}
              hitSlop={8}
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, { opacity: !draft.trim() || sending ? 0.4 : pressed ? 0.6 : 1 }]}
            >
              {sending ? <ActivityIndicator color={tokens.accent} /> : <PaperPlaneRight size={26} color={tokens.accent} weight="fill" />}
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.closed, { color: tokens.textMuted, paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            It's been over 24 hours since their last message, so WhatsApp only allows a template now. Send one from Apex on the web.
          </Text>
        )
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: WhatsappMessage }) {
  const tokens = useTokens();
  const mine = message.direction === 'OUTBOUND';
  const failed = mine && (message.status === 'failed' || !!message.errorText);
  const text = message.body || (message.mediaUrl ? '' : messagePreview(message));
  const tick = mine ? (failed ? 'Not sent' : message.status ? message.status.charAt(0).toUpperCase() + message.status.slice(1) : '') : '';
  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, mine && { backgroundColor: tokens.accent }]}>
        {!mine ? <CardBackdrop shape={styles.bubble} /> : null}
        {message.mediaUrl ? <Image source={{ uri: message.mediaUrl }} style={styles.media} contentFit="cover" /> : null}
        {text ? <Text style={[styles.body, { color: mine ? '#fff' : tokens.text }]}>{text}</Text> : null}
      </View>
      <Text style={[styles.meta, { color: failed ? tokens.danger : tokens.textMuted, textAlign: mine ? 'right' : 'left' }]}>
        {[whenShort(message.createdAt), tick].filter(Boolean).join('  ·  ')}
        {failed && message.errorText ? `  ·  ${message.errorText}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  list: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  bubbleWrap: { marginVertical: spacing[1], maxWidth: '82%' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  bubble: { borderRadius: borderRadius.xl, paddingHorizontal: spacing[3], paddingVertical: spacing[2], overflow: 'hidden' },
  media: { width: 220, height: 220, borderRadius: borderRadius.lg, marginBottom: spacing[1] },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.35, ...font() },
  meta: { marginTop: 2, marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: { flex: 1, borderRadius: borderRadius.xl },
  input: {
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: spacing[4],
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: typography.fontSize.base,
    ...font(),
  },
  send: { height: 40, width: 40, alignItems: 'center', justifyContent: 'center' },
  closed: { paddingHorizontal: spacing[6], paddingTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, textAlign: 'center', ...font() },
});
