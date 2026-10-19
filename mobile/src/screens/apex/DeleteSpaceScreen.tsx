import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup } from '../../components/profile/SettingsGroup';
import { FieldRow } from '../../components/manage/FormFields';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { deleteSpace, getSpaceDetail, type AdminSpaceDetail } from '../../lib/api/apex';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

/** Permanently delete a space. Gated on typing its slug, as on Apex web. */
export default function DeleteSpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexDeleteSpace');

  const [space, setSpace] = useState<AdminSpaceDetail | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSpaceDetail(id!).then((r) => (r.ok ? setSpace(r.data) : setError(r.message)));
  }, [id]);

  if (!space) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.body, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topSpacing }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: tokens.danger }]}>Delete {space.name}?</Text>
        <Text style={[styles.body, { color: tokens.textSecondary }]}>
          This permanently deletes the space and everything under it: {space._count?.events ?? 0} events with their free registrations and tickets. It cannot
          be undone. A space with any payment, refund or payout can't be deleted: those records are kept.
        </Text>
        {children > 0 ? (
          <Text style={[styles.body, { color: tokens.warning }]}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  body: { marginTop: spacing[3], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
