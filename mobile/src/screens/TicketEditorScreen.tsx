import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useEventTicketTypes } from '../hooks/useEventTicketTypes';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  createTicketType,
  deleteTicketType,
  updateTicketType,
  saleStatus,
  SALE_STATUS_LABEL,
  FIELD_TYPES,
  DEFAULT_FIELDS,
  type TicketKind,
} from '../lib/api/ticketTypes';
import { draftToPayload, emptyDraft, toDraft, validateDraft, type TicketDraft } from '../lib/ticketDraft';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import { Badge } from '../components/ui/Badge';
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

const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Create or edit one ticket type. `ticketId === 'new'` creates, with `kind`
 * from the route (RSVP or INDIVIDUAL). Every kind gets availability, sale
 * window, restrictions and a WhatsApp group; tickets add price, per-person
 * limit, group sizing, waiting list and their own registration questions.
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
    // A new ticket opens straight into edit mode, where its questions live.
    if (isNew && !isRsvp && res.data?.id) {
      router.replace(`/manage/event/${eventId}/ticket/${res.data.id}`);
      return;
    }
    if (!isNew) {
      initial.current = JSON.stringify(draft);
      await types.reload();
    }
    router.back();
  };

  const confirmDelete = () =>
    AppAlert.alert(
      `Delete this ${noun}?`,
      `People can no longer choose it. This cannot be undone. To stop sales but keep it, turn off "On sale" instead.`,
      [
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
  const status = original ? SALE_STATUS_LABEL[saleStatus(original)] : null;
  const stats = original?.stats;
  const questions = original ? types.fieldsFor(original.id) : [];
  const others = types.all.filter((t) => t.id !== ticketId);
  const openQuestion = (fieldId: string) =>
    router.push({
      pathname: `/manage/event/${eventId}/ticket-question`,
      params: { ticketId: ticketId!, fieldId, group: isGroup ? '1' : '0' },
    });

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
        {summary ? (
          <View style={styles.summaryRow}>
            {status ? <Badge label={status.label} tone={status.tone} /> : null}
            <Text style={[styles.summary, { color: tokens.textSecondary }]}>{summary}</Text>
          </View>
        ) : null}

        {original && stats ? (
          <View>
            <SettingsGroup title="At a glance" plain>
              <SettingsRow label="Checked in" value={`${stats.checkedIn.toLocaleString('en-IN')} of ${stats.registrations.toLocaleString('en-IN')}`} />
              {original.waitlistEnabled || stats.waitlistWaiting + stats.waitlistOffered > 0 ? (
                <SettingsRow
                  label="Waiting list"
                  value={`${stats.waitlistWaiting} waiting · ${stats.waitlistOffered} offered`}
                  onPress={() => router.push(`/manage/event/${eventId}/waitlist`)}
                />
              ) : null}
              {stats.revenue != null && !isRsvp ? <SettingsRow label="Net revenue" value={inr(stats.revenue)} /> : null}
              <SettingsRow
                label="View attendees"
                onPress={() =>
                  router.push({
                    pathname: `/manage/event/${eventId}/attendees`,
                    params: { ticket: original.id, ticketName: original.name },
                  })
                }
              />
            </SettingsGroup>
          </View>
        ) : null}

        {!isRsvp ? (
          <View style={original ? { marginTop: spacing[8] } : undefined}>
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

        <SettingsGroup title="Availability" plain>
          <SwitchRow
            label="On sale"
            hint={draft.onSale ? 'Listed on the event page.' : "Hidden from the event page and can't be booked. Holders keep theirs."}
            value={draft.onSale}
            onValueChange={(v) => set({ onSale: v })}
          />
          <SwitchRow
            label="Opens later"
            value={!!draft.saleStartsAt}
            onValueChange={(on) => set({ saleStartsAt: on ? inDays(1) : null })}
          />
          {draft.saleStartsAt ? (
            <DateTimeRow label="Opens" value={draft.saleStartsAt} onChange={(d) => set({ saleStartsAt: d })} />
          ) : null}
          <SwitchRow
            label="Closes at a set time"
            value={!!draft.saleEndsAt}
            onValueChange={(on) => set({ saleEndsAt: on ? inDays(7) : null })}
          />
          {draft.saleEndsAt ? (
            <DateTimeRow
              label="Closes"
              value={draft.saleEndsAt}
              minimumDate={draft.saleStartsAt ?? undefined}
              onChange={(d) => set({ saleEndsAt: d })}
            />
          ) : null}
        </SettingsGroup>

        {!isRsvp ? (
          <>
            <SettingsGroup
              title="Registration questions"
              plain
              action={original ? { label: 'Add', onPress: () => openQuestion('new') } : undefined}
            >
              <SettingsRow label="Always asked" value={DEFAULT_FIELDS.join(', ')} />
              {questions.map((q) => (
                <SettingsRow
                  key={q.id}
                  label={q.label}
                  value={[
                    FIELD_TYPES.find((f) => f.key === q.type)?.label ?? q.type,
                    q.isRequired ? 'Required' : null,
                    isGroup && q.perGroup ? 'Once per group' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => openQuestion(q.id)}
                />
              ))}
              {original ? (
                <SettingsRow
                  icon={<Plus size={18} color={tokens.accent} weight="bold" />}
                  label="Add a question"
                  onPress={() => openQuestion('new')}
                />
              ) : null}
            </SettingsGroup>
            {!original ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>Create the ticket first, then add its questions.</Text>
            ) : null}
          </>
        ) : null}

        {others.length > 0 ? (
          <>
            <SettingsGroup title="Restrictions" plain>
              {others.map((t) => (
                <SwitchRow
                  key={t.id}
                  label={`Blocks ${t.name}`}
                  value={draft.blocks.includes(t.id)}
                  onValueChange={(on) =>
                    set({ blocks: (on ? [...draft.blocks, t.id] : draft.blocks.filter((x) => x !== t.id)).sort() })
                  }
                />
              ))}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Holders of this {noun} can't book the ones switched on. It only works one way.
            </Text>
          </>
        ) : null}

        <SettingsGroup title="WhatsApp group" plain>
          <FieldRow
            stacked
            label="Group invite link"
            value={draft.whatsappGroupUrl}
            onChangeText={(v) => set({ whatsappGroupUrl: v })}
            placeholder="https://chat.whatsapp.com/…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          People on this {noun} get this group instead of the event's. Leave empty to use the event group.
        </Text>

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
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  note: { marginTop: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
