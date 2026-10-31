import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Check, CheckCircle, CircleDashed, Info, XCircle } from '@unifesto/unicon/react-native';
import Skeleton from '../../src/components/Skeleton';
import CosmosScreen from '../../src/components/ui/CosmosScreen';
import ShadeCard from '../../src/components/ui/ShadeCard';
import { GUTTER } from '../../src/components/home/Section';
import { Button } from '../../src/components/ui';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import {
  requestRefund,
  getMyRefunds,
  OPEN_REFUND_STATUSES,
  type RefundRequest,
  type RefundStatus,
} from '../../src/lib/api/refunds';
import { CardBackdrop } from '../../src/components/ui/CardSurface';
import { cosmosCardRadius, cosmosFont, cosmosRadius, displayTracking, useCosmos } from '../../src/theme/cosmos';

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
              : status === 'PENDING_ADMIN' || status === 'PROCESSING'
                ? 'current'
                : 'pending',
      at: adminActionAt,
      note: status === 'REJECTED' && adminActionAt ? adminNote : undefined,
    },
  ];
}

/** Short headline + tone for the status line. */
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
  const c = useCosmos();
  const insets = useSafeAreaInsets();
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
    const res = await requestRefund({ registrationId, reason: reason.trim() });
    setSubmitting(false);
    if (res.ok) {
      setReason('');
      await load();
    } else {
      setError(res.error || 'Could not submit your request.');
    }
  };

  const toneColor = (tone: 'info' | 'success' | 'error') =>
    tone === 'success' ? c.success : tone === 'error' ? c.danger : c.warn;

  return (
    <>
      <Stack.Screen options={{ title: 'Refund', headerShown: true }} />

      {loading ? (
        <CosmosScreen contentContainerStyle={[styles.pad, { gap: spacing[4] }]}>
          <Skeleton width="70%" height={26} borderRadius={8} />
          <Skeleton width="100%" height={220} borderRadius={cosmosCardRadius} />
        </CosmosScreen>
      ) : (
        <CosmosScreen keyboard keyboardDismissMode="interactive" bottom={spacing[10] + insets.bottom} contentContainerStyle={styles.pad}>
            <Text style={[styles.eventTitle, { color: c.text }]} accessibilityRole="header">{latest?.event?.title || eventTitle}</Text>

            {/* ── Progress of the latest request: the page's hero, on the money's ivory shade ── */}
            {latest ? (() => {
              const summary = statusSummary(latest.status);
              const tone = toneColor(summary.tone);
              return (
                <ShadeCard tone="ivory">
                  <View style={styles.status}>
                    {summary.tone === 'success' ? (
                      <Check size={14} color={tone} weight="bold" />
                    ) : (
                      <View style={[styles.statusDot, { backgroundColor: tone }]} />
                    )}
                    <Text style={[styles.statusText, { color: tone }]}>{summary.label}</Text>
                  </View>

                  {latest.status === 'APPROVED' ? (
                    <View style={styles.amountBlock}>
                      <Text style={[styles.amountLabel, { color: c.soft }]}>Amount refunded</Text>
                      <Text style={[styles.amount, { color: c.ivory }]}>
                        ₹{toNumber(latest.approvedAmount ?? latest.cashRefunded).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text style={[styles.small, { color: c.soft }]}>
                        Back to your original payment method in 5 to 7 business days.
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ marginTop: spacing[5] }}>
                    {deriveSteps(latest).map((step, i, arr) => (
                      <StepRow key={step.label} step={step} isLast={i === arr.length - 1} />
                    ))}
                  </View>

                  <Text style={[styles.small, { color: c.soft, marginTop: spacing[4] }]}>
                    Your reason: “{latest.reason}”
                  </Text>
                </ShadeCard>
              );
            })() : null}

            {/* ── Request form ── */}
            {showForm ? (
              <View style={[styles.card, latest && { marginTop: spacing[4] }]}>
                <CardBackdrop shape={styles.card} />
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  {latest ? 'Request another refund' : 'Request a refund'}
                </Text>
                <Text style={[styles.body, { color: c.soft }]}>
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
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.reasonChip,
                          { backgroundColor: active ? c.primary : undefined, borderColor: active ? c.primary : c.input, transform: [{ scale: pressed ? 0.96 : 1 }] },
                        ]}
                      >
                        <Text style={[styles.reasonChipText, { color: active ? c.primaryFg : c.text }]}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  accessibilityLabel="Reason for the refund"
                  value={reason}
                  onChangeText={(v) => {
                    setReason(v);
                    setError('');
                  }}
                  placeholder="Tell us a little more"
                  placeholderTextColor={c.muted}
                  selectionColor={c.text}
                  multiline
                  editable={!submitting}
                  style={[styles.input, { backgroundColor: c.card, borderColor: c.input, color: c.text }]}
                />

                <View style={styles.note}>
                  <Info size={18} color={c.muted} />
                  <Text style={[styles.small, { color: c.muted, flex: 1 }]}>
                    Only the ticket price is refunded; booking fees are not. Approved refunds go back to your original payment method in 5 to 7 business days.
                  </Text>
                </View>

                {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

                <Button label="Submit request" size="lg" fullWidth loading={submitting} onPress={submit} style={{ marginTop: spacing[5] }} />
              </View>
            ) : null}

            {!showForm && hasOpen ? (
              <Text style={[styles.hint, { color: c.muted }]}>
                We'll email you when this request moves forward.
              </Text>
            ) : null}
            {!showForm && !hasOpen && eventCompleted ? (
              <Text style={[styles.hint, { color: c.muted }]}>
                This event has ended, so new refund requests can't be made.
              </Text>
            ) : null}

            {/* ── Earlier requests (the latest is shown above) ── */}
            {earlier.length > 0 ? (
              <View style={{ marginTop: spacing[8] }}>
                <Text style={[styles.groupTitle, { color: c.muted }]}>Earlier requests</Text>
                <View style={[styles.card, { paddingVertical: spacing[1] }]}>
                  <CardBackdrop shape={styles.card} />
                  {earlier.map((r, i) => {
                    const sum = statusSummary(r.status);
                    return (
                      <View key={r.id}>
                        <View style={styles.earlierRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.earlierTitle, { color: c.text }]}>{sum.label}</Text>
                            <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
                              {formatWhen(r.createdAt)}
                            </Text>
                          </View>
                          {r.status === 'APPROVED' ? (
                            <Text style={[styles.earlierAmount, { color: c.ivory }]}>
                              ₹{toNumber(r.approvedAmount ?? r.cashRefunded).toLocaleString('en-IN')}
                            </Text>
                          ) : null}
                        </View>
                        {i < earlier.length - 1 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
        </CosmosScreen>
      )}
    </>
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
  const c = useCosmos();
  const muted = step.state === 'pending' || step.state === 'skipped';
  const mark =
    step.state === 'done' ? (
      <CheckCircle size={24} color={c.success} weight="fill" />
    ) : step.state === 'rejected' ? (
      <XCircle size={24} color={c.danger} weight="fill" />
    ) : step.state === 'current' ? (
      <LiveDot color={c.warn} />
    ) : (
      <CircleDashed size={24} color={c.muted} />
    );

  return (
    <View style={styles.stepRow}>
      <View style={styles.rail}>
        {mark}
        {!isLast ? (
          <View style={[styles.connector, { backgroundColor: step.state === 'done' ? c.soft : c.border }]} />
        ) : null}
      </View>
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : spacing[5] }}>
        <Text style={[styles.stepLabel, { color: muted ? c.muted : c.text }]}>
          {step.label}
          {step.state === 'skipped' ? ' (not reached)' : ''}
          {step.state === 'current' ? <Text style={{ color: c.warn }}>{'  In progress'}</Text> : null}
        </Text>
        {step.at ? <Text style={[styles.small, { color: c.muted, marginTop: 2 }]}>{formatWhen(step.at)}</Text> : null}
        {step.note ? <Text style={[styles.stepNote, { color: c.soft }]}>“{step.note}”</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  eventTitle: {
    fontSize: typography.fontSize['2xl'],
    lineHeight: 30,
    marginBottom: spacing[5],
    ...cosmosFont.display,
    letterSpacing: displayTracking(24),
  },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  stepRow: { flexDirection: 'row', gap: spacing[3] },
  rail: { alignItems: 'center', width: 24 },
  connector: { width: 2, flex: 1, minHeight: 18, marginTop: 4, borderRadius: 1 },
  stepLabel: { fontSize: typography.fontSize.base, lineHeight: 24, ...cosmosFont.strong },
  stepNote: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  liveWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  liveDot: { width: 12, height: 12, borderRadius: 6 },
  amountBlock: { marginTop: spacing[4], gap: 2 },
  amountLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  amount: { fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  small: { fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
  cardTitle: { fontSize: typography.fontSize.lg, ...cosmosFont.strong },
  body: { marginTop: 4, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[4] },
  reasonChip: { paddingHorizontal: 14, height: 36, borderRadius: borderRadius.full, borderWidth: 1, justifyContent: 'center' },
  reasonChipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  input: {
    marginTop: spacing[3],
    minHeight: 100,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    padding: spacing[4],
    fontSize: typography.fontSize.base,
    textAlignVertical: 'top',
    ...cosmosFont.body,
  },
  note: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] },
  error: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  hint: { marginTop: spacing[5], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', ...cosmosFont.body },
  groupTitle: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], marginLeft: spacing[1], ...cosmosFont.strong },
  earlierRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3] },
  earlierTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  earlierAmount: { fontSize: typography.fontSize.base, ...cosmosFont.figure },
  divider: { height: StyleSheet.hairlineWidth },
});
