import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import DateTimeRow from '../components/manage/DateTimeRow';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  getHackathonOverview,
  updateHackathonConfig,
  type HackathonOverview,
  type PsMode,
  type ThemeMode,
} from '../lib/api/hackathon';
import { PS_MODE_OPTIONS, TEAM_CODE_PREFIX_RE, THEME_MODE_OPTIONS, formatTeamCode } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const DIGITS = ['1', '2', '3', '4', '5', '6'].map((d) => ({ value: d, label: d }));
const LEAD_NAMES = '__lead__';

interface Draft {
  prefix: string;
  digits: string;
  next: string;
  teamNameFieldId: string;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  venueNotes: string;
  psMode: PsMode | 'OFF';
  themeMode: ThemeMode;
  /** ISO string (JSON-comparable for the dirty check); '' = no deadline. */
  psDeadline: string;
}

/** Tomorrow, 6 pm: a sensible first deadline. */
const defaultDeadline = () => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
};

const toDraft = (o: HackathonOverview): Draft => ({
  prefix: o.hackathon?.teamCodePrefix ?? '',
  digits: String(o.hackathon?.teamCodeDigits ?? 3),
  next: String(o.hackathon?.teamCodeNext ?? 1),
  teamNameFieldId: o.hackathon?.teamNameFieldId ?? LEAD_NAMES,
  venueName: o.hackathon?.venue.name ?? '',
  venueAddress: o.hackathon?.venue.address ?? '',
  venueMapUrl: o.hackathon?.venue.mapUrl ?? '',
  venueNotes: o.hackathon?.venue.notes ?? '',
  psMode: o.hackathon?.psMode ?? 'OFF',
  themeMode: o.hackathon?.themeMode ?? 'LIST',
  psDeadline: o.hackathon?.psDeadline ?? '',
});

/**
 * Hackathon settings: the Team ID format (with a live preview of the next ID),
 * where team names come from, how teams get their problem statement and theme
 * (with an optional deadline), and the venue teams are sent to.
 */
export default function HackathonSettingsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [overview, setOverview] = useState<HackathonOverview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const initial = useRef('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonSettings');

  useEffect(() => {
    if (!eventId) return;
    void getHackathonOverview(eventId).then((r) => {
      if (!r.ok) return setError(r.message);
      const d = toDraft(r.data);
      initial.current = JSON.stringify(d);
      setOverview(r.data);
      setDraft(d);
    });
  }, [eventId]);

  const set = (patch: Partial<Draft>) => {
    setError('');
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  if (!draft || !overview) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const dirty = JSON.stringify(draft) !== initial.current;
  const currentNext = overview.hackathon?.teamCodeNext ?? 1;
  const prefix = draft.prefix.trim();
  const digits = Number(draft.digits);
  const next = Number(draft.next);
  const prefixOk = !prefix || TEAM_CODE_PREFIX_RE.test(prefix);
  const preview =
    prefix && prefixOk && Number.isInteger(next) && next >= 1
      ? [0, 1, 2].map((i) => formatTeamCode(prefix, digits, next + i)).join(', ') + '…'
      : null;
  const ev = overview.eventVenue;
  const teamsChoose = draft.psMode === 'TEAM_PICKS' || draft.psMode === 'TEAM_WRITES';
  const opening = teamsChoose && !(overview.hackathon?.psMode === 'TEAM_PICKS' || overview.hackathon?.psMode === 'TEAM_WRITES');
  const eventVenue = [ev.name, ev.address].filter(Boolean).join(', ');

  const save = async () => {
    if (!eventId) return;
    if (!prefixOk) return setError('The prefix uses letters, numbers and - _ / . (no spaces), up to 20.');
    if (!Number.isInteger(next) || next < currentNext) {
      return setError(`The next number can only move forward (it's at ${currentNext}), so no Team ID is ever reused.`);
    }
    setSaving(true);
    const res = await updateHackathonConfig(eventId, {
      teamCodePrefix: prefix || null,
      teamCodeDigits: digits,
      teamCodeNext: next,
      teamNameFieldId: draft.teamNameFieldId === LEAD_NAMES ? null : draft.teamNameFieldId,
      venueName: draft.venueName.trim() || null,
      venueAddress: draft.venueAddress.trim() || null,
      venueMapUrl: draft.venueMapUrl.trim() || null,
      venueNotes: draft.venueNotes.trim() || null,
      psMode: draft.psMode === 'OFF' ? null : draft.psMode,
      themeMode: draft.themeMode,
      psDeadline: teamsChoose && draft.psDeadline ? draft.psDeadline : null,
    });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    router.back();
  };

  const nameOptions = [
    { value: LEAD_NAMES, label: 'Team lead names it' },
    ...overview.teamNameFields.map((f) => ({
      value: f.id,
      label: f.ticketTypeName ? `${f.label} (${f.ticketTypeName})` : f.label,
    })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <SettingsGroup title="Team ID" plain>
          <FieldRow
            label="Prefix"
            value={draft.prefix}
            onChangeText={(v) => set({ prefix: v })}
            placeholder="HACK25-"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <FieldRow label="Next number" value={draft.next} onChangeText={(v) => set({ next: v })} keyboardType="number-pad" />
        </SettingsGroup>
        <View style={{ marginTop: spacing[4] }}>
          <BlockTitle>Digits</BlockTitle>
          <ChipPicker options={DIGITS} value={draft.digits} onChange={(v) => v && set({ digits: v })} />
        </View>
        <Text style={[styles.note, { color: prefixOk ? tokens.textMuted : tokens.danger }]}>
          {!prefixOk
            ? 'Use letters, numbers and - _ / . with no spaces.'
            : preview
              ? `Next teams get ${preview}`
              : 'Set a prefix to start handing out Team IDs.'}
        </Text>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          Teams keep their ID for good, even if their registration is cancelled. Changing the format only affects teams imported
          after the change.
        </Text>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Team names</BlockTitle>
          <ChipPicker options={nameOptions} value={draft.teamNameFieldId} onChange={(v) => v && set({ teamNameFieldId: v })} />
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {overview.teamNameFields.length
            ? 'Pick a registration question asked once per group to use its answer as the team name. Otherwise the name starts as “<lead>’s team” and the lead can change it.'
            : 'To collect team names at registration, add a text question asked once per group on your group ticket. Until then the lead names the team in the app.'}
        </Text>

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Problem statements</BlockTitle>
          <ChipPicker
            options={PS_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.psMode}
            onChange={(v) => v && set({ psMode: v })}
          />
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {PS_MODE_OPTIONS.find((o) => o.value === draft.psMode)?.hint} A team’s statement locks when it’s chosen, and
          only locked teams can be judged. You can always assign or change one from the team’s screen.
        </Text>
        {opening && overview.counts.active ? (
          <Text style={[styles.note, { color: tokens.accent }]}>
            Saving tells every team still without a statement that they can choose now.
          </Text>
        ) : null}

        {teamsChoose ? (
          <SettingsGroup plain>
            <SwitchRow
              label="Deadline for teams"
              value={!!draft.psDeadline}
              onValueChange={(on) => set({ psDeadline: on ? defaultDeadline() : '' })}
            />
            {draft.psDeadline ? (
              <DateTimeRow label="Choose by" value={new Date(draft.psDeadline)} onChange={(d) => set({ psDeadline: d.toISOString() })} />
            ) : null}
          </SettingsGroup>
        ) : null}
        {teamsChoose && draft.psDeadline ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Teams still choosing get a reminder an hour before. After it, you assign the rest.
          </Text>
        ) : null}

        <View style={{ marginTop: spacing[8] }}>
          <BlockTitle>Themes</BlockTitle>
          <ChipPicker
            options={THEME_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.themeMode}
            onChange={(v) => v && set({ themeMode: v })}
          />
        </View>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {THEME_MODE_OPTIONS.find((o) => o.value === draft.themeMode)?.hint}
          {draft.themeMode === 'LIST' && !overview.counts.themes ? ' Add themes from the hackathon screen; with none, teams skip it.' : ''}
        </Text>

        <SettingsGroup title="Venue" plain>
          <FieldRow stacked label="Venue name" value={draft.venueName} onChangeText={(v) => set({ venueName: v })} placeholder={ev.name ?? 'Main campus'} />
          <FieldRow stacked multiline label="Address" value={draft.venueAddress} onChangeText={(v) => set({ venueAddress: v })} placeholder={ev.address ?? ''} />
          <FieldRow
            stacked
            label="Maps link (optional)"
            value={draft.venueMapUrl}
            onChangeText={(v) => set({ venueMapUrl: v })}
            placeholder="https://maps.app.goo.gl/…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <FieldRow
            stacked
            multiline
            label="Directions for teams (optional)"
            value={draft.venueNotes}
            onChangeText={(v) => set({ venueNotes: v })}
            placeholder="Enter through Gate 3, registration desk in the lobby"
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {eventVenue ? `Leave the name and address blank to use the event’s venue: ${eventVenue}.` : 'Teams see this on their hackathon screen.'}
        </Text>
      </ScrollView>

      <SaveBar visible={dirty} label="Save settings" onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
