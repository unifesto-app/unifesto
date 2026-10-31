import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Buildings, CheckCircle, Circle, UsersThree } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { createSpaceRequest } from '../lib/api/spaces';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { CardBackdrop } from '../components/ui/CardSurface';
import AuthField from '../components/auth/AuthField';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import useTopSpacing from '../hooks/useTopSpacing';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, displayTracking, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';
import useContentWidth from '../hooks/useContentWidth';

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

/**
 * Start a space. The pitch first, then the form: the space, its kind, its
 * city. Q29: it goes live at once, marked Unverified, and opens in Manage.
 */
export default function SpaceRequestScreen() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { inset } = useContentWidth();
  const topSpacing = useTopSpacing();

  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'REGULAR' | 'SUPER'>('REGULAR');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [requesterRole, setRequesterRole] = useState('');
  const [authorised, setAuthorised] = useState(false);

  const ready = name.trim().length > 0 && description.trim().length > 0 && authorised;

  const handleSubmit = async () => {
    if (!ready) return;
    // "Other" means the city is typed in; send what they typed, not the word "Other".
    const cityValue = city === 'Other' ? otherCity.trim() : city;
    setSubmitting(true);
    try {
      const { space } = await createSpaceRequest({
        name: name.trim(),
        description: description.trim(),
        type,
        city: cityValue || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        requesterRole: requesterRole.trim() || undefined,
        authorityConfirmed: authorised,
      });
      router.replace(`/manage/space/${space.id}`);
      AppAlert.alert(`${space.name} is live`, 'It shows as Unverified until Unifesto confirms who runs it. Set up your first event.');
    } catch (e: any) {
      AppAlert.alert('Could not create the space', e.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 150 + insets.bottom }]}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* The pitch: the screen's own title and what a space gets you, straight on the page. */}
          <View style={styles.head}>
            <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">
              Run events for your community
            </Text>
            <Text style={[styles.lead, { color: c.soft }]}>
              A space is your home on Unifesto: your events, members and team in one place. It goes live as soon as you
              create it.
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

            <Section title="My space" subtitle="What people will see" style={styles.tightSection}>
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
                        { backgroundColor: active ? c.primary : undefined, transform: [{ scale: pressed ? 0.97 : 1 }] },
                      ]}
                    >
                      {!active ? <CardBackdrop shape={styles.type} /> : null}
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
                        { backgroundColor: active ? c.primary : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                    >
                      {!active ? <CardBackdrop shape={styles.chip} /> : null}
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

            <Section title="About you" subtitle="Who is asking for this space">
              <View style={styles.fields}>
                <AuthField
                  label="Your role (optional)"
                  value={requesterRole}
                  onChangeText={setRequesterRole}
                  placeholder="e.g. President, Coding Club"
                  maxLength={120}
                />
                <Pressable
                  onPress={() => setAuthorised((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: authorised }}
                  style={({ pressed }) => [styles.consent, { opacity: pressed ? 0.7 : 1 }]}
                >
                  {authorised ? <CheckCircle size={24} color={c.text} weight="fill" /> : <Circle size={24} color={c.muted} />}
                  <Text style={[styles.consentText, { color: c.soft }]}>
                    I'm authorised to represent this organisation, and I own or have permission to use any name and
                    logo I add. The space goes live at once, marked Unverified until Unifesto confirms this.
                  </Text>
                </Pressable>
              </View>
            </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bar, { left: inset, right: inset, paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <LinearGradient colors={[`${c.bg}00`, c.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <AuthButton label="Create space" arrow loading={submitting} disabled={!ready} onPress={handleSubmit} />
        {!ready ? (
          <Text style={[styles.hint, { color: c.muted }]}>
            {name.trim() && description.trim() ? 'Confirm you can represent it to continue' : 'Add a name and what it’s about to continue'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  // Section's default top margin is sized for Home; tighter under the pitch.
  tightSection: { marginTop: spacing[10] },
  head: { paddingHorizontal: GUTTER, marginTop: spacing[4] },
  title: { fontSize: 28, lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  lead: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
  perks: { marginTop: spacing[5], gap: spacing[3] },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  perkText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  fields: { paddingHorizontal: GUTTER, gap: spacing[5] },
  types: { flexDirection: 'row', gap: spacing[3] },
  type: { flex: 1, borderRadius: cosmosCardRadius, padding: spacing[4], gap: 4 },
  typeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  typeTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  typeBody: { fontSize: typography.fontSize.xs, lineHeight: 17, ...cosmosFont.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[4], borderRadius: cosmosRadius, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  consentText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
  hint: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
