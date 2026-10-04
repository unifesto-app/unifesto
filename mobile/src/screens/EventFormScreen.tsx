import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { pickImageAtAspect } from '../utils/pickImage';
import { ImageSquare, MapPin } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  createEvent,
  getCategories,
  getManagedEvent,
  publishEvent,
  updateEvent,
  uploadEventCover,
  type Category,
} from '../lib/api/eventAdmin';
import { createTicketType } from '../lib/api/ticketTypes';
import type { Event } from '../lib/api/events';
import {
  CREATE_STEPS,
  FIELD_STEP,
  MAX_EVENT_CATEGORIES,
  emptyEventDraft,
  eventDraftToPayload,
  isPaid,
  parseDraft,
  sanitizeSlug,
  serializeDraft,
  showOnline,
  showVenue,
  toEventDraft,
  validateEventDraft,
  type DraftField,
  type DraftProblem,
  type EventDraft,
} from '../lib/eventDraft';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import RecurrenceEditor from '../components/manage/RecurrenceEditor';
import { MultiChipPicker } from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import SelectRow from '../components/manage/SelectRow';
import TagsField from '../components/manage/TagsField';
import VenueMap, { geocodeVenue, type VenuePlace } from '../components/event/VenueMap';
import { INDIAN_STATES } from '../lib/indianStates';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const LAST_STEP = CREATE_STEPS.length - 1;

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
  SPACE_ONLY: 'Only members of my space.',
  PRIVATE: 'Only people with the link.',
};
const LAUNCH_TABS = [
  { key: 'draft' as const, label: 'Save as draft' },
  { key: 'publish' as const, label: 'Publish now' },
];
const LAUNCH_HINT = {
  draft: 'Only my team sees it until I publish it from the event.',
  publish: 'It goes live and starts taking registrations right away.',
};

/** Unsent create form, kept per space (and parent) so leaving the screen loses nothing. */
const draftKey = (spaceId?: string, parentId?: string) => `eventDraft:v1:${spaceId ?? ''}:${parentId ?? ''}`;
interface SavedDraft {
  draft: string;
  coverUri: string | null;
  step: number;
}

const placeOf = (d: EventDraft): VenuePlace => ({ name: d.venueName, address: d.venueAddress, city: d.city, state: d.state });
const hasPlace = (d: EventDraft) => !!(d.venueAddress.trim() || d.venueName.trim());

/** Pin from the typed address without prompting; null when the geocoder can't run or is slow. */
async function quietPin(d: EventDraft) {
  if (!showVenue(d) || d.latitude != null || !hasPlace(d)) return null;
  try {
    if (Platform.OS === 'android' && (await Location.getForegroundPermissionsAsync()).status !== 'granted') return null;
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    return await Promise.race([geocodeVenue(placeOf(d)), timeout]);
  } catch {
    return null;
  }
}

type Outcome = { ok: true } | { ok: false; message: string };
interface Step {
  label: string;
  run: () => Promise<Outcome>;
  /** Skipped (and kept as failed) while this other step hasn't gone through. */
  after?: string;
}

/** Runs the steps in order and returns the ones that didn't go through, with why. */
async function runSteps(steps: Step[]) {
  const failed: { step: Step; message: string }[] = [];
  for (const s of steps) {
    if (s.after && failed.some((f) => f.step.label === s.after)) {
      failed.push({ step: s, message: `needs the ${s.after} first` });
      continue;
    }
    const r = await s.run();
    if (!r.ok) failed.push({ step: s, message: r.message });
  }
  return failed;
}

const askRetry = (failed: { step: Step; message: string }[]) =>
  new Promise<boolean>((resolve) =>
    AppAlert.alert(
      'Event created',
      `These didn't go through: ${failed.map((f) => `${f.step.label} (${f.message})`).join('; ')}.`,
      [
        { text: 'Skip', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Retry', isPreferred: true, onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    ),
  );

/**
 * Create an event (`/manage/space/:spaceId/new-event`) in three short steps,
 * autosaved as you go, or edit one (`/manage/event/:eventId/edit`) on a single
 * page. Create also sets up the first ticket or RSVP option and can publish
 * straight away. Sub-events are created from their parent's Sub-events screen.
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
  const scrollRef = useRef<ScrollView>(null);

  const [original, setOriginal] = useState<Event | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(creating ? emptyEventDraft() : null);
  const initial = useRef(creating ? serializeDraft(emptyEventDraft()) : (null as string | null));
  const [categories, setCategories] = useState<Category[]>([]);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState<DraftProblem | null>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [launch, setLaunch] = useState<'draft' | 'publish'>('draft');
  const [pinning, setPinning] = useState(false);
  // Create only: autosave waits for the stored draft to load so it can't overwrite it.
  const [hydrated, setHydrated] = useState(!creating);
  const [restored, setRestored] = useState(false);
  /** Set once the event exists, so autosave stops for good. */
  const created = useRef(false);
  const storeKey = draftKey(spaceId, parentId);

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
      initial.current = serializeDraft(d);
      setOriginal(res.data);
      setDraft(d);
    });
  }, [creating, eventId]);

  // Pick up an unsent create form where it was left.
  useEffect(() => {
    if (!creating) return;
    AsyncStorage.getItem(storeKey)
      .then((raw) => {
        const saved: SavedDraft | null = raw ? JSON.parse(raw) : null;
        const d = saved && parseDraft(saved.draft);
        if (!d) return;
        setDraft(d);
        setCoverUri(saved!.coverUri);
        const s = Math.min(Math.max(0, saved!.step | 0), LAST_STEP);
        setStep(s);
        setReached(s);
        setRestored(true);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [creating, storeKey]);

  // Autosave the create form a beat after each change.
  useEffect(() => {
    if (!creating || !hydrated || !draft || saving || created.current) return;
    const raw = serializeDraft(draft);
    if (raw === initial.current && !coverUri) return;
    const t = setTimeout(() => {
      const saved: SavedDraft = { draft: raw, coverUri, step };
      AsyncStorage.setItem(storeKey, JSON.stringify(saved)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [creating, hydrated, draft, coverUri, step, saving, storeKey]);

  const forgetDraft = () => AsyncStorage.removeItem(storeKey).catch(() => {});

  const startOver = () =>
    AppAlert.alert('Start over?', 'This clears everything filled in so far.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Start over',
        style: 'destructive',
        onPress: () => {
          void forgetDraft();
          setDraft(emptyEventDraft());
          setCoverUri(null);
          setStep(0);
          setReached(0);
          setProblem(null);
          setRestored(false);
        },
      },
    ]);

  const set = (patch: Partial<EventDraft>) => {
    setError('');
    setProblem(null);
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

  const pinOnMap = async () => {
    if (!draft) return;
    if (Platform.OS === 'android') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        AppAlert.alert('Location access needed', 'Android looks addresses up through location services. The event saves fine without a pin.');
        return;
      }
    }
    setPinning(true);
    const hit = await geocodeVenue(placeOf(draft)).catch(() => null);
    setPinning(false);
    if (!hit) {
      AppAlert.alert("Couldn't find that address", 'Add the street, area and city, then try again. Attendees still see the address as typed.');
      return;
    }
    set({ latitude: hit.latitude, longitude: hit.longitude });
  };

  const goTo = (s: number) => {
    setStep(s);
    setReached((r) => Math.max(r, s));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const showProblem = (p: DraftProblem) => {
    setProblem(p);
    if (creating && FIELD_STEP[p.field] !== step) goTo(FIELD_STEP[p.field]);
  };

  const dirty = creating || !!coverUri || (draft !== null && serializeDraft(draft) !== initial.current);

  const create = async (d: EventDraft) => {
    const res = await createEvent({ ...eventDraftToPayload(d, undefined, parentId), spaceId: spaceId! });
    if (!res.ok) {
      setSaving(false);
      setError(res.denied ? "You can't create events in this space." : res.message);
      return;
    }
    const id = res.data.id;
    // The event exists now; a stored draft would only make a duplicate.
    created.current = true;
    void forgetDraft();
    const paid = isPaid(d);
    const ticket = paid ? 'ticket' : 'RSVP option';
    const capacity = d.ticketCapacity.trim() ? Number(d.ticketCapacity) : undefined;
    const steps: Step[] = [
      ...(coverUri ? [{ label: 'cover', run: () => uploadEventCover(id, coverUri) }] : []),
      {
        label: ticket,
        run: () =>
          createTicketType(id, {
            name: d.ticketName.trim(),
            kind: paid ? 'INDIVIDUAL' : 'RSVP',
            price: paid ? Number(d.ticketPrice) || 0 : 0,
            ...(capacity ? { totalQuantity: capacity } : {}),
            ...(paid ? { perUserLimit: 1 } : {}),
          }),
      },
      // Never go live with no way to register.
      ...(launch === 'publish' ? [{ label: 'publish', run: () => publishEvent(id), after: ticket }] : []),
    ];
    // Cover, ticket and publish are follow-ups: the event exists either way,
    // so offer a retry for what didn't stick instead of failing the create.
    let failed = await runSteps(steps);
    while (failed.length && (await askRetry(failed))) failed = await runSteps(failed.map((f) => f.step));
    setSaving(false);
    router.replace(`/manage/event/${id}`);
  };

  const save = async () => {
    if (!draft) return;
    const p = validateEventDraft(draft, creating);
    if (p) {
      showProblem(p);
      return;
    }
    setSaving(true);
    setError('');
    const pin = await quietPin(draft);
    const d = pin ? { ...draft, latitude: pin.latitude, longitude: pin.longitude } : draft;

    if (creating) {
      await create(d);
      return;
    }

    const res = await updateEvent(eventId!, eventDraftToPayload(d, original ?? undefined, parentId));
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

  const next = () => {
    if (!draft) return;
    // Only this step's fields (and earlier ones) block moving on.
    const p = validateEventDraft(draft, true);
    if (p && FIELD_STEP[p.field] <= step) {
      showProblem(p);
      return;
    }
    goTo(step + 1);
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
  const errorFor = (f: DraftField) => (problem?.field === f ? problem.message : undefined);
  const whenError = errorFor('end') ?? errorFor('recurrence');
  /** Create shows one step at a time; edit shows everything. */
  const on = (s: number) => !creating || step === s;
  const atEnd = !creating || step === LAST_STEP;
  const primaryLabel = !atEnd ? 'Next' : !creating ? 'Save changes' : launch === 'publish' ? 'Create and publish' : 'Create draft';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {creating ? <StepHeader step={step} reached={reached} onPick={goTo} /> : null}

        {restored && step === 0 ? (
          <Text style={[styles.note, { color: tokens.textSecondary, marginBottom: spacing[5] }]}>
            Picked up where I left off.{' '}
            <Text style={{ color: tokens.accent, ...font('semibold') }} onPress={startOver}>
              Start over
            </Text>
          </Text>
        ) : null}

        {parentId && step === 0 ? (
          <Text style={[styles.note, { color: tokens.textSecondary, marginBottom: spacing[5] }]}>
            Part of {parentTitle || 'the main event'}. People register for it on its own.
          </Text>
        ) : null}

        {on(0) ? (
          <>
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
              <FieldRow
                stacked
                label="Name"
                value={draft.title}
                onChangeText={(v) => set({ title: v })}
                placeholder="What's it called?"
                maxLength={150}
                error={errorFor('title')}
                autoFocus={creating && !restored}
                returnKeyType="next"
              />
              {!creating ? (
                <FieldRow
                  stacked
                  label="Link name"
                  value={draft.slug}
                  onChangeText={(v) => set({ slug: sanitizeSlug(v) })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errorFor('slug')}
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
              <TagsField label="Tags" value={draft.tags} onChange={(v) => set({ tags: v })} placeholder="tech, workshop, community" />
            </SettingsGroup>

            {categories.length > 0 ? (
              <View style={styles.block}>
                <BlockTitle>Categories</BlockTitle>
                <MultiChipPicker
                  // Keep picks that are no longer active categories visible, so they can be removed.
                  options={[...new Set([...categories.map((c) => c.name), ...draft.categories])].map((n) => ({ value: n, label: n }))}
                  value={draft.categories}
                  onChange={(v) => set({ categories: v })}
                  max={MAX_EVENT_CATEGORIES}
                />
                <Text style={[styles.note, { color: tokens.textMuted }]}>
                  Pick up to {MAX_EVENT_CATEGORIES}. The first one leads on event cards.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {on(1) ? (
          <>
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
            {whenError ? <Text style={[styles.note, styles.errorNote, { color: tokens.danger }]}>{whenError}</Text> : null}

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
                <FieldRow stacked label="Venue name" value={draft.venueName} onChangeText={(v) => setPlace({ venueName: v })} placeholder="Auditorium, café, campus…" />
                <FieldRow stacked label="Address" value={draft.venueAddress} onChangeText={(v) => setPlace({ venueAddress: v })} placeholder="Street and area" />
                <FieldRow label="City" value={draft.city} onChangeText={(v) => setPlace({ city: v })} placeholder="Hyderabad" />
                <SelectRow label="State" value={draft.state} options={INDIAN_STATES} onChange={(v) => setPlace({ state: v })} clearable />
              </SettingsGroup>
            ) : null}
            {showVenue(draft) && draft.latitude != null && draft.longitude != null ? (
              <View style={{ marginTop: spacing[3] }}>
                <VenueMap
                  coords={{ latitude: draft.latitude, longitude: draft.longitude }}
                  place={placeOf(draft)}
                  name={draft.venueName || 'Map pin'}
                  address={[draft.venueAddress, draft.city].filter(Boolean).join(', ')}
                  accent={tokens.accent}
                />
                <Text style={[styles.note, { color: tokens.textMuted }]}>
                  Wrong spot? Edit the address, then pin again.
                </Text>
              </View>
            ) : showVenue(draft) && hasPlace(draft) ? (
              <Pressable
                onPress={pinOnMap}
                disabled={pinning}
                accessibilityRole="button"
                style={({ pressed }) => [styles.pinRow, { opacity: pressed || pinning ? 0.6 : 1 }]}
              >
                {pinning ? <ActivityIndicator size="small" color={tokens.accent} /> : <MapPin size={20} color={tokens.accent} weight="fill" />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pinTitle, { color: tokens.accent }]}>{pinning ? 'Finding it…' : 'Pin on map'}</Text>
                  <Text style={[styles.coverHint, { color: tokens.textMuted }]}>So attendees get exact directions.</Text>
                </View>
              </Pressable>
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
                  error={errorFor('onlineUrl')}
                />
                <FieldRow label="Platform" value={draft.onlinePlatform} onChangeText={(v) => set({ onlinePlatform: v })} placeholder="Zoom, Meet…" />
              </SettingsGroup>
            ) : null}
          </>
        ) : null}

        {on(2) ? (
          <>
            <View style={[styles.block, creating && styles.firstBlock]}>
              <BlockTitle>Registration</BlockTitle>
              <SegmentedTabs tabs={REG_TABS} value={paid ? 'TICKETED' : 'RSVP'} onChange={setRegistration} />
            </View>

            {creating ? (
              <SettingsGroup title={paid ? 'First ticket' : 'RSVP option'} plain>
                <FieldRow stacked label="Name" value={draft.ticketName} onChangeText={(v) => set({ ticketName: v })} error={errorFor('ticketName')} />
                {paid ? (
                  <FieldRow
                    label="Price (₹)"
                    value={draft.ticketPrice}
                    onChangeText={(v) => set({ ticketPrice: v })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    error={errorFor('ticketPrice')}
                  />
                ) : null}
                <FieldRow
                  label="Capacity"
                  value={draft.ticketCapacity}
                  onChangeText={(v) => set({ ticketCapacity: v })}
                  placeholder="Unlimited"
                  keyboardType="number-pad"
                  error={errorFor('ticketCapacity')}
                />
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
              <View style={styles.block}>
                <BlockTitle>When it's created</BlockTitle>
                <SegmentedTabs tabs={LAUNCH_TABS} value={launch} onChange={setLaunch} />
                <Text style={[styles.note, { color: tokens.textMuted }]}>{LAUNCH_HINT[launch]}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <SaveBar
        visible={dirty}
        label={primaryLabel}
        onPress={atEnd ? save : next}
        loading={saving}
        // Edit is one long page, so repeat a field problem where it's always visible.
        error={error || (!creating ? problem?.message : undefined)}
      />
    </KeyboardAvoidingView>
  );
}

/** "Basics · When & where · Tickets" with a bar each; steps already reached can be tapped. */
function StepHeader({ step, reached, onPick }: { step: number; reached: number; onPick: (s: number) => void }) {
  const tokens = useTokens();
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      {CREATE_STEPS.map((label, i) => {
        const open = i <= reached;
        return (
          <Pressable
            key={label}
            onPress={() => open && onPick(i)}
            disabled={!open}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === step, disabled: !open }}
            accessibilityLabel={`Step ${i + 1} of ${CREATE_STEPS.length}, ${label}`}
            style={styles.stepItem}
          >
            <View style={[styles.stepBar, { backgroundColor: i <= step ? tokens.accent : tokens.fill }]} />
            <Text
              style={[styles.stepLabel, { color: i === step ? tokens.text : open ? tokens.textSecondary : tokens.textMuted }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  steps: { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[6] },
  stepItem: { flex: 1, gap: spacing[2] },
  stepBar: { height: 3, borderRadius: 2 },
  stepLabel: { fontSize: typography.fontSize.xs, ...font('semibold') },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  cover: { width: 144, height: 108, borderRadius: borderRadius.lg, overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  change: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  coverHint: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[3], marginHorizontal: spacing[1] },
  pinTitle: { fontSize: typography.fontSize.sm, ...font('semibold') },
  block: { marginTop: spacing[8] },
  firstBlock: { marginTop: 0 },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  errorNote: { marginBottom: spacing[2], ...font('medium') },
});
