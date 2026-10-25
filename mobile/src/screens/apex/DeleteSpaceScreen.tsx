import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SettingsGroup } from '../../components/profile/SettingsGroup';
import { FieldRow } from '../../components/manage/FormFields';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { GUTTER } from '../../components/home/Section';
import { deleteSpace, getSpaceDetail, type AdminSpaceDetail } from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

/** Permanently delete a space. Gated on typing its slug, as on Apex web. */
export default function DeleteSpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useCosmos();

  const [space, setSpace] = useState<AdminSpaceDetail | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    void getSpaceDetail(id!).then((r) => (r.ok ? setSpace(r.data) : setError(r.message)));
  }, [id]);

  useEffect(load, [load]);

  if (!space) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={load} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const children = space._count?.childSpaces ?? 0;
  const run = async () => {
    setBusy(true);
    const res = await deleteSpace(space.id);
    setBusy(false);
    if (!res.ok) return AppAlert.alert('Space not deleted', res.message);
    router.dismissTo('/apex/spaces');
  };

  return (
    <CosmosScreen keyboard contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: c.danger }]}>Delete {space.name}?</Text>
        <Text style={[styles.body, { color: c.soft }]}>
          This permanently deletes the space and everything under it: {space._count?.events ?? 0} events with their free registrations and tickets. It cannot
          be undone. A space with any payment, refund or payout can't be deleted: those records are kept.
        </Text>
        {children > 0 ? (
          <Text style={[styles.body, { color: c.warn }]}>
            It has {children} child {children === 1 ? 'space' : 'spaces'}. Detach them first from Hierarchy, or the delete will fail.
          </Text>
        ) : null}

        <SettingsGroup title={`Type ${space.slug} to confirm`} plain>
          <FieldRow label="Slug" value={confirm} onChangeText={setConfirm} placeholder={space.slug} autoCapitalize="none" autoCorrect={false} />
        </SettingsGroup>

        <Button
          label="Delete this space"
          variant="danger"
          size="lg"
          fullWidth
          disabled={confirm.trim() !== space.slug}
          loading={busy}
          onPress={run}
          style={{ marginTop: spacing[8] }}
        />
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  title: { fontSize: typography.fontSize['2xl'], ...cosmosFont.display },
  body: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
