import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { pickImageAtAspect } from '../utils/pickImage';
import { Buildings, ImageSquare } from '@unifesto/unicon/react-native';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import {
  getSpaceProfile,
  updateSpaceProfile,
  uploadSpaceBanner,
  uploadSpaceLogo,
  type SpaceProfile,
  type SpaceProfilePatch,
} from '../lib/api/spaceSettings';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SelectRow from '../components/manage/SelectRow';
import { INDIAN_STATES } from '../lib/indianStates';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const sanitizeSlug = (raw: string) =>
  raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+/, '');

const IMG_H = 96;
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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const { refresh: refreshAccess } = useSpaceAccess();

  const [profile, setProfile] = useState<SpaceProfile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const initial = useRef('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);

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
      <CosmosScreen>
        <View style={styles.pad}>
          {loadError ? (
            <View style={[styles.card, { alignItems: 'center' }]}>
              <CardBackdrop shape={styles.card} />
              <Text style={[styles.muted, { color: c.soft }]}>{loadError}</Text>
              <AuthButton label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
            </View>
          ) : (
            <>
              <Skeleton width="100%" height={170} borderRadius={cosmosCardRadius} />
              <Skeleton width="100%" height={260} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
            </>
          )}
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      footer={<SaveBar visible={dirty} label="Save changes" onPress={save} loading={saving} error={error} />}
    >
      {/* Logo 1:1 + compact 4:3 banner, each uploads on pick */}
      <View style={styles.pad}>
        <View style={[styles.card, styles.images]}>
          <CardBackdrop shape={styles.card} />
          <ImageSlot
            label="Logo"
            url={profile.logoUrl}
            width={IMG_H}
            busy={uploading === 'logo'}
            empty={<Buildings size={28} color={c.muted} />}
            onPress={() => pick('logo')}
          />
          <ImageSlot
            label="Banner"
            url={profile.bannerUrl}
            width={(IMG_H * 4) / 3}
            busy={uploading === 'banner'}
            empty={<ImageSquare size={28} color={c.muted} />}
            onPress={() => pick('banner')}
          />
        </View>
      </View>

      <Section title="Profile" style={styles.firstSection}>
        <SettingsGroup plain style={styles.group}>
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
      </Section>

      <Section title="Location and web">
        <SettingsGroup plain style={styles.group}>
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
      </Section>

      <Section title="Who can see it">
        <View style={styles.pad}>
          <SegmentedTabs tabs={VIS_TABS} value={form.visibility} onChange={(v) => set({ visibility: v })} glass={false} />
          <Text style={[styles.note, { color: c.muted }]}>
            {form.visibility === 'PUBLIC' ? 'Anyone can find and view this space.' : 'Only members can view it. Add people from Members.'}
          </Text>
        </View>
      </Section>
    </CosmosScreen>
  );
}

/** One upload slot: the image at its true ratio, its name and a change link under it. */
function ImageSlot({
  label,
  url,
  width,
  busy,
  empty,
  onPress,
}: {
  label: string;
  url: string | null | undefined;
  width: number;
  busy: boolean;
  empty: React.ReactNode;
  onPress: () => void;
}) {
  const c = useCosmos();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={url ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      style={({ pressed }) => ({ width, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View style={[styles.slot, { width, backgroundColor: c.tint }]}>
        {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : empty}
        {busy ? <ActivityIndicator style={StyleSheet.absoluteFill} color={c.text} /> : null}
      </View>
      <Text style={[styles.slotLabel, { color: c.text }]}>{label}</Text>
      <Text style={[styles.slotAction, { color: c.muted }]}>{url ? 'Tap to change' : 'Tap to add'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  images: { flexDirection: 'row', gap: spacing[5], alignItems: 'flex-start' },
  slot: { height: IMG_H, borderRadius: borderRadius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  slotLabel: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  slotAction: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  firstSection: { marginTop: spacing[10] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
