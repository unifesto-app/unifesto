import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Check, CheckCircle, WarningCircle } from '@unifesto/unicon/react-native';
import useTopSpacing from '../hooks/useTopSpacing';
import { GENDER_OPTIONS, useEditProfile } from '../hooks/useEditProfile';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { CardBackdrop } from '../components/ui/CardSurface';
import AuthField from '../components/auth/AuthField';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER, Section } from '../components/home/Section';
import Skeleton from '../components/Skeleton';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const AVATAR = 76;

const LINKS = [
  { key: 'linkedinUrl', label: 'LinkedIn', placeholder: 'linkedin.com/in/you' },
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'instagram.com/you' },
  { key: 'githubUrl', label: 'GitHub', placeholder: 'github.com/you' },
  { key: 'websiteUrl', label: 'Website', placeholder: 'yourwebsite.com' },
] as const;

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '·';

/**
 * Profile › Edit profile. A live preview of the identity card (photo, name,
 * handle) on top, then the fields in the order registration cares about:
 * the basics it requires, the optional bio, then links. Save springs up from
 * the bottom only when something changed (logic lives in useEditProfile).
 */
export default function EditProfileScreen() {
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const p = useEditProfile();
  const { fields, set } = p;

  // Keep the bar up for a beat after saving so "Saved" is actually seen.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (p.saveStatus !== 'saved') return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1400);
    return () => clearTimeout(t);
  }, [p.saveStatus]);

  const barVisible = p.isDirty || p.saveStatus === 'saving' || showSaved;
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(barVisible ? 0 : 140, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(barVisible ? 1 : 0, { duration: 180 }),
  }));

  if (p.loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <View style={{ paddingTop: topSpacing, paddingHorizontal: GUTTER }}>
          <Skeleton width="100%" height={AVATAR + spacing[6] * 2} borderRadius={cosmosCardRadius} />
          {[2, 1, 4].map((rows, i) => (
            <Skeleton key={i} width="100%" height={rows * 82} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
          ))}
        </View>
      </View>
    );
  }

  const usernameStatus = p.checkingUsername ? (
    <ActivityIndicator size="small" color={c.muted} />
  ) : p.usernameError ? (
    <WarningCircle size={20} color={c.danger} weight="fill" />
  ) : p.usernameAvailable ? (
    <CheckCircle size={20} color={c.text} weight="fill" />
  ) : null;

  const saved = showSaved && !p.isDirty;
  const displayName = fields.fullName.trim() || 'Your name';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Live preview: what the Profile tab will show */}
        <Pressable
          onPress={p.pickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change photo"
          style={({ pressed }) => [styles.identity, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}
        >
          <CardBackdrop shape={styles.identity} />
          <View style={[styles.avatar, { backgroundColor: c.tint }]}>
            {p.avatarUrl ? (
              <Image source={{ uri: p.avatarUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={[styles.initials, { color: c.text }]}>{initials(fields.fullName || fields.username)}</Text>
            )}
          </View>
          <View style={styles.who}>
            <Text style={[styles.name, { color: fields.fullName.trim() ? c.text : c.muted }]} numberOfLines={2}>
              {displayName}
            </Text>
            {fields.username ? (
              <Text style={[styles.handle, { color: c.muted }]} numberOfLines={1}>@{fields.username}</Text>
            ) : null}
            <View style={styles.changePhoto}>
              <Camera size={16} color={c.text} weight="fill" />
              <Text style={[styles.changePhotoText, { color: c.text }]}>
                {p.avatarUrl ? 'Change photo' : 'Add a photo'}
              </Text>
            </View>
          </View>
        </Pressable>

        <Section title="The basics" subtitle="Needed to register for events" style={styles.firstSection}>
          <View style={styles.fields}>
            <AuthField
              label="Full name"
              value={fields.fullName}
              onChangeText={set('fullName')}
              placeholder="As it should appear on passes"
              textContentType="name"
              autoComplete="name"
            />
            <View>
              <AuthField
                label="Username"
                prefix="@"
                value={fields.username}
                onChangeText={p.onChangeUsername}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                error={!!p.usernameError}
                trailing={usernameStatus}
              />
              {p.usernameError ? (
                <Text style={[styles.error, { color: c.danger }]}>{p.usernameError}</Text>
              ) : null}
            </View>
            <View>
              <Text style={[styles.label, { color: c.muted }]}>Gender</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {GENDER_OPTIONS.map((opt) => {
                  const active = fields.gender === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => set('gender')(opt.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? c.primary : c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] },
                      ]}
                    >
                      {active ? <Check size={14} color={c.primaryFg} weight="bold" /> : null}
                      <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Section>

        <Section title="About you" subtitle="Shown on your public profile" style={styles.section}>
          <View style={styles.fields}>
            <AuthField
              label="Bio"
              value={fields.bio}
              onChangeText={set('bio')}
              placeholder="A line or two about you"
              multiline
            />
          </View>
        </Section>

        <Section title="Links" subtitle="Where people can find you" style={styles.section}>
          <View style={styles.fields}>
            {LINKS.map((l) => (
              <AuthField
                key={l.key}
                label={l.label}
                value={fields[l.key]}
                onChangeText={set(l.key)}
                placeholder={l.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
              />
            ))}
          </View>
        </Section>
      </ScrollView>

      {/* Save bar: slides up only when there is something to save */}
      <Animated.View
        pointerEvents={barVisible ? 'auto' : 'none'}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }, barStyle]}
      >
        <LinearGradient colors={[`${c.bg}00`, c.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <AuthButton
          label={saved ? 'Saved' : 'Save changes'}
          icon={saved ? <Check size={18} color={c.primaryFg} weight="bold" /> : undefined}
          onPress={p.save}
          loading={p.saveStatus === 'saving'}
          disabled={saved}
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    marginHorizontal: GUTTER,
    marginTop: spacing[4],
    padding: spacing[6],
    borderRadius: cosmosCardRadius,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 22, ...cosmosFont.strong },
  who: { flex: 1 },
  // Names are never display.
  name: { fontSize: 18, lineHeight: 24, ...cosmosFont.strong },
  handle: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  changePhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing[3] },
  changePhotoText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // Section's default top margin is sized for Home; a form steps by spacing[8].
  firstSection: { marginTop: spacing[8] },
  section: { marginTop: spacing[8] },
  fields: { paddingHorizontal: GUTTER, gap: spacing[5] },
  label: { fontSize: 13, marginBottom: 8, ...cosmosFont.strong },
  error: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing[4],
    borderRadius: cosmosRadius,
  },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: GUTTER,
    paddingTop: spacing[6],
  },
});
