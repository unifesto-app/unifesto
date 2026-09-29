import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Plus } from 'phosphor-react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import {
  addDefaultImage,
  deleteDefaultImage,
  getAllDefaultImages,
  loadDefaultImages,
  type DefaultImageRow,
} from '../../lib/defaultImages';
import { AppAlert } from '../../components/ui/AppAlert';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const GAP = spacing[3];

const KINDS = [
  { kind: 'BANNER' as const, title: 'Event banners', hint: '4:3. Shown on events without a cover.', aspect: [4, 3] as [number, number], cols: 2 },
  { kind: 'LOGO' as const, title: 'Space logos', hint: '1:1. Shown for spaces without a logo.', aspect: [1, 1] as [number, number], cols: 4 },
];

/**
 * Apex › Default images: the stand-in banners and logos the apps use instead
 * of a flat colour when an event or space has none. Each event/space always
 * gets the same one (picked by its id).
 */
export default function DefaultImagesScreen() {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<DefaultImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('ApexDefaultImages');

  const load = useCallback(async () => {
    const res = await getAllDefaultImages();
    if (res.ok) {
      setRows(res.data);
      setError('');
    } else setError(res.message);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const add = async (kind: 'BANNER' | 'LOGO', aspect: [number, number]) => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.85 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(kind);
    const res = await addDefaultImage(kind, picked.assets[0].uri);
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert('Upload failed', res.message);
      return;
    }
    await load();
    void loadDefaultImages(); // this device shows it straight away
  };

  const remove = (row: DefaultImageRow) =>
    AppAlert.alert('Remove this image?', 'Events or spaces using it get another default.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(row.id);
          const res = await deleteDefaultImage(row.id);
          setBusy(null);
          if (!res.ok) AppAlert.alert('Could not remove', res.message);
          await load();
          void loadDefaultImages();
        },
      },
    ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
        />
      }
    >
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      {KINDS.map(({ kind, title, hint, aspect, cols }) => {
        const tile = (width - GUTTER * 2 - GAP * (cols - 1)) / cols;
        const h = (tile * aspect[1]) / aspect[0];
        const list = rows.filter((r) => r.kind === kind);
        return (
          <View key={kind} style={{ marginBottom: spacing[8] }}>
            <Text style={[styles.title, { color: tokens.text }]}>{title}</Text>
            <Text style={[styles.hint, { color: tokens.textMuted }]}>
              {hint} {list.length === 0 ? 'None yet, so the app shows a colour.' : `${list.length} in rotation.`}
            </Text>
            <View style={styles.grid}>
              {list.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => remove(r)}
                  accessibilityLabel={`Remove ${kind.toLowerCase()}`}
                  style={{ width: tile, height: h, borderRadius: kind === 'LOGO' ? tile / 2 : borderRadius.lg, overflow: 'hidden', opacity: busy === r.id ? 0.4 : 1 }}
                >
                  <Image source={{ uri: r.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => void add(kind, aspect)}
                disabled={busy === kind}
                accessibilityLabel={`Add ${kind.toLowerCase()}`}
                style={[styles.add, { width: tile, height: h, borderRadius: kind === 'LOGO' ? tile / 2 : borderRadius.lg, backgroundColor: tokens.fill }]}
              >
                {busy === kind ? <ActivityIndicator color={tokens.accent} /> : <Plus size={24} color={tokens.accent} weight="bold" />}
              </Pressable>
            </View>
          </View>
        );
      })}
      <Text style={[styles.hint, { color: tokens.textMuted }]}>Tap an image to remove it.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: typography.fontSize.lg, ...font('heading') },
  hint: { marginTop: spacing[1], marginBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  add: { alignItems: 'center', justifyContent: 'center' },
  error: { marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...font('medium') },
});
