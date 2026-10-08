import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Buildings, CheckCircle, UsersThree } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { createSpaceRequest, getMySpaceRequests, type SpaceRequest } from '../lib/api/spaces';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import FormRow from '../components/profile/FormRow';
import { ActionBar } from '../components/event/EventOverlays';
import Skeleton from '../components/Skeleton';
import useTopSpacing from '../hooks/useTopSpacing';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';
import { CardBackdrop, GlassFill, LIQUID_GLASS } from '../components/ui/CardSurface';

const SELECTED_TINT = 'rgba(52,145,255,0.16)';

const GUTTER = spacing[6];

const SPACE_TYPES = [
  { value: 'REGULAR', title: 'Regular', body: 'A community, club or startup', Icon: UsersThree },
  { value: 'SUPER', title: 'Super', body: 'A university, college or institution', Icon: Buildings },
] as const;

const CITIES = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Kolkata', 'Other'];

const STATUS = {
  PENDING: { label: 'Under review', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Not approved', tone: 'danger' },
} as const;

/** Request a new space. One request can be under review at a time. */
export default function SpaceRequestScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(8);

  const [requests, setRequests] = useState<SpaceRequest[]>([]);
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

  const handleSubmit = async () => {
    if (!name.trim()) {
      AppAlert.alert('Name needed', 'Please enter a name for your space.');
      return;
    }
    if (!description.trim()) {
      AppAlert.alert('Description needed', 'Please tell us what your space is about.');
      return;
    }
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
    } catch (e: any) {
      AppAlert.alert('Could not send', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pending = requests.find((r) => r.status === 'PENDING');
  const toneColor = (tone: 'warning' | 'success' | 'danger') => tokens[tone];

  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER, gap: spacing[4] }]}>
        <Skeleton width="80%" height={28} borderRadius={8} />
        <Skeleton width="100%" height={180} borderRadius={borderRadius.xl} />
        <Skeleton width="100%" height={120} borderRadius={borderRadius.xl} />
      </View>
    );
  }

  const unicon = (n: GlyphName) => <UnGlyph name={n} size={28} color={tokens.text} />;

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: (pending ? spacing[10] : 140) + insets.bottom }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={[styles.title, { color: tokens.text }]}>Run events for your community</Text>
          <Text style={[styles.lead, { color: tokens.textSecondary }]}>
            A space is your home on Unifesto: your events, members and team in one place.
          </Text>

          {pending ? (
            <View style={[styles.card, { marginTop: spacing[6] }]}>
              <CardBackdrop shape={styles.card} />
              <View style={styles.pendingHead}>
                <LiveDot color={tokens.warning} />
                <Text style={[styles.pendingLabel, { color: tokens.warning }]}>Under review</Text>
              </View>
              <Text style={[styles.pendingName, { color: tokens.text }]}>{pending.name}</Text>
              <Text style={[styles.body, { color: tokens.textSecondary }]}>
                We'll get back to you within 2 to 3 business days.
              </Text>
            </View>
          ) : (
            <>
              <SettingsGroup title="About the space">
                <FormRow icon={unicon('user')} value={name} onChangeText={setName} placeholder="Space name" maxLength={255} />
                <FormRow
                  icon={unicon('file-text')}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What is it about, and who is it for?"
                  multiline
                  maxLength={2000}
                />
                <FormRow
                  icon={unicon('globe')}
                  value={websiteUrl}
                  onChangeText={setWebsiteUrl}
                  placeholder="Website (optional)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </SettingsGroup>

              <Text style={[styles.groupTitle, { color: tokens.textMuted }]}>Type</Text>
              <View style={styles.typeRow}>
                {SPACE_TYPES.map(({ value, title, body, Icon }) => {
                  const active = type === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setType(value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.typeCard,
                        // Selected = accent tint, never an outline (borderless cards). Scale, not
                        // opacity, for press: opacity breaks the glass.
                        {
                          backgroundColor: active && !LIQUID_GLASS ? SELECTED_TINT : undefined,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        },
                      ]}
                    >
                      {active ? (
                        <GlassFill radius={borderRadius.xl} interactive tint={SELECTED_TINT} />
                      ) : (
                        <CardBackdrop shape={styles.typeCard} />
                      )}
                      <View style={styles.typeHead}>
                        <Icon size={26} color={active ? tokens.accent : tokens.textSecondary} weight={active ? 'fill' : 'regular'} />
                        {active ? <CheckCircle size={20} color={tokens.accent} weight="fill" /> : null}
                      </View>
                      <Text style={[styles.typeTitle, { color: tokens.text }]}>{title}</Text>
                      <Text style={[styles.small, { color: tokens.textMuted }]}>{body}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.groupTitle, { color: tokens.textMuted }]}>City</Text>
              <View style={styles.chips}>
                {CITIES.map((c) => {
                  const active = city === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCity(active ? '' : c)}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                    >
                      {!active ? <CardBackdrop shape={styles.chip} /> : null}
                      <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {city === 'Other' ? (
                <View style={{ marginTop: spacing[3] }}>
                  <View style={[styles.card, { padding: 0 }]}>
                    <CardBackdrop shape={styles.card} />
                    <FormRow icon={unicon('map-pin')} value={otherCity} onChangeText={setOtherCity} placeholder="Which city?" autoFocus />
                  </View>
                </View>
              ) : null}
            </>
          )}

          {requests.length > 0 ? (
            <View style={{ marginTop: spacing[8] }}>
              <Text style={[styles.groupTitle, { color: tokens.textMuted, marginTop: 0 }]}>My requests</Text>
              <View style={[styles.card, { paddingVertical: spacing[1] }]}>
                <CardBackdrop shape={styles.card} />
                {requests.map((r, i) => {
                  const st = STATUS[r.status];
                  return (
                    <View key={r.id}>
                      <View style={styles.reqRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.reqName, { color: tokens.text }]} numberOfLines={1}>{r.name}</Text>
                          <Text style={[styles.small, { color: tokens.textMuted }]}>
                            {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                        <Text style={[styles.reqStatus, { color: toneColor(st.tone) }]}>{st.label}</Text>
                      </View>
                      {r.status === 'REJECTED' && r.reviewNote ? (
                        <Text style={[styles.note, { color: tokens.textSecondary }]}>“{r.reviewNote}”</Text>
                      ) : null}
                      {i < requests.length - 1 ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {!pending ? (
        <ActionBar info={null} label="Send request" loading={submitting} accent={tokens.accent} onPress={handleSubmit} />
      ) : null}
    </View>
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
  title: { fontSize: typography.fontSize['2xl'], lineHeight: typography.fontSize['2xl'] * 1.2, letterSpacing: -0.4, ...font('heading') },
  lead: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  small: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  card: { borderRadius: borderRadius.xl, padding: spacing[5], overflow: 'hidden' },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pendingLabel: { fontSize: typography.fontSize.sm, ...font('semibold') },
  pendingName: { marginTop: spacing[3], marginBottom: 4, fontSize: typography.fontSize.lg, ...font('heading') },
  liveWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  groupTitle: { marginTop: spacing[8], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  typeRow: { flexDirection: 'row', gap: spacing[3] },
  typeCard: { flex: 1, borderRadius: borderRadius.xl, padding: spacing[4], gap: 4 },
  typeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[2] },
  typeTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 38, paddingHorizontal: spacing[4], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  reqName: { fontSize: typography.fontSize.base, ...font('semibold') },
  reqStatus: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: -spacing[1], marginBottom: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  divider: { height: StyleSheet.hairlineWidth },
});
