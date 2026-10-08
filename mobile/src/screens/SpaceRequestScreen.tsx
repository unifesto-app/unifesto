import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Buildings, CheckCircle, Circle, UsersThree } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { createSpaceRequest, getMySpaceRequests, type SpaceRequest } from '../lib/api/spaces';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthField from '../components/auth/AuthField';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const SPACE_TYPES = [
  { value: 'REGULAR', title: 'Community', body: 'A club, collective or startup', Icon: UsersThree },
  { value: 'SUPER', title: 'Institution', body: 'A university or college, with spaces inside it', Icon: Buildings },
] as const;

const CITIES = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Kolkata', 'Other'];

/** What a space gets you, said once at the top. */
const PERKS: { icon: GlyphName; text: string }[] = [
  { icon: 'calendar-blank', text: 'Events with tickets, check-in and payouts' },
  { icon: 'users-three', text: 'Members and a team with their own roles' },
  { icon: 'chart-bar', text: 'Analytics, certificates and sponsors' },
];

const STATUS = {
  PENDING: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
} as const;

/** Requests shown before "Load more", and how many each tap adds. */
const PAGE = 3;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Request a new space. The pitch first, then either the request under review
 * (only one can be pending at a time) or the form: the space, its kind, its
 * city. Past requests sit last, a few at a time; a turned-down one can be edited and resent.
 */
export default function SpaceRequestScreen() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const scroll = useRef<ScrollView>(null);

  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'REGULAR' | 'SUPER'>('REGULAR');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const load = useCallback(async () => {
    try {
      setRequests(await getMySpaceRequests());
    } catch (e) {
      if (__DEV__) console.error('Failed to load requests', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ready = name.trim().length > 0 && description.trim().length > 0;

  const handleSubmit = async () => {
    if (!ready) return;
    // "Other" means the city is typed in; send what they typed, not the word "Other".
    const cityValue = city === 'Other' ? otherCity.trim() : city;
    setSubmitting(true);
    try {
      await createSpaceRequest({
        name: name.trim(),
        description: description.trim(),
        type,
        city: cityValue || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
      });
      setName('');
      setDescription('');
      setCity('');
      setOtherCity('');
      setWebsiteUrl('');
      await load();
      scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (e: any) {
      AppAlert.alert('Could not send', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Load a turned-down request back into the form to fix and resend. */
  const editAndResend = (r: SpaceRequest) => {
    setName(r.name);
    setDescription(r.description ?? '');
    setType(r.type === 'SUPER' ? 'SUPER' : 'REGULAR');
    const known = r.city && CITIES.includes(r.city);
    setCity(r.city ? (known ? r.city : 'Other') : '');
    setOtherCity(r.city && !known ? r.city : '');
    setWebsiteUrl(r.websiteUrl ?? '');
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const pending = requests.find((r) => r.status === 'PENDING');

  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <View style={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, gap: spacing[4] }}>
          <Skeleton width="100%" height={230} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[4] }} />
          <Skeleton width="100%" height={260} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[8] }} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: (pending ? spacing[10] : 150) + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* The pitch */}
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text style={[styles.title, { color: c.text }]}>Run events for your community</Text>
            <Text style={[styles.lead, { color: c.soft }]}>
              A space is your home on Unifesto: your events, members and team in one place.
            </Text>
            <View style={styles.perks}>
              {PERKS.map((p) => (
                <View key={p.text} style={styles.perk}>
                  <UnGlyph name={p.icon} size={22} color={c.text} />
                  <Text style={[styles.perkText, { color: c.soft }]}>{p.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {pending ? (
            <Section title="Your request" style={styles.tightSection}>
              <View style={[styles.card, { backgroundColor: c.raised }]}>
                <View style={styles.pendingHead}>
                  <LiveDot color={c.text} />
                  <Text style={[styles.pendingLabel, { color: c.text }]}>Under review</Text>
                </View>
                <Text style={[styles.pendingName, { color: c.text }]}>{pending.name}</Text>
                <Text style={[styles.lead, { color: c.soft, marginTop: spacing[2] }]}>
                  Sent {formatDate(pending.createdAt)}. We’ll get back to you within 2 to 3 business days, and you can
                  only have one request under review at a time.
                </Text>
              </View>
            </Section>
          ) : (
            <>
              <Section title="Your space" subtitle="What people will see" style={styles.tightSection}>
                <View style={styles.fields}>
                  <AuthField label="Name" value={name} onChangeText={setName} placeholder="e.g. Hyderabad Runners" maxLength={255} />
                  <AuthField
                    label="About"
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What is it about, and who is it for?"
                    multiline
                    maxLength={2000}
                  />
                  <AuthField
                    label="Website (optional)"
                    value={websiteUrl}
                    onChangeText={setWebsiteUrl}
                    placeholder="yourspace.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              </Section>

              <Section title="Kind of space">
                <View style={[styles.pad, styles.types]} accessibilityRole="radiogroup">
                  {SPACE_TYPES.map(({ value, title, body, Icon }) => {
                    const active = type === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setType(value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.type,
                          // Selected = silver fill, never an outline (borderless cards).
                          { backgroundColor: active ? c.primary : c.raised, transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                      >
                        <View style={styles.typeHead}>
                          <Icon size={26} color={active ? c.primaryFg : c.text} weight={active ? 'fill' : 'regular'} />
                          {active ? <CheckCircle size={20} color={c.primaryFg} weight="fill" /> : <Circle size={20} color={c.muted} />}
                        </View>
                        <Text style={[styles.typeTitle, { color: active ? c.primaryFg : c.text }]}>{title}</Text>
                        <Text style={[styles.typeBody, { color: active ? c.primaryFg : c.muted }]}>{body}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>

              <Section title="City" subtitle="Where most of your events happen">
                <View style={[styles.pad, styles.chips]}>
                  {CITIES.map((name_) => {
                    const active = city === name_;
                    return (
                      <Pressable
                        key={name_}
                        onPress={() => setCity(active ? '' : name_)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.chip,
                          { backgroundColor: active ? c.primary : c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{name_}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {city === 'Other' ? (
                  <View style={[styles.pad, { marginTop: spacing[4] }]}>
                    <AuthField label="Which city?" value={otherCity} onChangeText={setOtherCity} placeholder="City" autoFocus />
                  </View>
                ) : null}
              </Section>
            </>
          )}

          {requests.length > 0 ? (
            <Section title="My requests" subtitle={requests.length > PAGE ? `${requests.length} sent` : undefined}>
              <View style={[styles.pad, styles.list]}>
                {requests.slice(0, shown).map((r, i, visible) => {
                  // The last card fades into the page while more are tucked away below it.
                  const faded = shown < requests.length && i === visible.length - 1;
                  return (
                    <View key={r.id} style={[styles.request, { backgroundColor: c.raised }]}>
                      <View style={styles.requestHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.requestName, { color: c.text }]} numberOfLines={1}>{r.name}</Text>
                          <Text style={[styles.small, { color: c.muted }]}>{formatDate(r.createdAt)}</Text>
                        </View>
                        <View style={[styles.pill, { backgroundColor: r.status === 'REJECTED' ? 'rgba(239,68,68,0.14)' : c.tint }]}>
                          <Text style={[styles.pillText, { color: r.status === 'REJECTED' ? c.danger : c.text }]}>{STATUS[r.status]}</Text>
                        </View>
                      </View>
                      {r.status === 'REJECTED' && r.reviewNote ? (
                        <Text style={[styles.note, { color: c.soft }]}>“{r.reviewNote}”</Text>
                      ) : null}
                      {r.status === 'REJECTED' && !pending && !faded ? (
                        <RowAction label="Edit and resend" onPress={() => editAndResend(r)} />
                      ) : null}
                      {faded ? (
                        <LinearGradient
                          colors={[`${c.bg}00`, c.bg]}
                          locations={[0, 0.85]}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                      ) : null}
                    </View>
                  );
                })}
                {shown < requests.length ? (
                  <Pressable
                    onPress={() => setShown((n) => n + PAGE)}
                    accessibilityRole="button"
                    accessibilityLabel={`Load ${Math.min(PAGE, requests.length - shown)} more requests`}
                    style={({ pressed }) => [styles.loadMore, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.rowActionText, { color: c.text }]}>Load more</Text>
                    <Text style={[styles.small, { color: c.muted, marginTop: 0 }]}>{requests.length - shown} more</Text>
                  </Pressable>
                ) : null}
              </View>
            </Section>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {!pending ? (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <LinearGradient colors={[`${c.bg}00`, c.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <AuthButton label="Send request" arrow loading={submitting} disabled={!ready} onPress={handleSubmit} />
          {!ready ? <Text style={[styles.hint, { color: c.muted }]}>Add a name and what it’s about to send</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useCosmos();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.rowAction, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.rowActionText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Pulsing dot for "under review". */
function LiveDot({ color }: { color: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 1.3 }] }));
  return (
    <View style={styles.liveWrap}>
      <Animated.View style={[styles.liveRing, { backgroundColor: color }, ring]} />
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  // Section's default top margin is sized for Home; tighter under the pitch.
  tightSection: { marginTop: spacing[10] },
  card: { marginHorizontal: GUTTER, marginTop: spacing[4], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  title: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  lead: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  perks: { marginTop: spacing[5], gap: spacing[3] },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  perkText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pendingLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  pendingName: { marginTop: spacing[4], fontSize: 17, lineHeight: 24, ...cosmosFont.display },
  liveWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  fields: { paddingHorizontal: GUTTER, gap: spacing[5] },
  types: { flexDirection: 'row', gap: spacing[3] },
  type: { flex: 1, borderRadius: cosmosCardRadius, padding: spacing[4], gap: 4 },
  typeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  typeTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  typeBody: { fontSize: typography.fontSize.xs, lineHeight: 17, ...cosmosFont.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[4], borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  list: { gap: spacing[3] },
  request: { borderRadius: cosmosCardRadius, padding: spacing[4], overflow: 'hidden' },
  // Pulled up under the faded card so the two read as one.
  loadMore: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing[2], marginTop: -spacing[2], paddingVertical: spacing[2] },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  requestName: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  small: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, ...cosmosFont.strong },
  note: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  rowAction: { alignSelf: 'flex-start', marginTop: spacing[3] },
  rowActionText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  hint: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
