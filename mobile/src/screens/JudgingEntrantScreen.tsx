import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Lock, LockSimple, SealCheck } from '@unifesto/unicon/react-native';
import { useTheme } from '../context/ThemeContext';
import GradientButton from '../components/GradientButton';
import {
  getMyAssignments,
  getMyJudgment,
  submitJudgment,
  JudgingMetric,
  MyJudgment,
  PanelistKind,
} from '../lib/api/leaderboard';
import { spacing, borderRadius, font } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import useTopSpacing from '../hooks/useTopSpacing';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import SlotTimer from '../components/hackathon/SlotTimer';
import { useNow } from '../hooks/useHackathonSocket';
import { formatClock, secondsUntil } from '../lib/hackathon';

/**
 * ── Submit policy (the decision point) ────────────────────────────────────
 * When a JUDGE taps "Submit review", how complete must their scoring be?
 *
 * This matters because backend aggregation averages a team's score across
 * *only the judges who scored them* — so a judge who submits with blanks quietly
 * skews the average, while blocking submission until every criterion is filled
 * can frustrate a judge who genuinely wants to abstain on one criterion.
 *
 * Returns an error message to block submission, or null to allow it. `scores` is
 * keyed by metricId → the raw string the judge typed (may be '' or non-numeric).
 * Drafts ("Save") are never validated — only this Submit path is.
 *
 * Default below: require every in-scope criterion to hold an in-range number.
 * Reshape this to match how you want judging to behave.
 */
function validateForSubmit(
  metrics: JudgingMetric[],
  scores: Record<string, string>,
): string | null {
  for (const m of metrics) {
    const raw = (scores[m.id] ?? '').trim();
    if (raw === '') {
      return `Enter a score for "${m.label}" before submitting.`;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < m.minValue || value > m.maxValue) {
      return `"${m.label}" must be a number between ${m.minValue} and ${m.maxValue}.`;
    }
  }
  return null;
}

export default function JudgingEntrantScreen() {
  const router = useRouter();
  const { colors, tokens } = useTheme();
  const topSpacing = useTopSpacing();
  const { eventId, entrantId, roundId, roundName, entrantName } = useLocalSearchParams<{
    eventId: string;
    entrantId: string;
    roundId: string;
    roundName?: string;
    entrantName?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [lockedMessage, setLockedMessage] = useState('');
  const [kind, setKind] = useState<PanelistKind>('JUDGE');
  const [metrics, setMetrics] = useState<JudgingMetric[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [overallReview, setOverallReview] = useState('');
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState<false | 'draft' | 'submit'>(false);
  // Hackathon: the team and slot, and the 5-minute window after submitting.
  const [hack, setHack] = useState<MyJudgment['hackathon']>(null);
  const [editableUntil, setEditableUntil] = useState<string | null>(null);
  const [marksLocked, setMarksLocked] = useState(false);
  const now = useNow(!!hack);

  const isMentor = kind === 'MENTOR';
  const editLeft = secondsUntil(editableUntil, now);
  // Locked by the server, or the countdown just ran out on screen.
  const readOnly = marksLocked || (!!submittedAt && editLeft != null && editLeft <= 0);
  // Hackathon marks go in during the team's slot (or while editable after submitting).
  const noSlot = !!hack && !hack.slot && !submittedAt;

  const load = useCallback(async () => {
    if (!eventId || !entrantId || !roundId) {
      setLoading(false);
      return;
    }
    const [assignments, judgment] = await Promise.all([
      getMyAssignments(eventId),
      getMyJudgment(entrantId, roundId),
    ]);

    if (assignments) {
      setKind(assignments.kind);
      // Criteria that apply to this round: board-level (null) or round-scoped.
      setMetrics(
        assignments.metrics.filter((m) => m.roundId === null || m.roundId === roundId),
      );
    }

    if (!judgment.ok) {
      setLocked(judgment.locked);
      setLockedMessage(judgment.message);
    } else {
      const existing: Record<string, string> = {};
      const existingComments: Record<string, string> = {};
      for (const cell of judgment.data.scores) {
        existing[cell.metricId] = String(cell.value);
        if (cell.comment) existingComments[cell.metricId] = cell.comment;
      }
      setScores(existing);
      setComments(existingComments);
      setOverallReview(judgment.data.overallReview ?? '');
      setSubmittedAt(judgment.data.submittedAt);
      setHack(judgment.data.hackathon ?? null);
      // On hackathons the round decides the role (mentoring rounds are feedback only).
      if (judgment.data.hackathon) setKind(judgment.data.kind);
      setEditableUntil(judgment.data.editableUntil ?? null);
      setMarksLocked(!!judgment.data.locked);
    }
    setLoading(false);
  }, [eventId, entrantId, roundId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only cells with a finite number are sent; blanks are left unscored.
  const buildScoreCells = () =>
    metrics
      .map((m) => ({ metricId: m.id, raw: (scores[m.id] ?? '').trim() }))
      .filter((c) => c.raw !== '' && Number.isFinite(Number(c.raw)))
      .map((c) => ({
        metricId: c.metricId,
        value: Number(c.raw),
        // Empty clears a comment the judge wrote earlier.
        comment: comments[c.metricId]?.trim(),
      }));

  const handleSave = async (submit: boolean) => {
    if (saving) return;

    if (submit) {
      const err = isMentor
        ? overallReview.trim() === ''
          ? 'Write your feedback before submitting.'
          : null
        : validateForSubmit(metrics, scores);
      if (err) {
        AppAlert.alert('Not quite ready', err);
        return;
      }
    }

    setSaving(submit ? 'submit' : 'draft');
    const result = await submitJudgment(entrantId!, {
      roundId: roundId!,
      scores: isMentor ? undefined : buildScoreCells(),
      overallReview: overallReview.trim(),
      submit,
    });
    setSaving(false);

    if (!result.ok) {
      if (result.locked) setMarksLocked(true);
      AppAlert.alert(result.locked ? 'Marks locked' : 'Could not save', result.message ?? 'Please try again.');
      return;
    }
    if (hack) {
      setSubmittedAt(result.submittedAt ?? submittedAt);
      setEditableUntil(result.editableUntil ?? editableUntil);
    }
    if (submit && hack) {
      AppAlert.alert('Marks submitted', 'You can still change them for 5 minutes. Back to your queue?', [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Back to queue', onPress: () => router.back() },
      ]);
    } else if (submit) {
      AppAlert.alert('Submitted', 'Your review has been recorded.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } else {
      // Draft save leaves any prior submitted state untouched.
      AppAlert.alert('Saved', 'Your draft is saved. Submit when you’re ready.');
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing[6], paddingBottom: spacing[10] },
    header: { marginBottom: spacing[5] },
    entrantName: {
      fontSize: 24,
      ...font('heading'),
      color: colors.text,
      letterSpacing: -0.5,
    },
    roundName: {
      fontSize: 14,
      fontFamily: getFontFamily('semibold'),
      color: colors.textMuted,
      marginTop: spacing[1],
    },
    submittedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      alignSelf: 'flex-start',
      marginTop: spacing[3],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[1],
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundSecondary,
    },
    submittedText: {
      fontSize: 12,
      fontFamily: getFontFamily('semibold'),
      color: colors.success,
      flexShrink: 1,
    },
    contextText: {
      fontSize: 15,
      fontFamily: getFontFamily('semibold'),
      color: colors.text,
      marginTop: spacing[3],
      lineHeight: 21,
    },
    contextMuted: {
      fontSize: 13,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      marginTop: spacing[2],
      lineHeight: 19,
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: getFontFamily('bold'),
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing[3],
      marginTop: spacing[2],
    },
    metricCard: {
      borderRadius: borderRadius.xl,
      padding: spacing[4],
      marginBottom: spacing[3],
    },
    metricTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
    },
    metricLabel: {
      fontSize: 16,
      fontFamily: getFontFamily('semibold'),
      color: colors.text,
      flex: 1,
      letterSpacing: -0.2,
    },
    scoreInput: {
      width: 88,
      textAlign: 'center',
      fontSize: 20,
      fontFamily: getFontFamily('bold'),
      color: colors.text,
      backgroundColor: tokens.fill,
      borderRadius: borderRadius.lg,
      paddingVertical: spacing[2],
      borderWidth: 1,
      borderColor: colors.border,
    },
    rangeHint: {
      fontSize: 12,
      fontFamily: getFontFamily('medium'),
      color: colors.textMuted,
      marginTop: spacing[2],
    },
    commentInput: {
      marginTop: spacing[3],
      fontSize: 14,
      fontFamily: getFontFamily('normal'),
      color: colors.text,
      backgroundColor: tokens.fill,
      borderRadius: borderRadius.lg,
      padding: spacing[3],
      minHeight: 44,
      textAlignVertical: 'top',
    },
    reviewWrap: { borderRadius: borderRadius.xl, marginBottom: spacing[5] },
    reviewInput: {
      fontSize: 15,
      fontFamily: getFontFamily('normal'),
      color: colors.text,
      padding: spacing[4],
      minHeight: 120,
      textAlignVertical: 'top',
    },
    actions: { gap: spacing[3] },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: topSpacing + 100,
      paddingHorizontal: spacing[6],
    },
    lockIcon: { marginBottom: spacing[5] },
    lockTitle: {
      fontSize: 20,
      ...font('heading'),
      color: colors.text,
      marginBottom: spacing[2],
      textAlign: 'center',
    },
    lockText: {
      fontSize: 15,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={[styles.container, styles.center]}>
        <View style={styles.lockIcon}>
          <Lock size={52} color={colors.textMuted} weight="duotone" />
        </View>
        <Text style={styles.lockTitle}>Round closed</Text>
        <Text style={styles.lockText}>{lockedMessage}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing + spacing[2] }]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.entrantName}>{entrantName ?? 'Entrant'}</Text>
          {roundName && <Text style={styles.roundName}>{roundName}</Text>}
          {hack?.statement ? (
            <Text style={styles.contextText}>
              {[hack.statement.code, hack.statement.title].filter(Boolean).join(' · ')}
              {hack.statement.themeLabel ? `  (${hack.statement.themeLabel})` : ''}
            </Text>
          ) : null}
          {hack?.statement?.description ? (
            <Text style={styles.contextMuted} numberOfLines={6}>
              {hack.statement.description}
            </Text>
          ) : null}
          {hack?.members.length ? <Text style={styles.contextMuted}>{hack.members.join(', ')}</Text> : null}
          {hack?.links?.length ? (
            <View style={{ marginTop: spacing[2] }}>
              {hack.links.map((l) => (
                <Text key={l.url} style={[styles.contextText, { color: colors.primary, marginTop: spacing[1] }]} onPress={() => void Linking.openURL(l.url)} accessibilityRole="link">
                  {l.label} ↗
                </Text>
              ))}
              {hack.linksNotes ? <Text style={styles.contextMuted}>{hack.linksNotes}</Text> : null}
            </View>
          ) : null}
          {hack?.slot?.status === 'IN_PROGRESS' ? (
            <View style={{ marginTop: spacing[3] }}>
              <SlotTimer until={hack.slot.slotEndsAt} label="left in the slot" doneLabel="Time’s up: submit your marks" />
            </View>
          ) : null}
          {hack?.slot?.status === 'AWAITING_MARKS' ? (
            <Text style={[styles.contextText, { color: colors.warning }]}>Time’s up. Submit your marks to call the next team.</Text>
          ) : null}
          {submittedAt && !readOnly && (
            <View style={styles.submittedPill}>
              <SealCheck size={14} color={colors.success} weight="fill" />
              <Text style={styles.submittedText}>
                {isMentor ? 'Review submitted' : 'Submitted'}
                {hack && editLeft != null ? ` — you can change it for ${formatClock(Math.max(0, editLeft))}` : ' — you can still edit'}
              </Text>
            </View>
          )}
          {readOnly ? (
            <View style={styles.submittedPill}>
              <LockSimple size={14} color={colors.textMuted} weight="fill" />
              <Text style={[styles.submittedText, { color: colors.textMuted }]}>Locked. Ask the organisers if something needs fixing.</Text>
            </View>
          ) : null}
          {noSlot ? (
            <View style={styles.submittedPill}>
              <Lock size={14} color={colors.warning} weight="fill" />
              <Text style={[styles.submittedText, { color: colors.warning }]}>Call this team from your queue to give marks.</Text>
            </View>
          ) : null}
        </View>

        {!isMentor && metrics.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Criteria</Text>
            {metrics.map((m) => (
              <View key={m.id} style={styles.metricCard}>
                <CardBackdrop shape={styles.metricCard} />
                <View style={styles.metricTopRow}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <TextInput
                    style={styles.scoreInput}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.textMuted}
                    value={scores[m.id] ?? ''}
                    onChangeText={(t) => setScores((prev) => ({ ...prev, [m.id]: t }))}
                    editable={!readOnly && !noSlot}
                    maxLength={7}
                  />
                </View>
                <Text style={styles.rangeHint}>
                  {m.minValue}–{m.maxValue}
                  {m.weight !== 1 ? `  ·  weight ${m.weight}` : ''}
                </Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a note for this criterion (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={comments[m.id] ?? ''}
                  onChangeText={(t) => setComments((prev) => ({ ...prev, [m.id]: t }))}
                  editable={!readOnly && !noSlot}
                  multiline
                  maxLength={2000}
                />
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>
          {isMentor ? 'Feedback' : 'Overall review'}
        </Text>
        <View style={styles.reviewWrap}>
          <CardBackdrop shape={styles.reviewWrap} />
          <TextInput
            style={styles.reviewInput}
            placeholder={
              isMentor
                ? 'Share guidance and feedback for this team'
                : 'Summarise your assessment (shared with the team only if the organiser reveals it)'
            }
            placeholderTextColor={colors.textMuted}
            value={overallReview}
            onChangeText={setOverallReview}
            editable={!readOnly && !noSlot}
            multiline
            maxLength={5000}
          />
        </View>

        {readOnly || noSlot ? null : (
        <View style={styles.actions}>
          <GradientButton
            onPress={() => handleSave(true)}
            loading={saving === 'submit'}
            disabled={saving !== false}
            size="lg"
          >
            {submittedAt ? 'Update review' : 'Submit review'}
          </GradientButton>
          <GradientButton
            onPress={() => handleSave(false)}
            loading={saving === 'draft'}
            disabled={saving !== false}
            variant="outline"
            size="lg"
          >
            Save draft
          </GradientButton>
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
