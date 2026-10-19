import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Trash } from '@unifesto/unicon/react-native';
import { createTier, deleteTier, getTiers, HEX_RE, updateTier, type TierInput } from '../lib/api/spaceSponsors';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

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
      <CosmosScreen>
        <Stack.Screen options={{ title }} />
        <View style={styles.pad}>
          {error ? (
            <View style={[styles.card, { backgroundColor: c.raised }]}>
              <Text style={[styles.body, { color: c.soft }]}>{error}</Text>
            </View>
          ) : (
            <Skeleton width="100%" height={120} borderRadius={cosmosCardRadius} />
          )}
        </View>
      </CosmosScreen>
    );
  }

  const picked = draft.color.toLowerCase();

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      footer={
        <SaveBar visible={dirty} label={isNew ? 'Create tier' : 'Save changes'} onPress={() => void save()} loading={saving} disabled={deleting} error={error} />
      }
    >
      <Stack.Screen options={{ title }} />

      <SettingsGroup plain style={styles.group}>
        <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Gold" />
        <FieldRow label="Rank (0 is the top)" value={draft.rank} onChangeText={(v) => set({ rank: v.replace(/\D/g, '') })} keyboardType="number-pad" />
      </SettingsGroup>

      <Section title="Colour" subtitle="Picking a preset on a new tier also fills in its name">
        <View style={[styles.card, { backgroundColor: c.raised }]}>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            <Swatch label="None" on={!picked} fill={c.tint} onPress={() => set({ color: '' })} />
            {PRESETS.map((p) => (
              <Swatch
                key={p.hex}
                label={p.name}
                fill={p.hex}
                on={picked === p.hex.toLowerCase()}
                onPress={() => set({ color: p.hex, name: draft.name || p.name })}
              />
            ))}
          </View>
        </View>
        <SettingsGroup plain style={[styles.group, { marginTop: spacing[3] }]}>
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
      </Section>

      {!isNew ? (
        <View style={styles.pad}>
          <AuthButton
            label="Delete tier"
            variant="danger"
            loading={deleting}
            disabled={saving}
            icon={<Trash size={18} color={c.danger} />}
            onPress={remove}
            style={{ marginTop: spacing[12] }}
          />
        </View>
      ) : null}
    </CosmosScreen>
  );
}

/** One colour choice: a round dot (ring + check when picked) over its name. */
function Swatch({ label, fill, on, onPress }: { label: string; fill: string; on: boolean; onPress: () => void }) {
  const c = useCosmos();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.swatchCell, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.ring, { borderColor: on ? c.text : 'transparent' }]}>
        <View style={[styles.swatch, { backgroundColor: fill }]}>
          {on ? <Check size={16} color={fill === c.tint ? c.text : '#111111'} weight="bold" /> : null}
        </View>
      </View>
      <Text style={[styles.swatchName, { color: on ? c.text : c.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius, padding: spacing[4] },
  body: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[3] },
  swatchCell: { alignItems: 'center', gap: spacing[1], width: '25%' },
  ring: { padding: 3, borderRadius: SWATCH, borderWidth: 2 },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, alignItems: 'center', justifyContent: 'center' },
  swatchName: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
