import React, { useEffect, useRef } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarX, Ticket as TicketIcon, Timer } from '@unifesto/unicon/react-native';
import { useEventRegistration } from '../hooks/useEventRegistration';
import { isWaitlistOnly } from '../lib/api/tickets';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { ActionBar, useActionBarSpace } from '../components/event/EventOverlays';
import { FlowHeader, GUTTER } from '../components/registration/FlowHeader';
import { StateView, VerifyingOverlay } from '../components/registration/RegStates';
import { DetailsStep, PaymentStep, ProfileGate, ReviewStep, TicketStep, money } from '../components/registration/Steps';
import { spacing } from '../theme/spacing';
import { cosmosCardRadius, useCosmos } from '../theme/cosmos';

/**
 * Event registration (modal): ticket → details → review → pay, with a
 * 15-minute seat hold, on the cosmos night sky. All state and payment logic
 * lives in useEventRegistration; this file only lays the steps out.
 */
export default function EventRegistrationScreen() {
  const c = useCosmos();
  const router = useRouter();
  const r = useEventRegistration();
  const scroll = useRef<ScrollView>(null);
  // The bar floats over the content; reserve its height so nothing hides under it.
  const barSpace = useActionBarSpace();

  // Each step starts at the top.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [r.step]);

  // Android back: step back, else confirm leaving; never during verification.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (r.verifying) return true;
      if (r.loading || !r.event || r.gate.needed || r.expired || !r.hasTickets) return false;
      if (r.step !== 'ticket') r.back();
      else r.confirmLeave();
      return true;
    });
    return () => sub.remove();
  }, [r]);

  const close = () => router.back();

  if (r.loading) {
    return (
      <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
        <FlowHeader title="Registration" step={null} secondsLeft={null} onBack={null} onClose={close} />
        <View style={{ paddingHorizontal: GUTTER, paddingTop: spacing[6], gap: spacing[3] }}>
          <Skeleton width="60%" height={28} borderRadius={8} />
          <Skeleton width="40%" height={14} borderRadius={6} style={{ marginBottom: spacing[3] }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={112} borderRadius={cosmosCardRadius} />
          ))}
        </View>
      </View>
    );
  }

  if (!r.event) {
    return (
      <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
        <FlowHeader title="Registration" step={null} secondsLeft={null} onBack={null} onClose={close} />
        <StateView
          icon={<CalendarX size={56} color={c.muted} weight="duotone" />}
          title="We couldn't find this event"
          body="It may have been removed, or the connection dropped. Try again from the event page."
          action="Go back"
          onAction={close}
        />
      </View>
    );
  }

  if (r.gate.needed) {
    return (
      <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
        <FlowHeader title={r.event.title} step={null} secondsLeft={null} onBack={null} onClose={close} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: barSpace }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ProfileGate r={r} />
          </ScrollView>
          <ActionBar info={null} label="Save and continue" loading={r.gate.saving} tone="neutral"
          accent={c.primary} onPress={r.gate.save} />
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (!r.hasTickets) {
    return (
      <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
        <FlowHeader title={r.event.title} step={null} secondsLeft={null} onBack={null} onClose={close} />
        <StateView
          icon={<TicketIcon size={56} color={c.muted} weight="duotone" />}
          title="No tickets yet"
          body="The organiser hasn't opened tickets for this event. Check back soon."
          action="Back to event"
          onAction={close}
        />
      </View>
    );
  }

  if (r.expired) {
    return (
      <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
        <FlowHeader title={r.event.title} step={null} secondsLeft={null} onBack={null} onClose={close} />
        <StateView
          icon={<Timer size={56} color={c.danger} weight="duotone" />}
          title="Time's up"
          body="We held your spot for 15 minutes. Open registration again to pick up where you left off."
          action="Back to event"
          onAction={close}
        />
      </View>
    );
  }

  const waitlist = !!r.selectedTicket && isWaitlistOnly(r.selectedTicket);
  const totalLabel = r.total === 0 ? 'Free' : money(r.symbol, r.total);
  const cta =
    r.step !== 'payment'
      ? 'Continue'
      : waitlist
        ? 'Join waiting list'
        : r.total === 0
          ? 'Confirm registration'
          : `Pay ${totalLabel}`;
  const info = r.selectedTicket && r.step !== 'payment' ? { label: 'Total', value: totalLabel } : null;

  return (
    <View style={styles.flex}>
        <CosmosBackdrop horizon={false} />
      <FlowHeader
        title={r.event.title}
        step={r.step}
        steps={r.steps}
        secondsLeft={r.secondsLeft}
        onBack={r.step !== 'ticket' ? r.back : null}
        onClose={r.confirmLeave}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={[styles.content, { paddingBottom: barSpace }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {r.step === 'ticket' ? <TicketStep r={r} /> : null}
          {r.step === 'details' ? <DetailsStep r={r} /> : null}
          {r.step === 'review' ? <ReviewStep r={r} /> : null}
          {r.step === 'payment' ? <PaymentStep r={r} waitlist={waitlist} /> : null}
        </ScrollView>
        <ActionBar
          info={info}
          label={cta}
          disabled={!r.canContinue}
          loading={r.submitting || r.verifying}
          tone="neutral"
          accent={c.primary}
          onPress={r.step === 'payment' ? r.submit : r.next}
        />
      </KeyboardAvoidingView>
      <VerifyingOverlay visible={r.verifying} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingTop: spacing[5] },
});
