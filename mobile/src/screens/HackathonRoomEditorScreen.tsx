import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash } from 'phosphor-react-native';
import { FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import MultiChips from '../components/hackathon/MultiChips';
import { createRoom, deleteRoom, getRooms, staffName, updateRoom, type Room, type StaffUser } from '../lib/api/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

interface Draft {
  name: string;
  location: string;
  capacity: string;
  notes: string;
  volunteerUserIds: string[];
}

const EMPTY: Draft = { name: '', location: '', capacity: '', notes: '', volunteerUserIds: [] };

/** Add or edit a room: its name, where it is, how many teams fit, notes for teams, and its volunteers. */
export default function HackathonRoomEditorScreen() {
  const { eventId, roomId } = useLocalSearchParams<{ eventId: string; roomId: string }>();
  const isNew = !roomId || roomId === 'new';
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [room, setRoom] = useState<Room | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const initial = useRef(JSON.stringify(EMPTY));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonRoomEditor');

  useEffect(() => {
    if (!eventId) return;
    void getRooms(eventId).then((r) => {
      if (r.ok) setStaff(r.data.staff);
      if (isNew) return;
      const found = r.ok ? r.data.rooms.find((x) => x.id === roomId) : undefined;
      if (!found) return setError('This room no longer exists.');
      const d = {
        name: found.name,
        location: found.location ?? '',
        capacity: String(found.capacity),
        notes: found.notes ?? '',
        volunteerUserIds: found.volunteers.map((v) => v.id),
      };
      initial.current = JSON.stringify(d);
      setRoom(found);
      setDraft(d);
    });
  }, [isNew, eventId, roomId]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const title = isNew ? 'New room' : 'Edit room';

  if (!draft) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title }} />
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const dirty = isNew || JSON.stringify(draft) !== initial.current;

  const save = async () => {
    const capacity = Number(draft.capacity);
    if (!draft.name.trim()) return setError('Name the room, like "Lab 2".');
    if (!Number.isInteger(capacity) || capacity < 1) return setError('How many teams fit? At least 1.');
    const body = {
      name: draft.name.trim(),
      location: draft.location.trim() || null,
      capacity,
      notes: draft.notes.trim() || null,
      volunteerUserIds: draft.volunteerUserIds,
    };
    setSaving(true);
    const res = isNew ? await createRoom(eventId!, body) : await updateRoom(eventId!, roomId!, body);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const remove = () =>
    AppAlert.alert(`Delete ${room?.name}?`, 'Only an empty room can be deleted. Move its teams to another room first.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const res = await deleteRoom(eventId!, roomId!);
          setDeleting(false);
          if (!res.ok) return AppAlert.alert("Couldn't delete", res.message);
          router.back();
        },
      },
    ]);

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
          <FieldRow stacked label="Name" value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Lab 2" />
          <FieldRow stacked label="Where it is (optional)" value={draft.location} onChangeText={(v) => set({ location: v })} placeholder="Block C, 2nd floor" />
          <FieldRow label="Teams it fits" value={draft.capacity} onChangeText={(v) => set({ capacity: v })} keyboardType="number-pad" placeholder="10" />
          <FieldRow stacked multiline label="Notes for teams (optional)" value={draft.notes} onChangeText={(v) => set({ notes: v })} placeholder="Wi-Fi: HackNet · Power strips at every table" />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>Teams see the name, location and notes on their hackathon screen.</Text>

        <SettingsGroup title="Volunteers here" plain>
          {staff.length ? (
            <View style={styles.chips}>
              <MultiChips
                options={staff.map((u) => ({ value: u.id, label: staffName(u) }))}
                value={draft.volunteerUserIds}
                onChange={(v) => set({ volunteerUserIds: v })}
              />
            </View>
          ) : (
            <SettingsRow label="Add people to the event team first" onPress={() => router.push(`/manage/event/${eventId}/team`)} />
          )}
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Teams in this room see their volunteers, and every query they raise goes to them too.
        </Text>

        {room ? (
          <SettingsGroup title={`Teams here · ${room.occupied} of ${room.capacity}`} plain>
            {room.teams.length === 0 ? <SettingsRow label="No teams yet" /> : null}
            {room.teams.map((t) => (
              <SettingsRow
                key={t.id}
                label={`${t.teamCode ?? '—'}  ${t.name}`}
                onPress={() => router.push(`/manage/event/${eventId}/hackathon/team/${t.id}`)}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {!isNew ? (
          <Button
            label="Delete room"
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

      <SaveBar visible={dirty} label={isNew ? 'Add room' : 'Save room'} onPress={save} loading={saving} disabled={deleting} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  chips: { paddingVertical: spacing[2] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
