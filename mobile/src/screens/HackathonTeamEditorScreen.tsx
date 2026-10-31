import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IdentificationCard, Lightbulb, LockSimple, WarningCircle } from '@unifesto/unicon/react-native';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import SelectRow from '../components/manage/SelectRow';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Badge } from '../components/ui/Badge';
import CosmosScreen from '../components/ui/CosmosScreen';
import { CardBackdrop } from '../components/ui/CardSurface';
import { GUTTER } from '../components/home/Section';
import { getRooms, getTeam, updateTeam, type Room, type TeamDetail } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const NAME_SOURCE: Record<string, string> = {
  FORM: 'From their registration',
  LEAD: 'Set by the team lead',
  CURATOR: 'Set by an organiser',
  DEFAULT: 'Default name',
};

interface Draft {
  teamCode: string;
  name: string;
  roomName: string;
}

/**
 * One team: correct its Team ID or name, move it to another room, and see who
 * is on it. Members appear once they claim their seat in the app.
 */
export default function HackathonTeamEditorScreen() {
  const { eventId, teamId } = useLocalSearchParams<{ eventId: string; teamId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apply = useCallback((t: TeamDetail) => {
    const d = { teamCode: t.teamCode ?? '', name: t.name, roomName: t.room?.name ?? '' };
    initial.current = JSON.stringify(d);
    setTeam(t);
    setDraft(d);
  }, []);

  useEffect(() => {
    if (!eventId || !teamId) return;
    void Promise.all([getTeam(eventId, teamId), getRooms(eventId)]).then(([t, r]) => {
      if (!t.ok) return setError(t.message);
      if (r.ok) setRooms(r.data.rooms);
      apply(t.data);
    });
  }, [eventId, teamId, apply]);

  // Coming back from the statement screen: refresh what's shown, keep any unsaved edits.
  const loaded = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!loaded.current) {
        loaded.current = true;
        return;
      }
      if (!eventId || !teamId) return;
      void getTeam(eventId, teamId).then((t) => {
        if (t.ok) setTeam(t.data);
      });
    }, [eventId, teamId]),
  );

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  if (!team || !draft) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const cancelled = team.stage === 'CANCELLED';
  const dirty = JSON.stringify(draft) !== initial.current;

  const save = async () => {
    const before = JSON.parse(initial.current) as Draft;
    const input: { teamCode?: string; name?: string; roomId?: string | null } = {};
    if (draft.teamCode.trim() !== before.teamCode) {
      if (!draft.teamCode.trim()) return setError('A team needs a Team ID.');
      input.teamCode = draft.teamCode.trim();
    }
    if (draft.name.trim() !== before.name) {
      if (!draft.name.trim()) return setError('Give the team a name.');
      input.name = draft.name.trim();
    }
    if (draft.roomName !== before.roomName) {
      input.roomId = draft.roomName ? rooms.find((r) => r.name === draft.roomName)?.id ?? null : null;
    }
    setSaving(true);
    const res = await updateTeam(eventId!, teamId!, input);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    apply(res.data);
    if (input.roomId !== undefined) {
      const r = await getRooms(eventId!);
      if (r.ok) setRooms(r.data.rooms);
    }
  };

  const room = rooms.find((r) => r.name === draft.roomName);
  const joined = team.members.filter((m) => m.joined).length;

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible={dirty} label="Save team" onPress={save} loading={saving} error={error} />}
    >
      {cancelled ? (
        <View style={styles.banner}>
          <Badge label="Cancelled" tone="danger" />
          <Text style={[styles.note, { color: c.soft, marginTop: spacing[2] }]}>
            This team’s registration was cancelled. It keeps {team.teamCode ?? 'its Team ID'} and the ID is never given to
            another team. If the registration is restored, the team comes back as it was.
          </Text>
        </View>
      ) : null}

      <SettingsGroup plain>
        <FieldRow label="Team ID" value={draft.teamCode} onChangeText={(v) => set({ teamCode: v })} autoCapitalize="characters" autoCorrect={false} />
        <FieldRow stacked label="Team name" value={draft.name} onChangeText={(v) => set({ name: v })} />
      </SettingsGroup>
      <Text style={[styles.note, { color: c.muted }]}>
        {team.nameSource ? `${NAME_SOURCE[team.nameSource]}. ` : ''}Changing the name here overrides it.
      </Text>

      {!cancelled ? (
        <>
          <SettingsGroup plain>
            <SelectRow
              label="Room"
              value={draft.roomName}
              options={rooms.map((r) => r.name)}
              onChange={(v) => set({ roomName: v })}
              placeholder={rooms.length ? 'No room' : 'Add rooms first'}
              clearable
            />
          </SettingsGroup>
          <Text style={[styles.note, { color: c.muted }]}>
            {room
              ? `${room.occupied} of ${room.capacity} teams in ${room.name}${room.location ? ` · ${room.location}` : ''}. The team is notified when you save.`
              : 'The team is notified when you put it in a room.'}
          </Text>
        </>
      ) : null}

      {!cancelled || team.statement ? (
        <>
          <SettingsGroup title="Problem statement">
            <SettingsRow
              icon={
                team.statement ? (
                  <LockSimple size={26} color={c.success} weight="fill" />
                ) : (
                  <Lightbulb size={26} color={c.text} />
                )
              }
              label={team.statement ? [team.statement.code, team.statement.title].filter(Boolean).join(' · ') : 'Not chosen yet'}
              value={team.statement?.themeLabel ?? (cancelled ? undefined : 'Assign')}
              onPress={() =>
                router.push({ pathname: `/manage/event/${eventId}/hackathon/team-statement`, params: { teamId } } as never)
              }
            />
          </SettingsGroup>
          {team.statement?.changedAfterEvalAt ? (
            <View style={styles.flag}>
              <WarningCircle size={16} color={c.warn} weight="fill" />
              <Text style={[styles.flagText, { color: c.warn }]}>Changed after evaluation. Earlier marks were kept.</Text>
            </View>
          ) : (
            <Text style={[styles.note, { color: c.muted }]}>
              {team.statement
                ? team.statement.setBy?.kind === 'ORGANISER'
                  ? 'Assigned by organisers. Locked for the team.'
                  : `Locked in by ${team.statement.setBy?.name ?? 'the team'}. Only organisers can change it.`
                : 'The team can’t be judged until it has one.'}
            </Text>
          )}
        </>
      ) : null}

      <SettingsGroup title={`Members · ${joined} of ${team.members.length} joined`} plain>
        {team.members.map((m) => (
          <SettingsRow
            key={m.seat}
            label={m.name || `Seat ${m.seat}`}
            value={[m.isLead ? 'Lead' : '', m.joined ? '' : 'Not joined yet'].filter(Boolean).join(' · ') || undefined}
          />
        ))}
      </SettingsGroup>
      <Text style={[styles.note, { color: c.muted }]}>
        Members see the hackathon once they claim their seat in the app. The lead can invite people from their ticket.
      </Text>

      {team.registrationId ? (
        <SettingsGroup>
          <SettingsRow
            icon={<IdentificationCard size={26} color={c.text} />}
            label="Open the registration"
            onPress={() => router.push(`/manage/event/${eventId}/attendee/${team.registrationId}`)}
          />
        </SettingsGroup>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  banner: { marginBottom: spacing[2] },
  flag: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2], marginHorizontal: spacing[1] },
  flagText: { flexShrink: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
