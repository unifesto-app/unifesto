import { EMAIL_RE } from '../../lib/constants';
import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { BellRinging, CheckCircle, EnvelopeSimple, User, X } from '@unifesto/unicon/react-native';
import { Button } from '../ui';
import { SettingsGroup } from '../profile/SettingsGroup';
import { CardSurfaceProvider, SheetBackdrop } from '../ui/CardSurface';
import FormRow from '../profile/FormRow';
import type { EventDetail } from '../../hooks/useEventDetail';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';


/**
 * "Notify me" sheet on the event page: name (optional) + email, then a
 * confirmation naming the address updates go to. Signed-in users arrive
 * prefilled, so it's usually one tap.
 */
export default function NotifySheet({
  notify,
  accent,
  eventTitle,
}: {
  notify: EventDetail['notify'];
  accent: string;
  eventTitle?: string | null;
}) {
  const c = useCosmos();
  const insets = useSafeAreaInsets();

  const progress = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    if (notify.open) {
      progress.value = 0;
      progress.value = withSpring(1, { damping: 20, stiffness: 240, mass: 0.8 });
    }
  }, [notify.open, progress]);

  useEffect(() => {
    pop.value = notify.done ? withDelay(60, withSpring(1, { damping: 11, stiffness: 180 })) : 0;
  }, [notify.done, pop]);

  const close = () => {
    if (notify.busy) return;
    progress.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) });
    setTimeout(() => notify.setOpen(false), 170);
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 420 }] }));
  const popStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.5 + pop.value * 0.5 }] }));

  const email = notify.email.trim();
  const emailValid = EMAIL_RE.test(email);
  const canSubmit = emailValid && !notify.busy;

  return (
    <Modal visible={notify.open} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
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
            {notify.done ? (
              <View style={styles.center}>
                <Animated.View style={popStyle}>
                  <CheckCircle size={64} color={c.success} weight="duotone" />
                </Animated.View>
                <Text style={[styles.doneTitle, { color: c.text }]}>You're on the list</Text>
                <Text style={[styles.body, styles.centerText, { color: c.soft }]}>
                  We'll email <Text style={{ color: c.text, ...cosmosFont.strong }}>{email}</Text> with updates
                  {eventTitle ? ` about ${eventTitle}` : ''}.
                </Text>
                <Button label="Done" size="lg" onPress={close} style={styles.button} />
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  <BellRinging size={30} color={accent} weight="duotone" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: c.text }]}>Get notified</Text>
                    {eventTitle ? (
                      <Text style={[styles.subject, { color: c.muted }]} numberOfLines={1}>{eventTitle}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                    <X size={22} color={c.soft} weight="bold" />
                  </Pressable>
                </View>

                <Text style={[styles.body, { color: c.soft, marginBottom: spacing[4] }]}>
                  We'll email you updates about this event.
                </Text>

                <CardSurfaceProvider kind="solid">
                <SettingsGroup>
                  <FormRow
                    icon={<User size={24} color={accent} weight="duotone" />}
                    value={notify.name}
                    onChangeText={notify.setName}
                    placeholder="Name (optional)"
                    autoCapitalize="words"
                    textContentType="name"
                    returnKeyType="next"
                  />
                  <FormRow
                    icon={<EnvelopeSimple size={24} color={accent} weight="duotone" />}
                    value={notify.email}
                    onChangeText={notify.setEmail}
                    placeholder="Email address"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={canSubmit ? notify.submit : undefined}
                  />
                </SettingsGroup>
                </CardSurfaceProvider>
                {email.length > 0 && !emailValid ? (
                  <Text style={[styles.hint, { color: c.danger }]}>That email doesn't look right.</Text>
                ) : null}

                <Button
                  label="Notify me"
                  size="lg"
                  onPress={notify.submit}
                  loading={notify.busy}
                  disabled={!canSubmit}
                  style={[styles.button, !canSubmit && !notify.busy && { opacity: 0.5 }]}
                />
              </>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] },
  title: { fontSize: typography.fontSize.xl, ...cosmosFont.display },
  subject: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  hint: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  button: { marginTop: spacing[5], alignSelf: 'stretch' },
  center: { alignItems: 'center', paddingTop: spacing[2] },
  centerText: { textAlign: 'center', marginTop: spacing[2], paddingHorizontal: spacing[2] },
  doneTitle: { marginTop: spacing[4], fontSize: typography.fontSize.xl, ...cosmosFont.display },
});
