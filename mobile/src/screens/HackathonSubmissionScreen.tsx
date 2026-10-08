import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinkSimple, Plus, X } from '@unifesto/unicon/react-native';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getMySubmissions, saveMySubmission, type MySubmissions } from '../lib/api/hackathon';
import { formatWhen } from '../lib/hackathon';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const MAX_LINKS = 10;

interface LinkDraft {
  label: string;
  url: string;
}

/**
 * The team's project links per round (repo, demo, deck…). Any member can edit
 * them until the round's cut-off; judges and mentors see them while evaluating.
 */
export default function HackathonSubmissionScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<MySubmissions | null>(null);
  const [roundId, setRoundId] = useState('');
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('HackathonSubmission');

  const pick = useCallback((d: MySubmissions, id: string) => {
    const r = d.rounds.find((x) => x.roundId === id);
    const l = r?.links.map((x) => ({ label: x.label, url: x.url })) ?? [];
    const draft = r?.canEdit && l.length === 0 ? [{ label: '', url: '' }] : l;
    setRoundId(id);
    setLinks(draft);
    setNotes(r?.notes ?? '');
    setInitial(JSON.stringify({ links: draft, notes: r?.notes ?? '' }));
    setError('');
  }, []);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getMySubmissions(eventId);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    // Default to the first round that's still open, else the latest.
    const first = res.data.rounds.find((r) => r.canEdit) ?? res.data.rounds[res.data.rounds.length - 1];
    if (first && !roundId) pick(res.data, first.roundId);
  }, [eventId, roundId, pick]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? <Text style={[styles.note, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const round = data.rounds.find((r) => r.roundId === roundId);
  const dirty = JSON.stringify({ links, notes }) !== initial;
  const setLink = (i: number, patch: Partial<LinkDraft>) => {
    setError('');
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const save = async () => {
    if (!round) return;
    setSaving(true);
    const res = await saveMySubmission(eventId!, round.roundId, {
      links: links.filter((l) => l.url.trim() || l.label.trim()).map((l) => ({ label: l.label.trim() || undefined, url: l.url.trim() })),
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
    pick(res.data, round.roundId);
  };

  if (!data.rounds.length) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Text style={[styles.note, { color: tokens.textMuted, textAlign: 'center' }]}>
          The organisers haven’t set up rounds yet. You can add project links once they do.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {data.rounds.length > 1 ? (
          <ChipPicker options={data.rounds.map((r) => ({ value: r.roundId, label: r.name }))} value={roundId} onChange={(v) => v && pick(data, v)} />
        ) : null}

        {round ? (
          <>
            <Text style={[styles.note, { color: tokens.textMuted, marginTop: spacing[4] }]}>
              {round.canEdit
                ? round.closesAt
                  ? `Add your repo, demo, deck or video. You can change them until ${formatWhen(round.closesAt)}.`
                  : 'Add your repo, demo, deck or video. You can change them until the round closes.'
                : data.stage === 'NEEDS_PS'
                  ? 'Lock in your problem statement to add links.'
                  : round.status === 'CLOSED' || (round.closesAt && new Date(round.closesAt).getTime() <= Date.now())
                    ? 'Links for this round are closed.'
                    : 'Your team isn’t in this round.'}{' '}
              Judges and mentors see them while evaluating your team.
            </Text>

            {round.canEdit ? (
              <>
                {links.map((l, i) => (
                  <View key={i} style={styles.linkCard}>
                    <CardBackdrop shape={styles.linkCard} />
                    <View style={styles.linkRow}>
                      <TextInput
                        value={l.label}
                        onChangeText={(v) => setLink(i, { label: v })}
                        placeholder="Label (e.g. GitHub)"
                        placeholderTextColor={tokens.textMuted}
                        style={[styles.input, styles.labelInput, { color: tokens.text }]}
                        maxLength={60}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove link"
                        hitSlop={12}
                        onPress={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
                        style={{ padding: spacing[1] }}
                      >
                        <X size={18} color={tokens.textMuted} weight="bold" />
                      </Pressable>
                    </View>
                    <TextInput
                      value={l.url}
                      onChangeText={(v) => setLink(i, { url: v })}
                      placeholder="https://"
                      placeholderTextColor={tokens.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={[styles.input, { color: tokens.text, backgroundColor: tokens.fill }]}
                    />
                  </View>
                ))}
                {links.length < MAX_LINKS ? (
                  <Button
                    label="Add a link"
                    variant="secondary"
                    fullWidth
                    icon={<Plus size={16} color={tokens.text} weight="bold" />}
                    onPress={() => setLinks((ls) => [...ls, { label: '', url: '' }])}
                    style={{ marginTop: spacing[2] }}
                  />
                ) : null}
                <View style={[styles.linkCard, { marginTop: spacing[4] }]}>
                  <CardBackdrop shape={styles.linkCard} />
                  <TextInput
                    value={notes}
                    onChangeText={(v) => (setNotes(v), setError(''))}
                    placeholder="Notes for the judges (optional), e.g. demo login"
                    placeholderTextColor={tokens.textMuted}
                    multiline
                    maxLength={2000}
                    style={[styles.input, { color: tokens.text, minHeight: 72, textAlignVertical: 'top' }]}
                  />
                </View>
              </>
            ) : (
              <SettingsGroup>
                {round.links.length === 0 ? <SettingsRow label="No links" /> : null}
                {round.links.map((l) => (
                  <SettingsRow
                    key={l.url}
                    icon={<LinkSimple size={24} color={tokens.accent} weight="bold" />}
                    label={l.label}
                    external
                    onPress={() => void Linking.openURL(l.url)}
                  />
                ))}
              </SettingsGroup>
            )}
            {round.updatedAt ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>
                Last saved {formatWhen(round.updatedAt)}
                {round.updatedBy ? ` by ${round.updatedBy}` : ''}.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <SaveBar visible={!!round?.canEdit && (dirty || !!error)} label="Save links" onPress={save} loading={saving} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  linkCard: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[3], marginTop: spacing[3], gap: spacing[2] },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  input: { borderRadius: borderRadius.lg, paddingHorizontal: spacing[3], paddingVertical: spacing[2], fontSize: typography.fontSize.base, ...font() },
  labelInput: { flex: 1, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
