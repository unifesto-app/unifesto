import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import {
  getAttendeeDetails,
  getMyDetails,
  updateAttendeeDetails,
  updateMyDetails,
  type CuratorDetails,
  type MyDetails,
} from '../lib/api/attendeeControls';
import { getEventCustomFields, getFieldsForTicket, type CustomField } from '../lib/api/tickets';
import { displayAnswer, firstFormProblem, visibleFields } from '../utils/formQuestions';
import CustomFieldInput from '../components/CustomFieldInput';
import { FieldRow } from '../components/manage/FormFields';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
type Answers = Record<string, unknown>;

/** One editable block: the registration's answers, or one member's name + answers. */
interface Section {
  key: string;
  title: string;
  fields: CustomField[];
  answers: Answers;
  /** Member blocks carry a name and the seat they belong to. */
  seatIndex?: number;
  name?: string | null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Edit registration details after booking.
 *
 * - Attendee (`/edit-details?registrationId=`): what the server says they may
 *   change. A solo attendee their answers, a group lead the team's answers and
 *   their own, a member their own. Read-only with the reason while editing is
 *   closed (the curator's switch, deadline, or the event is over).
 * - Curator (`…&eventId=`): the registration's answers and every filled seat,
 *   any time. Required answers are shown but not forced.
 */
export default function EditDetailsScreen() {
  const { registrationId, eventId: curatorEventId, title } = useLocalSearchParams<{
    registrationId: string;
    eventId?: string;
    title?: string;
  }>();
  const curator = !!curatorEventId;
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();

  const [mine, setMine] = useState<MyDetails | null>(null);
  const [theirs, setTheirs] = useState<CuratorDetails | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [draft, setDraft] = useState<Record<string, Section>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!registrationId) return;
    const res = curator ? await getAttendeeDetails(curatorEventId!, registrationId) : await getMyDetails(registrationId);
    if (!res.ok) {
      setError(res.denied ? 'You don’t have access to these details.' : res.message);
      return;
    }
    const data = res.data;
    const { fields: all } = await getEventCustomFields(data.eventId);
    setFields(getFieldsForTicket(all, data.ticketTypeId ?? ''));
    if (curator) setTheirs(data as CuratorDetails);
    else setMine(data as MyDetails);
    setError('');
  }, [registrationId, curator, curatorEventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The blocks this person can see, built from the server's current values.
  const sections: Section[] = useMemo(() => {
    const isGroup = curator ? !!theirs?.isGroup : !!mine?.isGroup;
    const teamFields = isGroup ? fields.filter((f) => f.per_group) : fields;
    const memberFields = fields.filter((f) => !f.per_group);
    const out: Section[] = [];
    if (curator && theirs) {
      if (teamFields.length) {
        out.push({ key: 'team', title: isGroup ? 'Team answers' : 'Answers', fields: teamFields, answers: theirs.formResponses });
      }
      if (isGroup) {
        for (const s of theirs.seats.filter((x) => x.status === 'CLAIMED')) {
          out.push({
            key: `seat-${s.seatIndex}`,
            title: s.seatIndex === 1 ? `Lead${s.name ? ` · ${s.name}` : ''}` : `Member ${s.seatIndex}${s.name ? ` · ${s.name}` : ''}`,
            fields: memberFields,
            answers: s.customFields,
            seatIndex: s.seatIndex,
            name: s.name,
          });
        }
      }
    } else if (mine) {
      if (mine.role !== 'member' && teamFields.length) {
        out.push({ key: 'team', title: mine.role === 'lead' ? 'Team answers' : 'Your answers', fields: teamFields, answers: mine.formResponses ?? {} });
      }
      if (mine.member) {
        out.push({
          key: 'me',
          title: 'Your details',
          fields: memberFields,
          answers: mine.member.customFields,
          seatIndex: mine.member.seatIndex,
          name: mine.member.name,
        });
      }
    }
    return out;
  }, [curator, theirs, mine, fields]);

  // Reset the draft whenever fresh data arrives.
  useEffect(() => {
    setDraft(Object.fromEntries(sections.map((s) => [s.key, { ...s, answers: { ...s.answers } }])));
  }, [sections]);

  const editable = curator || !!mine?.editable;
  const changed = sections.filter((s) => {
    const d = draft[s.key];
    return d && (!same(d.answers, s.answers) || (s.seatIndex !== undefined && (d.name ?? '') !== (s.name ?? '')));
  });

  const save = async () => {
    // Attendees must still answer required questions; curators may leave gaps.
    for (const s of changed) {
      const d = draft[s.key];
      const problem = firstFormProblem(d.fields, d.answers, { enforceRequired: !curator });
      if (problem) {
        AppAlert.alert('Check your answers', `${s.title}: ${problem}`);
        return;
      }
      if (curator && d.seatIndex !== undefined && !(d.name ?? '').trim()) {
        AppAlert.alert('Name needed', `${s.title}: add a name.`);
        return;
      }
    }
    setSaving(true);
    try {
      // The lead's team answers and own details go in one request; curators save per block.
      if (!curator) {
        const team = changed.find((s) => s.key === 'team');
        const me = changed.find((s) => s.key === 'me');
        const res = await updateMyDetails(registrationId!, {
          ...(team ? { formResponses: draft.team.answers } : {}),
          ...(me ? { customFields: draft.me.answers } : {}),
        });
        if (!res.ok) throw new Error(res.message);
        setMine(res.data);
      } else {
        for (const s of changed) {
          const d = draft[s.key];
          const res = await updateAttendeeDetails(curatorEventId!, registrationId!, s.key === 'team'
            ? { formResponses: d.answers }
            : { seatIndex: d.seatIndex, name: (d.name ?? '').trim(), customFields: d.answers });
          if (!res.ok) throw new Error(`${s.title}: ${res.message}`);
          setTheirs(res.data);
        }
      }
      AppAlert.alert('Saved', curator ? 'The attendee’s details are updated.' : 'Your details are updated.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      AppAlert.alert('Couldn’t save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!mine && !theirs) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const set = (key: string, patch: Partial<Section>) => setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {title ? <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}

        {!editable ? (
          <View style={[styles.locked, { backgroundColor: tokens.fill }]}>
            <Lock size={18} color={tokens.textSecondary} weight="bold" />
            <Text style={[styles.lockedText, { color: tokens.textSecondary }]}>
              {mine?.lockedReason ?? 'These details can’t be changed right now.'} Ask the organiser if something is wrong.
            </Text>
          </View>
        ) : null}
        {!curator ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Name, email, phone and gender can't be changed here. You can change your name and gender in your profile.
          </Text>
        ) : null}
        {editable && !curator && mine?.editsUntil ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            You can change these until{' '}
            {new Date(mine.editsUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}.
          </Text>
        ) : null}

        {sections.length === 0 ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>This ticket has no details to change.</Text>
        ) : null}

        {sections.map((s) => {
          const d = draft[s.key] ?? s;
          return (
            <View key={s.key} style={{ marginTop: spacing[6] }}>
              {editable ? (
                <>
                  <Text style={[styles.section, { color: tokens.textMuted }]}>{s.title}</Text>
                  {curator && s.seatIndex !== undefined ? (
                    <SettingsGroup plain>
                      <FieldRow label="Name" value={d.name ?? ''} onChangeText={(v) => set(s.key, { name: v })} maxLength={100} />
                    </SettingsGroup>
                  ) : null}
                  {visibleFields(d.fields, d.answers).map((f) => (
                    <CustomFieldInput
                      key={f.id}
                      field={f}
                      value={d.answers[f.id]}
                      onChange={(v) => set(s.key, { answers: { ...d.answers, [f.id]: v } })}
                    />
                  ))}
                </>
              ) : (
                <SettingsGroup title={s.title} plain>
                  {s.seatIndex !== undefined ? <SettingsRow label="Name" value={s.name || '–'} /> : null}
                  {visibleFields(s.fields, s.answers).map((f) => (
                    <SettingsRow key={f.id} label={f.label} value={displayAnswer(f, s.answers[f.id]) || '–'} />
                  ))}
                </SettingsGroup>
              )}
            </View>
          );
        })}

        {editable && sections.length > 0 ? (
          <Button
            label="Save changes"
            size="lg"
            fullWidth
            loading={saving}
            disabled={changed.length === 0}
            onPress={save}
            style={{ marginTop: spacing[8] }}
          />
        ) : null}
        {curator ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            As an organiser you can change these any time. Required questions aren’t enforced here.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[3], ...font('heading') },
  section: { marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...font('semibold') },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  locked: { flexDirection: 'row', gap: spacing[3], alignItems: 'center', padding: spacing[4], borderRadius: 16 },
  lockedText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.4, ...font() },
});
