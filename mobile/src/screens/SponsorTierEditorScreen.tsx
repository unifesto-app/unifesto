import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Trash } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { createTier, deleteTier, getTiers, HEX_RE, updateTier, type TierInput } from '../lib/api/spaceSponsors';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const SWATCH = 40;

/** The usual sponsorship metals, so most tiers are one tap. */
const PRESETS: { name: string; hex: string }[] = [
  { name: 'Title', hex: '#7C3AED' },
  { name: 'Diamond', hex: '#B9F2FF' },
  { name: 'Platinum', hex: '#E5E4E2' },
  { name: 'Gold', hex: '#D4AF37' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Bronze', hex: '#CD7F32' },
];

interface Draft {
  name: string;
  rank: string;
  color: string;
}

/** Create or edit one sponsor tier: name, rank (0 = top) and an optional colour. */
export default function SponsorTierEditorScreen() {
  const { spaceId, tierId } = useLocalSearchParams<{ spaceId: string; tierId: string }>();
  const isNew = !tierId || tierId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('SponsorTierEditor');

  useEffect(() => {
    if (!spaceId) return;
    void getTiers(spaceId).then((res) => {
      const tiers = res.ok ? res.data : [];
      if (isNew) {
        // Next free rank, so a new tier lands at the bottom of the ladder.
        const d = { name: '', rank: String(tiers.length ? Math.max(...tiers.map((t) => t.rank)) + 1 : 0), color: '' };
        initial.current = JSON.stringify(d);
        setDraft(d);
        return;
      }
      const t = tiers.find((x) => x.id === tierId);
      if (!t) {
        setError('This tier no longer exists.');
        return;
      }
      const d = { name: t.name, rank: String(t.rank), color: t.color ?? '' };
      initial.current = JSON.stringify(d);
      setDraft(d);
    });
  }, [spaceId, tierId, isNew]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const dirty = isNew || (draft !== null && JSON.stringify(draft) !== initial.current);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const rank = Number(draft.rank);
    const color = draft.color.trim();
    if (!name) return setError('Give the tier a name.');
    if (!Number.isInteger(rank) || rank < 0) return setError('Rank is a whole number, 0 or more.');
    if (color && !HEX_RE.test(color)) return setError('Colour is a hex code like #D4AF37.');
    const body: TierInput = { name, rank, color: color || (isNew ? undefined : null) };
    setSaving(true);
    const res = isNew ? await createTier(spaceId!, body) : await updateTier(spaceId!, tierId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${draft?.name}?`, 'Sponsors in this tier stay on their events, just without a tier.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteTier(spaceId!, tierId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

  const title = isNew ? 'New tier' : 'Tier';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const picked = draft.color.toLowerCase();

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup plain>
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Gold" />
          <FieldRow label="Rank (0 is the top)" value={draft.rank} onChangeText={(v) => set({ rank: v.replace(/\D/g, '') })} keyboardType="number-pad" />
        </SettingsGroup>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Colour</BlockTitle>
          <View style={styles.swatches}>
            <Pressable
              onPress={() => set({ color: '' })}
              accessibilityRole="radio"
              accessibilityState={{ selected: !picked }}
              accessibilityLabel="No colour"
              style={styles.swatchCell}
            >
              <View style={[styles.swatch, { backgroundColor: tokens.elevated }]}>
                {!picked ? <Check size={18} color={tokens.text} weight="bold" /> : null}
              </View>
              <Text style={[styles.swatchName, { color: tokens.textMuted }]}>None</Text>
            </Pressable>
            {PRESETS.map((p) => {
              const on = picked === p.hex.toLowerCase();
              return (
                <Pressable
                  key={p.hex}
                  onPress={() => set({ color: p.hex, name: draft.name || p.name })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={p.name}
                  style={styles.swatchCell}
                >
                  <View style={[styles.swatch, { backgroundColor: p.hex }]}>
                    {on ? <Check size={18} color="#111111" weight="bold" /> : null}
                  </View>
                  <Text style={[styles.swatchName, { color: tokens.textMuted }]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <SettingsGroup plain>
            <FieldRow
              label="Hex"
              value={draft.color}
              onChangeText={(v) => set({ color: v.trim() })}
              placeholder="#D4AF37"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
            />
          </SettingsGroup>
          <Text style={[styles.note, { color: tokens.textMuted }]}>Picking a preset on a new tier also fills in its name.</Text>
        </View>

        {!isNew ? (
          <Button
            label="Delete tier"
            variant="danger"
            size="lg"
            fullWidth
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={tokens.danger} weight="bold" />}
            onPress={remove}
            style={{ marginTop: spacing[10] }}
          />
        ) : null}
      </ScrollView>

      <SaveBar visible={dirty} label={isNew ? 'Create tier' : 'Save changes'} onPress={() => void save()} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginBottom: spacing[4] },
  swatchCell: { alignItems: 'center', gap: spacing[1], width: SWATCH + 12 },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  swatchName: { fontSize: typography.fontSize.xs, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
