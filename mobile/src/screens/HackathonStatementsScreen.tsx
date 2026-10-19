import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GearSix, Plus } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { Button } from '../components/ui';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { HeaderActions, HeaderIconButton } from '../navigation/HeaderActions';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getStatements, type StatementList } from '../lib/api/hackathon';
import { psModeSummary } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * The organisers' list of problem statements, with how many teams took each
 * and how statements are handed out right now (settings). Teams that wrote
 * their own are counted separately.
 */
export default function HackathonStatementsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<StatementList | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('HackathonStatements');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getStatements(eventId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else {
      setError(res.message);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = (statementId: string) =>
    router.push({ pathname: `/manage/event/${eventId}/hackathon/statement`, params: { statementId } } as never);

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const needsList = data.mode === 'TEAM_PICKS' || data.mode === 'CURATOR_ASSIGNS';

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => open('new')} label="Add problem statement">
                <Plus size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
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
        <SettingsGroup>
          <SettingsRow
            icon={<GearSix size={26} color={tokens.text} />}
            label="How teams get one"
            value={psModeSummary(data.mode, data.deadline)}
            onPress={() => router.push(`/manage/event/${eventId}/hackathon/settings`)}
          />
        </SettingsGroup>
        {data.mode === 'TEAM_WRITES' ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Teams write their own, so this list is optional. {data.ownStatements} team{data.ownStatements === 1 ? ' has' : 's have'} written one.
          </Text>
        ) : data.ownStatements ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            {data.ownStatements} team{data.ownStatements === 1 ? ' has its' : 's have their'} own statement.
          </Text>
        ) : null}

        {data.statements.length === 0 ? (
          <View style={{ marginTop: spacing[10], alignItems: 'center' }}>
            <Text style={[styles.empty, { color: tokens.text }]}>No problem statements yet</Text>
            <Text style={[styles.note, { color: tokens.textMuted, textAlign: 'center' }]}>
              {needsList
                ? 'Add the problems teams can work on. Each gets a code like PS-01, and you can limit how many teams take it.'
                : 'Add problems to the list if you want to assign some teams one.'}
            </Text>
            <Button label="Add a problem statement" onPress={() => open('new')} style={{ marginTop: spacing[5] }} />
          </View>
        ) : (
          <SettingsGroup title={`${data.statements.length} on the list`} plain>
            {data.statements.map((s) => (
              <SettingsRow
                key={s.id}
                label={`${s.code}  ${s.title}`}
                value={
                  [s.theme?.name, s.maxTeams != null ? `${s.taken}/${s.maxTeams}` : s.taken ? `${s.taken} team${s.taken === 1 ? '' : 's'}` : null]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                onPress={() => open(s.id)}
              />
            ))}
          </SettingsGroup>
        )}
        {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  empty: { fontSize: typography.fontSize.lg, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
