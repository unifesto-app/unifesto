import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Plus } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { CATEGORY_LABEL, listMyTickets, STATUS_LABEL, type SupportTicket } from '../lib/api/support';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import type { Tokens } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const statusColor = (s: SupportTicket['status'], t: Tokens) =>
  s === 'PENDING' ? t.warning : s === 'OPEN' ? t.accent : t.textMuted;

const ago = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Support tickets raised for this space, and a way to raise a new one. */
export default function SpaceSupportScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('SpaceSupport');

  const load = useCallback(async () => {
    setTickets(await listMyTickets(spaceId));
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!tickets) {
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
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      <Button
        label="New request"
        fullWidth
        icon={<Plus size={18} color={tokens.accentFg} weight="bold" />}
        onPress={() => router.push({ pathname: '/manage/support/new', params: { spaceId } })}
      />

      <SettingsGroup title="Requests">
        {tickets.length === 0 ? <SettingsRow label="Nothing raised yet" /> : null}
        {tickets.map((t) => (
          <View key={t.id}>
            <SettingsRow
              label={t.subject}
              trailing={<Text style={[styles.status, { color: statusColor(t.status, tokens) }]}>{STATUS_LABEL[t.status]}</Text>}
              onPress={() => router.push(`/manage/support/${t.id}`)}
            />
            <Text style={[styles.sub, { color: tokens.textMuted }]} onPress={() => router.push(`/manage/support/${t.id}`)}>
              #{t.ticketNumber} · {CATEGORY_LABEL[t.category]} · {ago(t.lastMessageAt)}
            </Text>
          </View>
        ))}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: typography.fontSize.xs, ...font('semibold') },
  sub: { marginTop: -spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[3], fontSize: typography.fontSize.xs, ...font() },
});
