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
import { At, Camera, Check, CheckCircle, WarningCircle } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { CardBackdrop } from '../components/ui/CardSurface';
import useTopSpacing from '../hooks/useTopSpacing';
import { GENDER_OPTIONS, useEditProfile } from '../hooks/useEditProfile';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import FormRow from '../components/profile/FormRow';
import { Button } from '../components/ui';
import Skeleton from '../components/Skeleton';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const AVATAR = 100;
const ICON = 28;

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

export default function EditProfileScreen() {
  const tokens = useTokens();
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
      <View style={[styles.container, { backgroundColor: tokens.bg, paddingTop: topSpacing, paddingHorizontal: GUTTER }]}>
        <View style={{ alignItems: 'center' }}>
          <Skeleton width={AVATAR + 8} height={AVATAR + 8} borderRadius={(AVATAR + 8) / 2} />
          <Skeleton width={100} height={14} borderRadius={7} style={{ marginTop: spacing[3] }} />
        </View>
        {[3, 1, 4].map((rows, i) => (
          <Skeleton key={i} width="100%" height={rows * 56} borderRadius={borderRadius.xl} style={{ marginTop: spacing[8] }} />
        ))}
      </View>
    );
  }

  const unicon = (name: GlyphName) => <UnGlyph name={name} size={ICON} color={tokens.text} />;
  const usernameStatus = p.checkingUsername ? (
    <ActivityIndicator size="small" color={tokens.textMuted} />
  ) : p.usernameError ? (
    <WarningCircle size={20} color={tokens.danger} weight="fill" />
  ) : p.usernameAvailable ? (
    <CheckCircle size={20} color={tokens.success} weight="fill" />
  ) : null;

  const saved = showSaved && !p.isDirty;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: tokens.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Photo */}
        <Pressable onPress={p.pickAvatar} style={styles.avatarWrap} accessibilityRole="button" accessibilityLabel="Change photo">
          <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
            <View style={[styles.avatar, { backgroundColor: tokens.elevated, borderColor: tokens.bg }]}>
              {p.avatarUrl ? (
                <Image source={{ uri: p.avatarUrl }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={[styles.initials, { color: tokens.text }]}>{initials(fields.fullName || fields.username)}</Text>
              )}
            </View>
          </LinearGradient>
          <View style={styles.changePhotoRow}>
            <Camera size={16} color={tokens.accent} weight="fill" />
            <Text style={[styles.changePhoto, { color: tokens.accent }]}>Change photo</Text>
          </View>
        </Pressable>

        {/* The three fields registration needs */}
        <SettingsGroup title="About me">
          <FormRow
            icon={unicon('user')}
            value={fields.fullName}
            onChangeText={set('fullName')}
            placeholder="Full name"
            textContentType="name"
            autoComplete="name"
          />
          <FormRow
            icon={<At size={22} color={tokens.text} weight="bold" />}
            value={fields.username}
            onChangeText={p.onChangeUsername}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            trailing={usernameStatus}
          />
        </SettingsGroup>
        {p.usernameError ? (
          <Text style={[styles.error, { color: tokens.danger }]}>{p.usernameError}</Text>
        ) : null}

        <View style={styles.genderBlock}>
          <Text style={[styles.groupTitle, { color: tokens.textMuted }]}>Gender</Text>
          <View style={styles.chips}>
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
                    { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  {!active ? <CardBackdrop shape={styles.chip} /> : null}
                  {active ? <Check size={14} color={tokens.bg} weight="bold" /> : null}
                  <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SettingsGroup title="Bio">
          <FormRow
            icon={unicon('file-text')}
            value={fields.bio}
            onChangeText={set('bio')}
            placeholder="A line or two about you"
            multiline
          />
        </SettingsGroup>

        <SettingsGroup title="Links">
          {([
            ['linkedin-logo', 'linkedinUrl', 'linkedin.com/in/you'],
            ['instagram-logo', 'instagramUrl', 'instagram.com/you'],
            ['github-logo', 'githubUrl', 'github.com/you'],
            ['globe', 'websiteUrl', 'yourwebsite.com'],
          ] as const).map(([iconName, key, placeholder]) => (
            <FormRow
              key={key}
              icon={unicon(iconName)}
              value={fields[key]}
              onChangeText={set(key)}
              placeholder={placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
            />
          ))}
        </SettingsGroup>
      </ScrollView>

      {/* Save bar: slides up only when there is something to save */}
      <Animated.View
        pointerEvents={barVisible ? 'auto' : 'none'}
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }, barStyle]}
      >
        <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Button
          label={saved ? 'Saved' : 'Save changes'}
          icon={saved ? <Check size={18} color={tokens.accentFg} weight="bold" /> : undefined}
          onPress={p.save}
          loading={p.saveStatus === 'saving'}
          disabled={saved}
          size="lg"
          fullWidth
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatarWrap: { alignSelf: 'center', alignItems: 'center' },
  ring: {
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 34, ...font('heading') },
  changePhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing[3] },
  changePhoto: { fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { marginTop: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  genderBlock: { marginTop: spacing[8] },
  groupTitle: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[3],
    marginLeft: spacing[1],
    ...font('semibold'),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
  },
  chipText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: GUTTER,
    paddingTop: spacing[6],
  },
});
