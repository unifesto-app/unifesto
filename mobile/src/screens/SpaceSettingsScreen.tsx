import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { pickImageAtAspect } from '../utils/pickImage';
import { Buildings, ImageSquare } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  getSpaceProfile,
  updateSpaceProfile,
  uploadSpaceBanner,
  uploadSpaceLogo,
  type SpaceProfile,
  type SpaceProfilePatch,
} from '../lib/api/spaceSettings';
import { sanitizeSlug } from '../lib/eventDraft';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SelectRow from '../components/manage/SelectRow';
import { INDIAN_STATES } from '../lib/indianStates';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const VIS_TABS = [
  { key: 'PUBLIC' as const, label: 'Public' },
  { key: 'PRIVATE' as const, label: 'Private' },
];

type Form = SpaceProfilePatch & { tagsText: string };

const toForm = (p: SpaceProfile): Form => ({
  name: p.name,
  slug: p.slug,
  description: p.description,
  websiteUrl: p.websiteUrl,
  city: p.city,
  state: p.state,
  tags: p.tags,
  visibility: p.visibility,
  tagsText: p.tags.join(', '),
});

/**
 * The space's public profile: name, link, description, tags, logo (1:1),
 * banner (4:3), location and whether it's public. Images upload the moment
 * they're picked; the rest saves from the bar.
 */
export default function SpaceSettingsScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const { refresh: refreshAccess } = useSpaceAccess();

  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const initial = useRef('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);

  useAnalyticsScreenTracking('SpaceSettings');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const res = await getSpaceProfile(spaceId);
    if (!res.ok) {
      setLoadError(res.message);
      return;
    }
    const f = toForm(res.data);
    initial.current = JSON.stringify(f);
    setProfile(res.data);
    setForm(f);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (patch: Partial<Form>) => {
    setError('');
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  const dirty = form !== null && JSON.stringify(form) !== initial.current;

  const save = async () => {
    if (!form || !spaceId) return;
    if (form.name.trim().length < 2) {
      setError('Give the space a name.');
      return;
    }
    const slug = form.slug.replace(/-+$/, '');
    if (!slug) {
      setError('The link name can’t be empty.');
      return;
    }
    setSaving(true);
    const { tagsText, ...rest } = form;
    const res = await updateSpaceProfile(spaceId, {
      ...rest,
      name: rest.name.trim(),
      slug,
      description: rest.description.trim(),
      websiteUrl: rest.websiteUrl.trim(),
      city: rest.city.trim(),
      state: rest.state.trim(),
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const f = toForm(res.data);
    initial.current = JSON.stringify(f);
    setProfile(res.data);
    setForm(f);
    void refreshAccess(); // name/slug show on the Space tab
  };

  const pick = async (kind: 'logo' | 'banner') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      AppAlert.alert('Photos access needed', 'Allow photo library access to choose an image.');
      return;
    }
    const uri = await pickImageAtAspect(kind === 'logo' ? [1, 1] : [4, 3]).catch((e: Error) => {
      AppAlert.alert("Couldn't use that photo", e.message);
      return null;
    });
    if (!uri) return;
    setUploading(kind);
    const up = kind === 'logo' ? await uploadSpaceLogo(spaceId!, uri) : await uploadSpaceBanner(spaceId!, uri);
    setUploading(null);
    if (!up.ok) {
      AppAlert.alert("Couldn't upload", up.message);
      return;
    }
    const url = 'logoUrl' in up.data ? up.data.logoUrl : up.data.bannerUrl;
    setProfile((p) => (p ? { ...p, [kind === 'logo' ? 'logoUrl' : 'bannerUrl']: url } : p));
    if (kind === 'logo') void refreshAccess();
  };

  if (!form || !profile) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo 1:1 + compact 4:3 banner, each uploads on pick */}
        <View style={styles.images}>
          <Pressable onPress={() => pick('logo')} style={({ pressed }) => [styles.logo, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <CardBackdrop shape={styles.logo} />
            {profile.logoUrl ? (
              <Image source={{ uri: profile.logoUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.empty}>
                <Buildings size={28} color={tokens.textMuted} />
              </View>
            )}
            {uploading === 'logo' ? <ActivityIndicator style={StyleSheet.absoluteFill} color={tokens.accent} /> : null}
          </Pressable>
          <Pressable onPress={() => pick('banner')} style={({ pressed }) => [styles.banner, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <CardBackdrop shape={styles.banner} />
            {profile.bannerUrl ? (
              <Image source={{ uri: profile.bannerUrl }} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={styles.empty}>
                <ImageSquare size={28} color={tokens.textMuted} />
              </View>
            )}
            {uploading === 'banner' ? <ActivityIndicator style={StyleSheet.absoluteFill} color={tokens.accent} /> : null}
          </Pressable>
        </View>
        <View style={styles.captions}>
          <Text style={[styles.caption, { color: tokens.accent, width: 96 }]} onPress={() => pick('logo')}>
            {profile.logoUrl ? 'Change logo' : 'Add logo'}
          </Text>
          <Text style={[styles.caption, { color: tokens.accent }]} onPress={() => pick('banner')}>
            {profile.bannerUrl ? 'Change banner' : 'Add banner'}
          </Text>
        </View>

        <SettingsGroup title="Profile" plain>
          <FieldRow stacked label="Name" value={form.name} onChangeText={(v) => set({ name: v })} maxLength={100} />
          <FieldRow
            stacked
            label="Link name"
            value={form.slug}
            onChangeText={(v) => set({ slug: sanitizeSlug(v) })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldRow
            stacked
            multiline
            label="Description"
            value={form.description}
            onChangeText={(v) => set({ description: v })}
            placeholder="Tell people what this space is about"
          />
          <FieldRow stacked label="Tags" value={form.tagsText} onChangeText={(v) => set({ tagsText: v })} placeholder="tech, community, events" autoCapitalize="none" />
        </SettingsGroup>

        <SettingsGroup title="Location and web" plain>
          <FieldRow
            stacked
            label="Website"
            value={form.websiteUrl}
            onChangeText={(v) => set({ websiteUrl: v })}
            placeholder="https://example.com"
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldRow label="City" value={form.city} onChangeText={(v) => set({ city: v })} placeholder="Hyderabad" />
          <SelectRow label="State" value={form.state} options={INDIAN_STATES} onChange={(v) => set({ state: v })} clearable />
        </SettingsGroup>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Who can see it</BlockTitle>
          <SegmentedTabs tabs={VIS_TABS} value={form.visibility} onChange={(v) => set({ visibility: v })} />
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            {form.visibility === 'PUBLIC' ? 'Anyone can find and view this space.' : 'Only members can view it. Add people from Members.'}
          </Text>
        </View>
      </ScrollView>

      <SaveBar visible={dirty} label="Save changes" onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  images: { flexDirection: 'row', gap: spacing[4], alignItems: 'flex-end' },
  logo: { width: 96, height: 96, borderRadius: borderRadius.lg, overflow: 'hidden' },
  banner: { width: 128, height: 96, borderRadius: borderRadius.lg, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  captions: { flexDirection: 'row', gap: spacing[4], marginTop: spacing[2] },
  caption: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
