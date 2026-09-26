import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CheckCircle, CircleDashed, Info, XCircle } from 'phosphor-react-native';
import { useTokens } from '../../src/context/ThemeContext';
import useTopSpacing from '../../src/hooks/useTopSpacing';
import Skeleton from '../../src/components/Skeleton';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { font } from '../../src/theme/fontHelpers';
import {
  requestRefund,
  getMyRefunds,
  OPEN_REFUND_STATUSES,
  type RefundRequest,
  type RefundStatus,
} from '../../src/lib/api/refunds';
import { CardBackdrop } from '../../src/components/ui/CardSurface';

const GUTTER = spacing[6];

/** Visual state a single timeline step can be in. */
type StepState = 'done' | 'current' | 'rejected' | 'skipped' | 'pending';

interface ProgressStep {
  label: string;
  state: StepState;
  at: string | null;
  note?: string | null;
}

/**
 * Project a refund request's status + timestamp columns onto a three-stage
 * timeline: Submitted → Organiser review → Final decision.
 *
 * The backend state machine is
 *   PENDING_CURATOR → PENDING_ADMIN → APPROVED | REJECTED
 * and a rejection can land at either the organiser or the admin stage, which is
 * why we look at `adminActionAt` to tell the two apart.
 */
function deriveSteps(req: RefundRequest): ProgressStep[] {
  const { status, curatorActionAt, adminActionAt, curatorNote, adminNote } = req;
  const rejectedAtCurator = status === 'REJECTED' && !adminActionAt;

  return [
    { label: 'Request submitted', state: 'done', at: req.createdAt },
    {
      label: 'Organiser review',
      state: status === 'PENDING_CURATOR' ? 'current' : rejectedAtCurator ? 'rejected' : 'done',
      at: curatorActionAt,
      note: rejectedAtCurator ? curatorNote : undefined,
    },
    {
      label: 'Final decision',
      state:
        status === 'APPROVED'
          ? 'done'
          : status === 'REJECTED' && adminActionAt
            ? 'rejected'
            : rejectedAtCurator
              ? 'skipped'
              : status === 'PENDING_ADMIN'
                ? 'current'
                : 'pending',
      at: adminActionAt,
      note: status === 'REJECTED' && adminActionAt ? adminNote : undefined,
    },
  ];
}

/** Short headline + tone for the status chip. */
function statusSummary(status: RefundStatus): { label: string; tone: 'info' | 'success' | 'error' } {
  switch (status) {
    case 'APPROVED':
      return { label: 'Refund approved', tone: 'success' };
    case 'REJECTED':
      return { label: 'Refund declined', tone: 'error' };
    default:
      return { label: 'In review', tone: 'info' };
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toNumber(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/** One tap fills the reason; the attendee can still edit it. */
const QUICK_REASONS = ["Can't make it anymore", 'Event details changed', 'Bought by mistake', 'Duplicate ticket'];

export default function RefundRoute() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing(8);
  const params = useLocalSearchParams<{ registrationId: string; eventTitle?: string; eventCompleted?: string }>();
  const registrationId = String(params.registrationId ?? '');
  const eventTitle = params.eventTitle ? String(params.eventTitle) : 'this event';
  // A completed event can no longer be refunded: the form is withheld while
  // any existing request's progress stays visible.
  const eventCompleted = params.eventCompleted === '1';

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!registrationId) {
      setLoading(false);
      return;
    }
    setRequests(await getMyRefunds(registrationId));
    setLoading(false);
  }, [registrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The newest request drives the progress view; a new request is offered only
  // when nothing is open (the backend allows one at a time).
  const latest = requests[0];
  const earlier = requests.slice(1);
  const hasOpen = useMemo(() => requests.some((r) => OPEN_REFUND_STATUSES.includes(r.status)), [requests]);
  const showForm = !hasOpen && !eventCompleted;

  const submit = async () => {
    if (!reason.trim()) {
      setError('Please tell us why you want a refund.');
      return;
    }
    setError('');
    setSubmitting(true);
    const res = await requestRefund({ registrationId, eventTitle, reason: reason.trim() });
    setSubmitting(false);
    if (res.ok) {
      setReason('');
      await load();
    } else {
      setError(res.error || 'Could not submit your request.');
    }
  };

  const toneColor = (tone: 'info' | 'success' | 'error') =>
    tone === 'success' ? tokens.success : tone === 'error' ? tokens.danger : tokens.warning;

  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      <Stack.Screen options={{ title: 'Refund', headerShown: true }} />

      {loading ? (
        <View style={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, gap: spacing[4] }}>
          <Skeleton width="70%" height={26} borderRadius={8} />
          <Skeleton width="100%" height={220} borderRadius={borderRadius.xl} />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: spacing[10] + insets.bottom }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.eventTitle, { color: tokens.text }]}>{latest?.event?.title || eventTitle}</Text>

            {/* ── Progress of the latest request ── */}
            {latest ? (() => {
              const summary = statusSummary(latest.status);
              const c = toneColor(summary.tone);
              return (
                <View style={[styles.card]}>
                  <CardBackdrop shape={styles.card} />
                  <View style={[styles.chip, { backgroundColor: c + '22' }]}>
                    <Text style={[styles.chipText, { color: c }]}>{summary.label}</Text>
                  </View>

                  <View style={{ marginTop: spacing[5] }}>
                    {deriveSteps(latest).map((step, i, arr) => (
                      <StepRow key={step.label} step={step} isLast={i === arr.length - 1} />
                    ))}
                  </View>

                  {latest.status === 'APPROVED' ? (
                    <View style={[styles.amountBox, { backgroundColor: tokens.surface }]}>
                      <Text style={[styles.amountLabel, { color: tokens.textSecondary }]}>Amount refunded</Text>
                      <Text style={[styles.amount, { color: tokens.success }]}>
                        ₹{toNumber(latest.approvedAmount ?? latest.cashRefunded).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={[styles.small, { color: tokens.textMuted }]}>
                        Back to your original payment method in 5 to 7 business days.
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.small, { color: tokens.textMuted, marginTop: spacing[4] }]}>
                    Your reason: “{latest.reason}”
                  </Text>
                </View>
              );
            })() : null}

            {/* ── Request form ── */}
            {showForm ? (
              <View style={[styles.card, latest && { marginTop: spacing[4] }]}>
                <CardBackdrop shape={styles.card} />
                <Text style={[styles.cardTitle, { color: tokens.text }]}>
                  {latest ? 'Request another refund' : 'Request a refund'}
                </Text>
                <Text style={[styles.body, { color: tokens.textSecondary }]}>
                  The organiser reviews it first, then our team makes the final decision.
                </Text>

                <View style={styles.chips}>
                  {QUICK_REASONS.map((r) => {
                    const active = reason === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => {
                          setReason(r);
                          setError('');
                        }}
                        style={({ pressed }) => [
                          styles.reasonChip,
                          { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] },
                        ]}
                      >
                        {!active ? <CardBackdrop shape={styles.reasonChip} /> : null}
                        <Text style={[styles.reasonChipText, { color: active ? tokens.bg : tokens.text }]}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={reason}
                  onChangeText={(v) => {
                    setReason(v);
                    setError('');
                  }}
                  placeholder="Tell us a little more"
                  placeholderTextColor={tokens.textMuted}
                  selectionColor={tokens.accent}
                  multiline
                  editable={!submitting}
                  style={[styles.input, { backgroundColor: tokens.surface, color: tokens.text }]}
                />

                <View style={styles.note}>
                  <Info size={18} color={tokens.textMuted} />
                  <Text style={[styles.small, { color: tokens.textMuted, flex: 1 }]}>
                    Only the ticket price is refunded; booking fees are not. Approved refunds go back to your original payment method in 5 to 7 business days.
                  </Text>
                </View>

                {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

                <Pressable
                  onPress={submit}
                  disabled={submitting}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.submit,
                    { backgroundColor: tokens.accent, opacity: submitting ? 0.7 : pressed ? 0.85 : 1 },
                  ]}
                >
                  {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Submit request</Text>}
                </Pressable>
              </View>
            ) : null}

            {!showForm && hasOpen ? (
              <Text style={[styles.hint, { color: tokens.textMuted }]}>
                We'll email you when this request moves forward.
              </Text>
            ) : null}
            {!showForm && !hasOpen && eventCompleted ? (
              <Text style={[styles.hint, { color: tokens.textMuted }]}>
                This event has ended, so new refund requests can't be made.
              </Text>
            ) : null}

            {/* ── Earlier requests (the latest is shown above) ── */}
            {earlier.length > 0 ? (
              <View style={{ marginTop: spacing[8] }}>
                <Text style={[styles.groupTitle, { color: tokens.textMuted }]}>Earlier requests</Text>
                <View style={[styles.card, { paddingVertical: spacing[1] }]}>
                  <CardBackdrop shape={styles.card} />
                  {earlier.map((r, i) => {
                    const sum = statusSummary(r.status);
                    return (
                      <View key={r.id}>
                        <View style={styles.earlierRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.earlierTitle, { color: tokens.text }]}>{sum.label}</Text>
                            <Text style={[styles.small, { color: tokens.textMuted }]} numberOfLines={1}>
                              {formatWhen(r.createdAt)}
                            </Text>
                          </View>
                          {r.status === 'APPROVED' ? (
                            <Text style={[styles.earlierAmount, { color: tokens.success }]}>
                              ₹{toNumber(r.approvedAmount ?? r.cashRefunded).toLocaleString('en-IN')}
                            </Text>
                          ) : null}
                        </View>
                        {i < earlier.length - 1 ? <View style={[styles.divider, { backgroundColor: tokens.border }]} /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

/** Pulsing dot for the step that's currently being worked on. */
function LiveDot({ color }: { color: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));
  return (
    <View style={styles.liveWrap}>
      <Animated.View style={[styles.liveRing, { backgroundColor: color }, ring]} />
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

/** One timeline row: a bare status mark, a connector, and label/date/note. */
function StepRow({ step, isLast }: { step: ProgressStep; isLast: boolean }) {
  const tokens = useTokens();
  const muted = step.state === 'pending' || step.state === 'skipped';
  const mark =
    step.state === 'done' ? (
      <CheckCircle size={24} color={tokens.success} weight="fill" />
    ) : step.state === 'rejected' ? (
      <XCircle size={24} color={tokens.danger} weight="fill" />
    ) : step.state === 'current' ? (
      <LiveDot color={tokens.accent} />
    ) : (
      <CircleDashed size={24} color={tokens.textMuted} />
    );

  return (
    <View style={styles.stepRow}>
      <View style={styles.rail}>
        {mark}
        {!isLast ? (
          <View style={[styles.connector, { backgroundColor: step.state === 'done' ? tokens.success : tokens.border }]} />
        ) : null}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing[5] }}>
        <Text style={[styles.stepLabel, { color: muted ? tokens.textMuted : tokens.text }]}>
          {step.label}
          {step.state === 'skipped' ? ' (not reached)' : ''}
          {step.state === 'current' ? <Text style={{ color: tokens.accent }}>{'  In progress'}</Text> : null}
        </Text>
        {step.at ? <Text style={[styles.small, { color: tokens.textMuted, marginTop: 2 }]}>{formatWhen(step.at)}</Text> : null}
        {step.note ? <Text style={[styles.stepNote, { color: tokens.textSecondary }]}>“{step.note}”</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  eventTitle: {
    fontSize: typography.fontSize['2xl'],
    lineHeight: typography.fontSize['2xl'] * 1.2,
    letterSpacing: -0.4,
    marginBottom: spacing[5],
    ...font('heading'),
  },
  card: { borderRadius: borderRadius.xl, padding: spacing[5] },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: borderRadius.full },
  chipText: { fontSize: 12, ...font('semibold') },
  stepRow: { flexDirection: 'row', gap: spacing[3] },
  rail: { alignItems: 'center', width: 24 },
  connector: { width: 2, flex: 1, minHeight: 18, marginTop: 4, borderRadius: 1 },
  stepLabel: { fontSize: typography.fontSize.base, lineHeight: 24, ...font('semibold') },
  stepNote: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  liveWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  liveDot: { width: 12, height: 12, borderRadius: 6 },
  amountBox: { marginTop: spacing[5], padding: spacing[4], borderRadius: borderRadius.lg, gap: 2 },
  amountLabel: { fontSize: typography.fontSize.sm, ...font() },
  amount: { fontSize: typography.fontSize['3xl'], ...font('heading') },
  small: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
  cardTitle: { fontSize: typography.fontSize.lg, ...font('heading') },
  body: { marginTop: 4, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[4] },
  reasonChip: { paddingHorizontal: 14, height: 36, borderRadius: borderRadius.full, justifyContent: 'center' },
  reasonChipText: { fontSize: typography.fontSize.sm, ...font('medium') },
  input: {
    marginTop: spacing[3],
    minHeight: 100,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    fontSize: typography.fontSize.base,
    textAlignVertical: 'top',
    ...font(),
  },
  note: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] },
  error: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...font('medium') },
  submit: { marginTop: spacing[5], height: 52, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#ffffff', fontSize: typography.fontSize.base, ...font('semibold') },
  hint: { marginTop: spacing[5], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', ...font() },
  groupTitle: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], marginLeft: spacing[1], ...font('semibold') },
  earlierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3] },
  earlierTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  earlierAmount: { fontSize: typography.fontSize.base, ...font('semibold') },
  divider: { height: StyleSheet.hairlineWidth },
});
