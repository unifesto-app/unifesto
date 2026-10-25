import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { Button } from '../components/ui';
import { GUTTER } from '../components/home/Section';
import { getMyHackathon, renameMyTeam, type HackathonHub } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/**
 * Who's on the team, and (for the lead) the team name. Members who haven't
 * claimed their seat show as "Not joined yet" so the lead knows who to chase.
 */
export default function HackathonMyTeamScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [hub, setHub] = useState<HackathonHub | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getMyHackathon(eventId);
    if (!res.ok) return setError(res.message);
    setHub(res.data);
    setName(res.data?.team?.name ?? '');
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const team = hub?.team;
  if (!team) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {hub === undefined && !error ? (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        ) : (
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.emptyText, { color: c.soft }]}>{error || 'You’re not on a team for this hackathon.'}</Text>
            {error ? <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} /> : null}
          </View>
        )}
      </CosmosScreen>
    );
  }

  const canRename = team.isLead && team.stage !== 'CANCELLED';
  const dirty = canRename && name.trim() !== team.name;

  const save = async () => {
    if (!name.trim()) return setError('Give the team a name.');
    setSaving(true);
    const res = await renameMyTeam(eventId!, name.trim());
    setSaving(false);
    if (!res.ok) return setError(res.message);
    setError('');
    setHub((h) => (h?.team ? { ...h, team: { ...h.team, name: res.data.name, nameSource: 'LEAD' } } : h));
    setName(res.data.name);
  };

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible={dirty} label="Save name" onPress={save} loading={saving} error={error} />}
    >
      {canRename ? (
        <>
          <SettingsGroup title="Team name" plain>
            <FieldRow
              stacked
              label="Name"
              value={name}
              onChangeText={(v) => {
                setError('');
                setName(v);
              }}
              maxLength={80}
            />
          </SettingsGroup>
          <Text style={[styles.note, { color: c.muted }]}>
            You’re the team lead, so you can name the team. Organisers may still adjust it.
          </Text>
        </>
      ) : (
        <SettingsGroup title="Team" plain>
          <SettingsRow label={team.name} value={team.teamCode ?? undefined} />
        </SettingsGroup>
      )}

      <SettingsGroup title="Members" plain>
        {team.members.map((m) => (
          <SettingsRow
            key={m.seat}
            label={`${m.name || `Seat ${m.seat}`}${m.isMe ? ' (you)' : ''}`}
            value={[m.isLead ? 'Lead' : '', m.joined ? '' : 'Not joined yet'].filter(Boolean).join(' · ') || undefined}
          />
        ))}
      </SettingsGroup>
      <Text style={[styles.note, { color: c.muted }]}>
        {team.isLead
          ? 'Members join by claiming their seat from your invite. Manage invites from your ticket.'
          : 'Everyone who claims their seat sees this hackathon in the app.'}
      </Text>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
