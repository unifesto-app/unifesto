import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { detachOccurrence, getOccurrences, type Occurrence } from '../lib/api/hierarchy';
import { describeRecurrence, parseRRuleToState } from '../lib/recurrence';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * The dates of a recurring series. Each is its own event with its own
 * registrations. Detach one to edit it without the series overwriting it.
 * The repeat rule itself is edited under Details.
 */
export default function SeriesDatesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<{ rule: string | null; until: string | null; list: Occurrence[] } | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getOccurrences(eventId);
    if (res.ok) {
      setData({ rule: res.data.recurrenceRule, until: res.data.generatedUntil, list: res.data.occurrences });
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const detach = (o: Occurrence) =>
    AppAlert.alert('Detach this date?', "Changes to the series won't reach it any more, so you can edit it on its own. This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Detach',
        onPress: async () => {
          setBusy(o.id);
          const res = await detachOccurrence(o.id);
          setBusy(null);
          if (!res.ok) return AppAlert.alert("Couldn't detach", res.message);
          await load();
        },
      },
    ]);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const now = Date.now();

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
      <Text style={[styles.rule, { color: tokens.text }]}>{describeRecurrence(parseRRuleToState(data.rule))}</Text>
      {data.until ? (
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Dates created up to {new Date(data.until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
        </Text>
      ) : null}

      <SettingsGroup title={`Dates · ${data.list.length}`}>
        {data.list.length === 0 ? <SettingsRow label="No dates yet" /> : null}
        {data.list.map((o) => {
          const past = new Date(o.startDateTime).getTime() < now;
          return (
            <SettingsRow
              key={o.id}
              label={when(o.startDateTime)}
              value={o.seriesDetached ? 'Detached' : `${o.registeredCount} going`}
              trailing={
                busy === o.id ? (
                  <ActivityIndicator size="small" color={tokens.accent} />
                ) : !o.seriesDetached && !past ? (
                  <Pressable onPress={() => detach(o)} hitSlop={8}>
                    <Text style={[styles.link, { color: tokens.accent }]}>Detach</Text>
                  </Pressable>
                ) : undefined
              }
              onPress={() => router.push(`/manage/event/${o.id}`)}
            />
          );
        })}
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  rule: { marginLeft: spacing[1], fontSize: typography.fontSize.lg, ...font('heading') },
  note: { marginTop: spacing[1], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
