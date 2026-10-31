import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { CheckCircle, Flag, X } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import { SheetBackdrop } from './ui/CardSurface';
import { REPORT_REASONS, submitContentReport, type ReportTarget } from '../lib/api/contentReports';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const TITLES: Record<ReportTarget, string> = {
  EVENT: 'Report event',
  SPACE: 'Report space',
  REGISTRATION: 'Report an issue',
};

const INTROS: Record<ReportTarget, string> = {
  EVENT: "What's wrong with this event?",
  SPACE: "What's wrong with this space?",
  REGISTRATION: "What's the problem with your ticket?",
};

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string | null | undefined;
  /** Shown under the title so it's clear what's being reported. */
  subject?: string | null;
}

/**
 * Bottom sheet for reporting an event, a space, or a ticket: pick a reason,
 * optionally add details, send. Signed-out users are asked to sign in first.
 */
export default function ReportSheet({ visible, onClose, targetType, targetId, subject }: ReportSheetProps) {
  const c = useCosmos();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { alreadyReported: boolean }>(null);

  const progress = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setError('');
      setDone(null);
      progress.value = 0;
      progress.value = withSpring(1, { damping: 20, stiffness: 240, mass: 0.8 });
    }
  }, [visible, progress]);

  const close = () => {
    if (sending) return;
    progress.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) });
    setTimeout(onClose, 170);
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 420 }] }));

  const needsDetails = reason === 'other';
  const canSend = !!reason && !!targetId && (!needsDetails || details.trim().length >= 5) && !sending;

  const send = async () => {
    if (!canSend || !reason || !targetId) return;
    setSending(true);
    setError('');
    try {
      const res = await submitContentReport({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setDone({ alreadyReported: res.alreadyReported });
    } catch (e: any) {
      setError(e?.message || "Couldn't send your report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.root}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
          </Animated.View>

          <Animated.View
            style={[styles.card, { paddingBottom: insets.bottom + spacing[4] }, card]}
            accessibilityViewIsModal
          >
            <SheetBackdrop radius={28} />
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{TITLES[targetType]}</Text>
                {subject ? (
                  <Text style={[styles.subject, { color: c.muted }]} numberOfLines={1}>{subject}</Text>
                ) : null}
              </View>
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <X size={22} color={c.muted} weight="bold" />
              </Pressable>
            </View>

            {!token ? (
              <View style={styles.center}>
                <Flag size={48} color={c.muted} weight="duotone" />
                <Text style={[styles.body, styles.centerText, { color: c.soft }]}>
                  Sign in so we can follow up on your report.
                </Text>
                <Button
                  label="Sign in to report"
                  size="lg"
                  onPress={() => {
                    close();
                    setTimeout(() => router.push('/login'), 200);
                  }}
                  style={styles.button}
                />
              </View>
            ) : done ? (
              <View style={styles.center}>
                <CheckCircle size={56} color={c.success} weight="duotone" />
                <Text style={[styles.doneTitle, { color: c.text }]} accessibilityRole="header">
                  {done.alreadyReported ? 'Report updated' : 'Thanks for telling us'}
                </Text>
                <Text style={[styles.body, styles.centerText, { color: c.soft }]}>
                  {done.alreadyReported
                    ? "You'd already reported this, so we've added your new details to it."
                    : 'Our team reviews every report and acts on anything that breaks our rules.'}
                </Text>
                <Button label="Done" size="lg" onPress={close} style={styles.button} />
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                <Text style={[styles.body, { color: c.soft, marginBottom: spacing[3] }]}>{INTROS[targetType]}</Text>
                <View style={{ gap: spacing[2] }}>
                  {REPORT_REASONS[targetType].map((r) => {
                    const on = reason === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setReason(r.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        // An option card (a control): the picked one gains a hairline and a tick, monochrome.
                        style={({ pressed }) => [
                          styles.reason,
                          { backgroundColor: c.tint, borderColor: on ? c.outline : 'transparent', opacity: pressed ? 0.85 : 1 },
                        ]}
                      >
                        <Text style={[styles.reasonText, { color: c.text }]}>{r.label}</Text>
                        {on ? <CheckCircle size={22} color={c.text} weight="fill" /> : null}
                      </Pressable>
                    );
                  })}
                </View>

                {reason ? (
                  <TextInput
                    value={details}
                    onChangeText={setDetails}
                    placeholder={needsDetails ? 'Tell us what happened' : 'Add details (optional)'}
                    placeholderTextColor={c.muted}
                    selectionColor={c.primary}
                    multiline
                    maxLength={2000}
                    textAlignVertical="top"
                    style={[styles.details, { color: c.text, backgroundColor: c.tint }]}
                  />
                ) : null}

                {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

                <Button
                  label={sending ? 'Sending…' : 'Send report'}
                  size="lg"
                  onPress={send}
                  disabled={!canSend}
                  style={styles.button}
                />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  card: {
    ...column,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[4] },
  title: { fontSize: 20, lineHeight: 26, ...cosmosFont.display },
  subject: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  reason: {
    minHeight: 50,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  reasonText: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  details: {
    marginTop: spacing[4],
    minHeight: 96,
    borderRadius: cosmosRadius,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    ...cosmosFont.body,
  },
  error: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  button: { marginTop: spacing[5], alignSelf: 'stretch' },
  center: { alignItems: 'center', paddingVertical: spacing[4] },
  centerText: { textAlign: 'center', marginTop: spacing[3] },
  doneTitle: { marginTop: spacing[4], fontSize: 22, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
});
