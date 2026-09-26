import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Lock, SealCheck } from 'phosphor-react-native';
import { useTheme } from '../context/ThemeContext';
import GradientButton from '../components/GradientButton';
import {
  getMyAssignments,
  getMyJudgment,
  submitJudgment,
  JudgingMetric,
  PanelistKind,
} from '../lib/api/leaderboard';
import { spacing, borderRadius, font } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import useTopSpacing from '../hooks/useTopSpacing';
import { AppAlert } from '../components/ui/AppAlert';

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
  const { colors } = useTheme();
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

  const isMentor = kind === 'MENTOR';

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
        comment: comments[c.metricId]?.trim() || undefined,
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
      overallReview: overallReview.trim() || undefined,
      submit,
    });
    setSaving(false);

    if (!result.ok) {
      AppAlert.alert('Could not save', result.message ?? 'Please try again.');
      return;
    }
    if (submit) {
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
      backgroundColor: colors.card,
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
      backgroundColor: colors.backgroundSecondary,
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
      backgroundColor: colors.backgroundSecondary,
      borderRadius: borderRadius.lg,
      padding: spacing[3],
      minHeight: 44,
      textAlignVertical: 'top',
    },
    reviewInput: {
      fontSize: 15,
      fontFamily: getFontFamily('normal'),
      color: colors.text,
      backgroundColor: colors.card,
      borderRadius: borderRadius.xl,
      padding: spacing[4],
      minHeight: 120,
      textAlignVertical: 'top',
      marginBottom: spacing[5],
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
          {submittedAt && (
            <View style={styles.submittedPill}>
              <SealCheck size={14} color={colors.success} weight="fill" />
              <Text style={styles.submittedText}>
                {isMentor ? 'Review submitted' : 'Submitted'} — you can still edit
              </Text>
            </View>
          )}
        </View>

        {!isMentor && metrics.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Criteria</Text>
            {metrics.map((m) => (
              <View key={m.id} style={styles.metricCard}>
                <View style={styles.metricTopRow}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <TextInput
                    style={styles.scoreInput}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.textMuted}
                    value={scores[m.id] ?? ''}
                    onChangeText={(t) => setScores((prev) => ({ ...prev, [m.id]: t }))}
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
          multiline
          maxLength={5000}
        />

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
