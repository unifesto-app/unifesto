import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { At, Camera, Trash } from '@unifesto/unicon/react-native';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { SettingsGroup } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import {
  getAdminUser,
  removeAdminUserAvatar,
  updateAdminUser,
  uploadAdminUserAvatar,
  type AdminUserDetail,
  type AdminUserPatch,
} from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Platform admin edits someone else's profile (Apex parity). Photo changes
 * apply immediately, like on web; text fields wait for Save.
 */

const GUTTER = spacing[6];
const AVATAR = 100;
const ICON = 28;

export type EditableKey = keyof AdminUserPatch;
export type UserFields = Record<EditableKey, string>;

const KEYS: EditableKey[] = ['fullName', 'username', 'bio', 'linkedinUrl', 'instagramUrl', 'githubUrl', 'websiteUrl'];
const REQUIRED = new Set<EditableKey>(['fullName', 'username']);

const toFields = (u: AdminUserDetail): UserFields =>
  Object.fromEntries(KEYS.map((k) => [k, (u[k] as string | null) ?? ''])) as UserFields;

/**
 * Turn the edited form into the PATCH body: only the fields that changed.
 * An emptied optional field is sent as null (clears it; '' would fail the
 * backend's @IsUrl). Name and username can't be cleared, so emptying them is
 * ignored.
 */
export function buildUserPatch(original: UserFields, fields: UserFields): AdminUserPatch {
  const patch: AdminUserPatch = {};
  for (const key of KEYS) {
    const next = fields[key].trim();
    if (next === original[key]) continue;
    if (next) patch[key] = next;
    else if (!REQUIRED.has(key)) patch[key] = null;
  }
  return patch;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?';

export default function AdminEditUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();

  const [original, setOriginal] = useState<UserFields | null>(null);
  const [fields, setFields] = useState<UserFields | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getAdminUser(id!);
    if (!res.ok) {
      setLoadError(res.denied ? 'Only Unifesto platform admins can edit users.' : res.message);
      return;
    }
    const f = toFields(res.data.user);
    setOriginal(f);
    setFields(f);
    setAvatarUrl(res.data.user.avatarUrl);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: EditableKey) => (value: string) => {
    setError('');
    setFields((f) => (f ? { ...f, [key]: value } : f));
  };

  const patch = useMemo(() => (original && fields ? buildUserPatch(original, fields) : {}), [original, fields]);
  const isDirty = Object.keys(patch).length > 0;

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withSpring(isDirty ? 0 : 140, { damping: 18, stiffness: 180 }) }],
    opacity: withTiming(isDirty ? 1 : 0, { duration: 180 }),
  }));

  const save = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setError('');
    const res = await updateAdminUser(id!, patch);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      AppAlert.alert('Permission required', 'Allow photo library access to change the photo.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setAvatarBusy(true);
    const res = await uploadAdminUserAvatar(id!, picked.assets[0].uri);
    setAvatarBusy(false);
    if (res.ok) setAvatarUrl(res.data.avatarUrl);
    else AppAlert.alert('Photo not updated', res.message);
  };

  const removeAvatar = () =>
    AppAlert.alert('Remove photo?', 'Their profile goes back to initials.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setAvatarBusy(true);
          const res = await removeAdminUserAvatar(id!);
          setAvatarBusy(false);
          if (res.ok) setAvatarUrl(null);
          else AppAlert.alert('Photo not removed', res.message);
        },
      },
    ]);

  if (!fields) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const unicon = (name: GlyphName) => <UnGlyph name={name} size={ICON} color={tokens.text} />;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: tokens.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Photo: applies immediately */}
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickAvatar} disabled={avatarBusy} accessibilityRole="button" accessibilityLabel="Change photo">
            <LinearGradient colors={tokens.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
              <View style={[styles.avatar, { backgroundColor: tokens.elevated, borderColor: tokens.bg }]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Text style={[styles.initials, { color: tokens.text }]}>{initials(fields.fullName || fields.username)}</Text>
                )}
                {avatarBusy ? (
                  <View style={[StyleSheet.absoluteFill, styles.avatarBusy]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </View>
            </LinearGradient>
          </Pressable>
          <View style={styles.photoActions}>
            <Pressable onPress={pickAvatar} disabled={avatarBusy} hitSlop={8} style={styles.photoAction}>
              <Camera size={16} color={tokens.accent} weight="fill" />
              <Text style={[styles.photoActionText, { color: tokens.accent }]}>{avatarUrl ? 'Change photo' : 'Add photo'}</Text>
            </Pressable>
            {avatarUrl ? (
              <Pressable onPress={removeAvatar} disabled={avatarBusy} hitSlop={8} style={styles.photoAction}>
                <Trash size={16} color={tokens.danger} weight="fill" />
                <Text style={[styles.photoActionText, { color: tokens.danger }]}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <SettingsGroup title="Profile">
          <FormRow icon={unicon('user')} value={fields.fullName} onChangeText={set('fullName')} placeholder="Full name" />
          <FormRow
            icon={<At size={22} color={tokens.text} weight="bold" />}
            value={fields.username}
            onChangeText={(v) => set('username')(v.toLowerCase())}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </SettingsGroup>

        <SettingsGroup title="Bio">
          <FormRow icon={unicon('file-text')} value={fields.bio} onChangeText={set('bio')} placeholder="Short bio" multiline />
        </SettingsGroup>

        <SettingsGroup title="Links">
          {([
            ['linkedin-logo', 'linkedinUrl', 'https://linkedin.com/in/…'],
            ['instagram-logo', 'instagramUrl', 'https://instagram.com/…'],
            ['github-logo', 'githubUrl', 'https://github.com/…'],
            ['globe', 'websiteUrl', 'https://…'],
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
            />
          ))}
        </SettingsGroup>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      </ScrollView>

      <Animated.View pointerEvents={isDirty ? 'auto' : 'none'} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }, barStyle]}>
        <LinearGradient colors={[`${tokens.bg}00`, tokens.bg]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Button label="Save changes" onPress={save} loading={saving} size="lg" fullWidth />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  avatarWrap: { alignSelf: 'center', alignItems: 'center' },
  ring: { width: AVATAR + 8, height: AVATAR + 8, borderRadius: (AVATAR + 8) / 2, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBusy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  initials: { fontSize: 34, ...font('heading') },
  photoActions: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] },
  photoAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoActionText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { marginTop: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: spacing[6] },
});
