import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { pickImageAtAspect } from '../utils/pickImage';
import { ImageSquare } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { createEvent, getCategories, getManagedEvent, updateEvent, uploadEventCover, type Category } from '../lib/api/eventAdmin';
import { createTicketType } from '../lib/api/ticketTypes';
import type { Event } from '../lib/api/events';
import {
  emptyEventDraft,
  eventDraftToPayload,
  isPaid,
  sanitizeSlug,
  showOnline,
  showVenue,
  toEventDraft,
  validateEventDraft,
  type EventDraft,
} from '../lib/eventDraft';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import RecurrenceEditor from '../components/manage/RecurrenceEditor';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import SelectRow from '../components/manage/SelectRow';
import { INDIAN_STATES } from '../lib/indianStates';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const TYPE_TABS = [
  { key: 'IN_PERSON' as const, label: 'In person' },
  { key: 'ONLINE' as const, label: 'Online' },
  { key: 'HYBRID' as const, label: 'Hybrid' },
];
const REG_TABS = [
  { key: 'RSVP' as const, label: 'Free RSVP' },
  { key: 'TICKETED' as const, label: 'Paid tickets' },
];
const VIS_TABS = [
  { key: 'PUBLIC' as const, label: 'Public' },
  { key: 'SPACE_ONLY' as const, label: 'Space only' },
  { key: 'PRIVATE' as const, label: 'Private' },
];
const VIS_HINT = {
  PUBLIC: 'Anyone can find it.',
  SPACE_ONLY: 'Only members of your space.',
  PRIVATE: 'Only people with the link.',
};

/**
 * Create an event (`/manage/space/:spaceId/new-event`) or edit one
 * (`/manage/event/:eventId/edit`). Create also sets up the first ticket or RSVP
 * option and lands as a draft on the event hub, where it can be published.
 * Recurring series and sub-events are still set up on the web.
 */
export default function EventFormScreen() {
  const { eventId, spaceId, parentId, parentTitle } = useLocalSearchParams<{
    eventId?: string;
    spaceId?: string;
    /** Create as a sub-event of this big event. */
    parentId?: string;
    parentTitle?: string;
  }>();
  const creating = !eventId;
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();

  const [original, setOriginal] = useState<Event | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(creating ? emptyEventDraft() : null);
  const initial = useRef(creating ? '' : null as string | null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking(creating ? 'CreateEvent' : 'EditEvent');

  useEffect(() => {
    void getCategories().then((r) => r.ok && setCategories(r.data));
  }, []);

  useEffect(() => {
    if (creating || !eventId) return;
    void getManagedEvent(eventId).then((res) => {
      if (!res.ok) {
        setLoadError(res.message);
        return;
      }
      const d = toEventDraft(res.data);
      initial.current = JSON.stringify(d);
      setOriginal(res.data);
      setDraft(d);
    });
  }, [creating, eventId]);

  const set = (patch: Partial<EventDraft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  // Retyping where the venue is makes a saved map pin wrong, so drop it.
  const setPlace = (patch: Partial<EventDraft>) => set({ ...patch, latitude: null, longitude: null });

  const setRegistration = (rt: 'RSVP' | 'TICKETED') => {
    if (!draft) return;
    // Swap the untouched default name to match; keep anything the user typed.
    const defaults = ["I'll attend", 'General admission'];
    const name = defaults.includes(draft.ticketName) ? (rt === 'RSVP' ? defaults[0] : defaults[1]) : draft.ticketName;
    set({ registrationType: rt, ticketName: name });
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      AppAlert.alert('Photos access needed', 'Allow photo library access to choose a cover.');
      return;
    }
    const uri = await pickImageAtAspect([4, 3]).catch((e: Error) => {
      AppAlert.alert("Couldn't use that photo", e.message);
      return null;
    });
    if (uri) setCoverUri(uri);
  };

  const dirty = creating || !!coverUri || (draft !== null && JSON.stringify(draft) !== initial.current);

  const save = async () => {
    if (!draft) return;
    const problem = validateEventDraft(draft, creating);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    const payload = eventDraftToPayload(draft, original ?? undefined, parentId);

    if (creating) {
      const res = await createEvent({ ...payload, spaceId: spaceId! });
      if (!res.ok) {
        setSaving(false);
        setError(res.denied ? "You can't create events in this space." : res.message);
        return;
      }
      const id = res.data.id;
      // Cover and first ticket are best-effort: the event exists either way,
      // so report what didn't stick instead of failing the whole create.
      const problems: string[] = [];
      if (coverUri) {
        const c = await uploadEventCover(id, coverUri);
        if (!c.ok) problems.push(`cover (${c.message})`);
      }
      const paid = isPaid(draft);
      const capacity = draft.ticketCapacity.trim() ? Number(draft.ticketCapacity) : undefined;
      const t = await createTicketType(id, {
        name: draft.ticketName.trim(),
        kind: paid ? 'INDIVIDUAL' : 'RSVP',
        price: paid ? Number(draft.ticketPrice) || 0 : 0,
        ...(capacity ? { totalQuantity: capacity } : {}),
        ...(paid ? { perUserLimit: 1 } : {}),
      });
      if (!t.ok) problems.push(`${paid ? 'ticket' : 'RSVP option'} (${t.message})`);
      setSaving(false);
      router.replace(`/manage/event/${id}`);
      if (problems.length) AppAlert.alert('Event created', `These couldn't be added: ${problems.join('; ')}. Add them from the event.`);
      return;
    }

    const res = await updateEvent(eventId!, payload);
    if (!res.ok) {
      setSaving(false);
      setError(res.message);
      return;
    }
    if (coverUri) {
      const c = await uploadEventCover(eventId!, coverUri);
      if (!c.ok) {
        setSaving(false);
        setError(`Saved, but the cover didn't upload: ${c.message}`);
        return;
      }
    }
    setSaving(false);
    router.back();
  };

  const title = creating ? (parentId ? 'New sub-event' : 'New event') : 'Edit event';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const cover = coverUri ?? original?.coverImageUrl ?? null;
  const paid = isPaid(draft);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {parentId ? (
          <Text style={[styles.note, { color: tokens.textSecondary, marginBottom: spacing[5] }]}>
            Part of {parentTitle || 'the main event'}. People register for it on its own.
          </Text>
        ) : null}

        {/* Compact 4:3 cover, never cropped off-ratio */}
        <View style={styles.coverRow}>
          <Pressable onPress={pickCover} style={({ pressed }) => [styles.cover, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <CardBackdrop shape={styles.cover} />
            {cover ? (
              <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.coverEmpty}>
                <ImageSquare size={30} color={tokens.textMuted} />
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.coverTitle, { color: tokens.text }]}>Cover</Text>
            <Text style={[styles.change, { color: tokens.accent }]} onPress={pickCover}>
              {cover ? 'Change cover' : 'Add a cover'}
            </Text>
            <Text style={[styles.coverHint, { color: tokens.textMuted }]}>4:3 works best</Text>
          </View>
        </View>

        <SettingsGroup title="Basics" plain>
          <FieldRow stacked label="Name" value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="What's it called?" maxLength={150} />
          {!creating ? (
            <FieldRow
              stacked
              label="Link name"
              value={draft.slug}
              onChangeText={(v) => set({ slug: sanitizeSlug(v) })}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <FieldRow
            stacked
            multiline
            label="Description"
            value={draft.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="What should people know?"
          />
          <FieldRow
            stacked
            label="Tags"
            value={draft.tags}
            onChangeText={(v) => set({ tags: v })}
            placeholder="tech, workshop, community"
            autoCapitalize="none"
          />
        </SettingsGroup>

        {categories.length > 0 ? (
          <View style={styles.block}>
            <BlockTitle>Category</BlockTitle>
            <ChipPicker
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
              value={draft.category}
              onChange={(v) => set({ category: v })}
              clearable
            />
          </View>
        ) : null}

        <SettingsGroup title="When" plain>
          <DateTimeRow
            label="Starts"
            value={draft.start}
            onChange={(d) => {
              // Keep the length when the start moves past the end.
              const length = draft.end.getTime() - draft.start.getTime();
              set(d >= draft.end ? { start: d, end: new Date(d.getTime() + Math.max(length, 3600000)) } : { start: d });
            }}
          />
          <DateTimeRow label="Ends" value={draft.end} minimumDate={draft.start} onChange={(d) => set({ end: d })} />
        </SettingsGroup>

        {/* A series can't be a sub-event; on edit only an existing series changes its rule. */}
        {(creating && !parentId) || original?.isRecurring ? (
          <RecurrenceEditor value={draft.recurrence} onChange={(r) => set({ recurrence: r })} start={draft.start} />
        ) : null}
        {original?.seriesParentId ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            One date of a series. Detach it under Repeats on the series if this date should differ.
          </Text>
        ) : null}

        <View style={styles.block}>
          <BlockTitle>Where</BlockTitle>
          <SegmentedTabs tabs={TYPE_TABS} value={draft.type} onChange={(t) => set({ type: t })} />
        </View>

        {showVenue(draft) ? (
          <SettingsGroup title="Venue" plain>
            <FieldRow stacked label="Venue name" value={draft.venueName} onChangeText={(v) => set({ venueName: v })} placeholder="Auditorium, café, campus…" />
            <FieldRow stacked label="Address" value={draft.venueAddress} onChangeText={(v) => setPlace({ venueAddress: v })} />
            <FieldRow label="City" value={draft.city} onChangeText={(v) => setPlace({ city: v })} placeholder="Hyderabad" />
            <SelectRow label="State" value={draft.state} options={INDIAN_STATES} onChange={(v) => setPlace({ state: v })} clearable />
          </SettingsGroup>
        ) : null}
        {showVenue(draft) && draft.latitude != null ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Map pin set. Editing the address removes it.</Text>
        ) : null}

        {showOnline(draft) ? (
          <SettingsGroup title="Online" plain>
            <FieldRow
              stacked
              label="Joining link"
              value={draft.onlineUrl}
              onChangeText={(v) => set({ onlineUrl: v })}
              placeholder="https://meet.google.com/…"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FieldRow label="Platform" value={draft.onlinePlatform} onChangeText={(v) => set({ onlinePlatform: v })} placeholder="Zoom, Meet…" />
          </SettingsGroup>
        ) : null}

        <View style={styles.block}>
          <BlockTitle>Registration</BlockTitle>
          <SegmentedTabs tabs={REG_TABS} value={paid ? 'TICKETED' : 'RSVP'} onChange={setRegistration} />
        </View>

        {creating ? (
          <SettingsGroup title={paid ? 'First ticket' : 'RSVP option'} plain>
            <FieldRow stacked label="Name" value={draft.ticketName} onChangeText={(v) => set({ ticketName: v })} />
            {paid ? (
              <FieldRow label="Price (₹)" value={draft.ticketPrice} onChangeText={(v) => set({ ticketPrice: v })} placeholder="0" keyboardType="decimal-pad" />
            ) : null}
            <FieldRow label="Capacity" value={draft.ticketCapacity} onChangeText={(v) => set({ ticketCapacity: v })} placeholder="Unlimited" keyboardType="number-pad" />
          </SettingsGroup>
        ) : null}
        {creating ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Add more tickets, group tickets and waiting lists from the event after creating it.</Text>
        ) : null}

        <View style={styles.block}>
          <BlockTitle>Who can see it</BlockTitle>
          <SegmentedTabs tabs={VIS_TABS} value={draft.visibility} onChange={(v) => set({ visibility: v })} />
          <Text style={[styles.note, { color: tokens.textMuted }]}>{VIS_HINT[draft.visibility]}</Text>
        </View>

        {creating ? (
          <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[6] }]}>
            It's saved as a draft. Publish it from the event when you're ready.
          </Text>
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={creating ? 'Create draft' : 'Save changes'} onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  cover: { width: 144, height: 108, borderRadius: borderRadius.lg, overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  change: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  coverHint: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  block: { marginTop: spacing[8] },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
