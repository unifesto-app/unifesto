import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useEventTicketTypes } from '../hooks/useEventTicketTypes';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { createTicketType, deleteTicketType, updateTicketType, type TicketKind } from '../lib/api/ticketTypes';
import { draftToPayload, emptyDraft, toDraft, validateDraft, type TicketDraft } from '../lib/ticketDraft';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const KIND_TABS: { key: 'INDIVIDUAL' | 'GROUP'; label: string }[] = [
  { key: 'INDIVIDUAL', label: 'Individual' },
  { key: 'GROUP', label: 'Group' },
];

const PRICING_TABS: { key: 'PER_GROUP' | 'PER_PERSON'; label: string }[] = [
  { key: 'PER_GROUP', label: 'Per group' },
  { key: 'PER_PERSON', label: 'Per person' },
];

const saleDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : undefined;

/**
 * Create or edit one ticket type. `ticketId === 'new'` creates, with `kind`
 * from the route (RSVP or INDIVIDUAL). RSVPs only get name, description and
 * capacity; tickets add price, per-person limit, group sizing and waiting list.
 * Save lives in a bar pinned above the keyboard, like Edit profile.
 */
export default function TicketEditorScreen() {
  const { eventId, ticketId, kind: kindParam } = useLocalSearchParams<{ eventId: string; ticketId: string; kind?: TicketKind }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const types = useEventTicketTypes(eventId);
  const isNew = ticketId === 'new';
  const original = useMemo(() => (isNew ? undefined : types.all.find((t) => t.id === ticketId)), [isNew, types.all, ticketId]);

  const [draft, setDraft] = useState<TicketDraft | null>(isNew ? emptyDraft(kindParam ?? 'INDIVIDUAL') : null);
  const initial = useRef<string | null>(isNew ? null : '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('TicketEditor');

  // Seed the form once the saved ticket arrives (edit mode only).
  useEffect(() => {
    if (!isNew && original && !draft) {
      const seeded = toDraft(original);
      initial.current = JSON.stringify(seeded);
      setDraft(seeded);
    }
  }, [isNew, original, draft]);

  const set = (patch: Partial<TicketDraft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const isRsvp = draft?.kind === 'RSVP';
  const isGroup = draft?.kind === 'GROUP';
  const noun = isRsvp ? 'RSVP' : 'ticket';
  // Switching kind after people booked would change what they bought.
  const kindLocked = (original?.soldCount ?? 0) > 0;
  const currency = original?.currency ?? types.currency;
  const symbol = currency === 'INR' ? '₹' : currency;
  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== initial.current);
  const barVisible = dirty || saving || !!error;

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(barVisible ? 0 : 160, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(barVisible ? 1 : 0, { duration: 180 }),
  }));

  const save = async () => {
    if (!draft || !eventId) return;
    const problem = validateDraft(draft, original);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setSaving(true);
    const body = draftToPayload(draft, !isNew);
    const res = isNew ? await createTicketType(eventId, body) : await updateTicketType(eventId, ticketId!, body);
    setSaving(false);
    if (!res.ok) {
      setError(res.denied ? `You can't edit ${noun}s for this event.` : res.message);
      return;
    }
    router.back();
  };

  const confirmDelete = () =>
    AppAlert.alert(`Delete this ${noun}?`, 'People can no longer choose it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteTicketType(eventId!, ticketId!);
          setDeleting(false);
          if (!res.ok) {
            AppAlert.alert("Couldn't delete", res.message);
            return;
          }
          router.back();
        },
      },
    ]);

  const title = isNew ? `New ${noun}` : `Edit ${noun}`;

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {types.loading ? (
          <ActivityIndicator color={tokens.accent} />
        ) : (
          <Text style={[styles.muted, { color: tokens.textMuted }]}>This {noun} no longer exists.</Text>
        )}
      </View>
    );
  }

  const booked = original?.soldCount ?? 0;
  const left = original?.totalQuantity != null ? Math.max(0, original.totalQuantity - booked) : null;
  const summary = original
    ? [`${booked.toLocaleString('en-IN')} booked`, left !== null ? `${left.toLocaleString('en-IN')} left` : 'Unlimited'].join('  ·  ')
    : null;

  const priceLabel = isGroup
    ? `Price per ${draft.groupPricingMode === 'PER_PERSON' ? 'person' : 'group'} (${symbol})`
    : `Price (${symbol})`;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {summary ? <Text style={[styles.summary, { color: tokens.textSecondary }]}>{summary}</Text> : null}

        {!isRsvp ? (
          <View style={summary ? { marginTop: spacing[6] } : undefined}>
            <BlockTitle>Type</BlockTitle>
            <View style={{ opacity: kindLocked ? 0.5 : 1, pointerEvents: kindLocked ? 'none' : 'auto' }}>
              <SegmentedTabs tabs={KIND_TABS} value={isGroup ? 'GROUP' : 'INDIVIDUAL'} onChange={(k) => set({ kind: k })} />
            </View>
            {kindLocked ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>People have booked this, so its type is fixed.</Text>
            ) : null}

            {isGroup ? (
              <View style={{ marginTop: spacing[6] }}>
                <BlockTitle>Group pricing</BlockTitle>
                <SegmentedTabs tabs={PRICING_TABS} value={draft.groupPricingMode} onChange={(m) => set({ groupPricingMode: m })} />
              </View>
            ) : null}
          </View>
        ) : null}

        <SettingsGroup title="Details" plain>
          <FieldRow
            stacked
            label="Name"
            value={draft.name}
            onChangeText={(v) => set({ name: v })}
            placeholder={isRsvp ? "e.g. I'll be there" : 'e.g. Early bird'}
            maxLength={100}
            returnKeyType="next"
          />
          <FieldRow
            stacked
            multiline
            label="Description"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="Optional. Shown to attendees."
          />
        </SettingsGroup>

        <SettingsGroup title={isRsvp ? 'Capacity' : 'Price and limits'} plain>
          {!isRsvp ? (
            <FieldRow label={priceLabel} value={draft.price} onChangeText={(v) => set({ price: v })} placeholder="Free" keyboardType="decimal-pad" />
          ) : null}
          <FieldRow
            label="Capacity"
            value={draft.capacity}
            onChangeText={(v) => set({ capacity: v, waitlistEnabled: v.trim() ? draft.waitlistEnabled : false })}
            placeholder="Unlimited"
            keyboardType="number-pad"
          />
          {!isRsvp ? (
            <FieldRow
              label={isGroup ? 'Groups per person' : 'Tickets per person'}
              value={draft.perUserLimit}
              onChangeText={(v) => set({ perUserLimit: v })}
              keyboardType="number-pad"
            />
          ) : null}
        </SettingsGroup>

        {isGroup ? (
          <SettingsGroup title="Group size" plain>
            <FieldRow label="Smallest group" value={draft.minGroupSize} onChangeText={(v) => set({ minGroupSize: v })} keyboardType="number-pad" />
            <FieldRow label="Largest group" value={draft.maxGroupSize} onChangeText={(v) => set({ maxGroupSize: v })} keyboardType="number-pad" />
          </SettingsGroup>
        ) : null}

        {!isRsvp ? (
          <SettingsGroup title="When it sells out" plain>
            <SwitchRow
              label="Waiting list"
              hint={draft.capacity.trim() ? 'Queue people once it sells out.' : 'Set a capacity first.'}
              value={draft.waitlistEnabled}
              disabled={!draft.capacity.trim()}
              onValueChange={(v) => set({ waitlistEnabled: v })}
            />
          </SettingsGroup>
        ) : null}

        {!isRsvp && original && (original.saleStartsAt || original.saleEndsAt) ? (
          <SettingsGroup title="Sale window" plain>
            {original.saleStartsAt ? <SettingsRow label="Opens" value={saleDate(original.saleStartsAt)} /> : null}
            {original.saleEndsAt ? <SettingsRow label="Closes" value={saleDate(original.saleEndsAt)} /> : null}
          </SettingsGroup>
        ) : null}

        {!isRsvp ? (
          <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[4] }]}>
            Sale dates and registration questions are edited in Unifesto Space on the web.
          </Text>
        ) : null}

        {original ? (
          <Button
            label={`Delete ${noun}`}
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={confirmDelete}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      {/* Save bar: pinned above the keyboard; on edit it appears once something changed */}
      <Animated.View
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]), pointerEvents: barVisible ? 'auto' : 'none' }, barStyle]}
      >
        <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]} />
        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
        <Button
          label={isNew ? `Create ${noun}` : 'Save changes'}
          onPress={save}
          loading={saving}
          disabled={deleting}
          size="lg"
          fullWidth
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, ...font() },
  summary: { fontSize: typography.fontSize.sm, marginLeft: spacing[1], ...font('medium') },
  note: { marginTop: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
