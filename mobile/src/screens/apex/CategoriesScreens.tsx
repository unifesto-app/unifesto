import React, { useCallback, useEffect, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { pickImageAtAspect } from '../../utils/pickImage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Camera, Plus, Tag, TextAa, TextAlignLeft } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import {
  createCategory,
  deactivateCategory,
  getAdminCategories,
  updateCategory,
  uploadCategoryBanner,
  type AdminCategory,
} from '../../lib/api/apex';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/*
 * Apex Categories parity: list + reorder, and a create/edit screen with the
 * 4:3 banner. Delete is the backend's soft deactivate (hidden from creation).
 */

const GUTTER = spacing[6];
// Fits SettingsRow's 30pt icon column so dividers stay aligned.
const THUMB_W = 30;

// ── List ─────────────────────────────────────────────────────────────────────

export function CategoriesListScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexCategories');

  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState('');
  const [reordering, setReordering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await getAdminCategories();
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError('');
    setItems([...res.data].sort((a, b) => a.order - b.order));
  }, []);

  // Back from the editor → fresh list.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Swap `order` with the neighbour, optimistic, then persist both (web's approach).
  const move = async (index: number, dir: -1 | 1) => {
    if (!items || busy) return;
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setBusy(true);
    const [r1, r2] = await Promise.all([updateCategory(a.id, { order: b.order }), updateCategory(b.id, { order: a.order })]);
    setBusy(false);
    if (!r1.ok || !r2.ok) AppAlert.alert('Not reordered', (!r1.ok && r1.message) || (!r2.ok && r2.message) || 'Try again');
    void load();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!items) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const thumb = (c: AdminCategory) =>
    c.bannerUrl ? (
      <Image source={{ uri: c.bannerUrl }} style={styles.thumb} contentFit="cover" />
    ) : (
      <Tag size={24} color={tokens.accent} weight="fill" />
    );

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />}
    >
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

      <SettingsGroup>
        <SettingsRow
          icon={<Plus size={24} color={tokens.accent} weight="bold" />}
          label="New category"
          onPress={() => router.push('/apex/categories/new')}
        />
      </SettingsGroup>

      {items.length === 0 ? (
        <Text style={[styles.muted, { color: tokens.textMuted, marginTop: spacing[6] }]}>No categories yet.</Text>
      ) : (
        <SettingsGroup
          title={`${items.length} categor${items.length === 1 ? 'y' : 'ies'}`}
          action={{ label: reordering ? 'Done' : 'Reorder', onPress: () => setReordering((r) => !r) }}
        >
          {items.map((c, i) => (
            <SettingsRow
              key={c.id}
              icon={thumb(c)}
              label={c.name}
              value={reordering ? undefined : `${c.event_count.toLocaleString('en-IN')} upcoming`}
              onPress={reordering ? undefined : () => router.push(`/apex/categories/${c.id}`)}
              trailing={
                reordering ? (
                  <View style={styles.moves}>
                    <Pressable onPress={() => move(i, -1)} disabled={busy || i === 0} hitSlop={8} accessibilityLabel={`Move ${c.name} up`}>
                      <ArrowUp size={20} color={i === 0 ? tokens.textMuted : tokens.accent} weight="bold" />
                    </Pressable>
                    <Pressable
                      onPress={() => move(i, 1)}
                      disabled={busy || i === items.length - 1}
                      hitSlop={8}
                      accessibilityLabel={`Move ${c.name} down`}
                    >
                      <ArrowDown size={20} color={i === items.length - 1 ? tokens.textMuted : tokens.accent} weight="bold" />
                    </Pressable>
                  </View>
                ) : undefined
              }
            />
          ))}
        </SettingsGroup>
      )}
    </ScrollView>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────

export function CategoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking(isNew ? 'ApexCategoryNew' : 'ApexCategoryEdit');

  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // No GET /categories/:id — find it in the list.
  useEffect(() => {
    if (isNew) return;
    void (async () => {
      const res = await getAdminCategories();
      const cat = res.ok ? res.data.find((c) => c.id === id) : undefined;
      if (!cat) {
        setLoadError(res.ok ? 'Category not found (it may be deactivated).' : res.message);
        return;
      }
      setName(cat.name);
      setDescription(cat.description ?? '');
      setBannerUrl(cat.bannerUrl ?? '');
      setLoaded(true);
    })();
  }, [id, isNew]);

  const pickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      AppAlert.alert('Permission required', 'Allow photo library access to add a banner.');
      return;
    }
    const uri = await pickImageAtAspect([4, 3]).catch((e: Error) => {
      AppAlert.alert("Couldn't use that photo", e.message);
      return null;
    });
    if (!uri) return;
    setUploading(true);
    const res = await uploadCategoryBanner(uri);
    setUploading(false);
    if (res.ok) setBannerUrl(res.data.url);
    else AppAlert.alert('Banner not uploaded', res.message);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const body = { name: trimmed, description: description.trim() || undefined, bannerUrl: bannerUrl.trim() || undefined };
    const res = isNew ? await createCategory(body) : await updateCategory(id!, body);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  const deactivate = () =>
    AppAlert.alert('Deactivate category?', `“${name}” will be hidden from event creation.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          const res = await deactivateCategory(id!);
          if (res.ok) router.back();
          else AppAlert.alert('Not deactivated', res.message);
        },
      },
    ]);

  if (!loaded) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {loadError ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{loadError}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Pressable onPress={pickBanner} disabled={uploading} accessibilityRole="button" accessibilityLabel="Change banner">
          <View style={[styles.banner, { backgroundColor: tokens.elevated }]}>
            {bannerUrl ? <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {uploading ? (
              <View style={[StyleSheet.absoluteFill, styles.bannerBusy]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : !bannerUrl ? (
              <View style={styles.bannerEmpty}>
                <Camera size={28} color={tokens.accent} weight="fill" />
                <Text style={[styles.bannerText, { color: tokens.textMuted }]}>Add a 4:3 banner</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        {bannerUrl ? (
          <Pressable onPress={pickBanner} disabled={uploading} hitSlop={8} style={styles.changeBanner}>
            <Text style={[styles.changeBannerText, { color: tokens.accent }]}>Change banner</Text>
          </Pressable>
        ) : null}

        <SettingsGroup title="Details">
          <FormRow
            icon={<TextAa size={24} color={tokens.text} weight="bold" />}
            value={name}
            onChangeText={(v) => {
              setError('');
              setName(v);
            }}
            placeholder="Name, e.g. Workshops"
            autoFocus={isNew}
          />
          <FormRow
            icon={<TextAlignLeft size={24} color={tokens.text} weight="bold" />}
            value={description}
            onChangeText={setDescription}
            placeholder="Short description (optional)"
            multiline
          />
        </SettingsGroup>

        {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

        <Button label={isNew ? 'Create category' : 'Save changes'} onPress={save} loading={saving} disabled={uploading} size="lg" fullWidth />

        {!isNew ? (
          <View style={{ marginTop: spacing[6] }}>
            <SettingsGroup>
              <SettingsRow label="Deactivate category" danger onPress={deactivate} />
            </SettingsGroup>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  error: { marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  thumb: { width: THUMB_W, height: (THUMB_W * 3) / 4, borderRadius: 4 },
  moves: { flexDirection: 'row', gap: spacing[4] },
  banner: { width: '100%', aspectRatio: 4 / 3, borderRadius: borderRadius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bannerBusy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  bannerEmpty: { alignItems: 'center', gap: spacing[2] },
  bannerText: { fontSize: typography.fontSize.sm, ...font('medium') },
  changeBanner: { alignSelf: 'center', marginTop: spacing[3] },
  changeBannerText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
