import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  At,
  Check,
  CheckCircle,
  EnvelopeSimple,
  Minus,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  Sparkle,
  Ticket as TicketIcon,
  User,
  XCircle,
} from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import AttendeeForm from '../AttendeeForm';
import CustomFieldInput from '../CustomFieldInput';
import { SettingsGroup } from '../profile/SettingsGroup';
import FormRow from '../profile/FormRow';
import { displayFieldValue, isSelfComplete, type EventRegistration, type TicketState } from '../../hooks/useEventRegistration';
import { relativeWhen } from '../../utils/eventFormat';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

const TINT = 'rgba(52,145,255,0.14)';

/** ₹1,200 or ₹1,062.50: whole amounts stay clean, paise show when present. */
export function money(symbol: string, n: number) {
  const whole = Math.abs(n % 1) < 0.005;
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function Heading({ children, sub }: { children: string; sub?: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.heading}>
      <Text style={[styles.h1, { color: tokens.text }]}>{children}</Text>
      {sub ? <Text style={[styles.sub, { color: tokens.textSecondary }]}>{sub}</Text> : null}
    </View>
  );
}

function Label({ children, right }: { children: string; right?: React.ReactNode }) {
  const tokens = useTokens();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: tokens.textMuted }]}>{children}</Text>
      {right}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.card, style]}>
      <CardBackdrop shape={[styles.card, style]} />
      {children}
    </View>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: tone ?? (strong ? tokens.text : tokens.textSecondary) }, strong && font('semibold')]}>{label}</Text>
      <Text
        style={[
          styles.lineValue,
          { color: tone ?? tokens.text },
          strong && { fontSize: typography.fontSize.xl, ...font('heading') },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Step 1: ticket ──────────────────────────────────────────────────────────

export function TicketStep({ r }: { r: EventRegistration }) {
  const tokens = useTokens();
  const event = r.event!;
  const where = event.venueName || event.city;
  return (
    <View>
      <Heading sub={[relativeWhen(event.startDateTime), where].filter(Boolean).join(' · ')}>Pick your ticket</Heading>
      <View style={{ gap: spacing[3] }}>
        {r.ticketStates.map((s) => (
          <TicketCard key={s.ticket.id} s={s} selected={r.selectedTicket?.id === s.ticket.id} onPress={() => r.selectTicket(s.ticket)} />
        ))}
      </View>
      {r.ticketStates.every((s) => !s.selectable) ? (
        <Text style={[styles.hint, { color: tokens.textMuted }]}>None of these tickets can be booked right now.</Text>
      ) : null}
      {r.selectedTicket ? <ConfirmCheck checked={r.confirmed} onToggle={() => r.setConfirmed(!r.confirmed)} /> : null}
    </View>
  );
}

/** Required tick before leaving step 1; Continue stays disabled until it's on. */
function ConfirmCheck({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const tokens = useTokens();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={6}
      style={styles.confirm}
    >
      <View
        style={[
          styles.checkbox,
          checked ? { backgroundColor: tokens.accent, borderColor: tokens.accent } : { borderColor: tokens.borderStrong },
        ]}
      >
        {checked ? <Check size={14} color="#ffffff" weight="bold" /> : null}
      </View>
      <Text style={[styles.confirmText, { color: tokens.textSecondary }]}>
        I confirm this is the ticket I want and agree to the{' '}
        <Text
          style={{ color: tokens.accent, ...font('semibold') }}
          onPress={() => Linking.openURL('https://unifesto.app/terms').catch(() => {})}
          suppressHighlighting
        >
          Terms
        </Text>
        , including the organiser's refund rules.
      </Text>
    </Pressable>
  );
}

function TicketCard({ s, selected, onPress }: { s: TicketState; selected: boolean; onPress: () => void }) {
  const tokens = useTokens();
  const t = s.ticket;
  const status = s.owned
    ? { text: 'You already have this ticket', color: tokens.success }
    : s.blocked
      ? { text: 'Not available with your current ticket', color: tokens.textMuted }
      : s.waitlistOnly
        ? { text: 'Sold out · join the waiting list', color: tokens.warning }
        : !s.available
          ? { text: s.spotsLeft <= 0 ? 'Sold out' : 'Not on sale right now', color: tokens.textMuted }
          : s.spotsLeft <= 10
            ? { text: `Only ${s.spotsLeft} left`, color: tokens.warning }
            : null;
  const team = t.type === 'group' ? (t.max_purchase > t.min_purchase ? `Team of ${t.min_purchase} to ${t.max_purchase}` : `Team of ${t.min_purchase}`) : null;
  const per = t.price > 0 && t.price_type === 'per_person' ? 'per person' : t.price > 0 && t.price_type === 'per_group' ? 'per team' : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!s.selectable}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !s.selectable }}
      accessibilityLabel={`${t.name}, ${t.price === 0 ? 'free' : money(s.symbol, t.price)}`}
      style={({ pressed }) => [
        styles.ticket,
        { backgroundColor: selected ? TINT : tokens.elevated, opacity: !s.selectable ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.ticketTop}>
        <Text style={[styles.ticketName, { color: tokens.text }]}>{t.name}</Text>
        <View style={styles.priceCol}>
          <Text style={[styles.ticketPrice, { color: selected ? tokens.accent : tokens.text }]}>
            {t.price === 0 ? 'Free' : money(s.symbol, t.price)}
          </Text>
          {per ? <Text style={[styles.per, { color: tokens.textMuted }]}>{per}</Text> : null}
        </View>
      </View>
      {t.description ? (
        <Text style={[styles.ticketDesc, { color: tokens.textSecondary }]} numberOfLines={3}>{t.description}</Text>
      ) : null}
      {team || status || selected ? (
        <View style={styles.ticketFoot}>
          <View style={{ flex: 1, gap: 2 }}>
            {team ? <Text style={[styles.meta, { color: tokens.textSecondary }]}>{team}</Text> : null}
            {status ? <Text style={[styles.meta, { color: status.color, ...font('semibold') }]}>{status.text}</Text> : null}
          </View>
          {selected ? <CheckCircle size={24} color={tokens.accent} weight="fill" /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Step 2: details ─────────────────────────────────────────────────────────

export function DetailsStep({ r }: { r: EventRegistration }) {
  const tokens = useTokens();
  const adjustable = r.isGroup && r.teamMax > r.teamMin;
  const selfDone = r.attendees[0] ? isSelfComplete(r.attendees[0]) : false;
  const sub = r.isGroup
    ? 'You invite your teammates by email after booking, and they fill in their own details.'
    : selfDone
      ? 'A few more details for this ticket.'
      : 'This is who the ticket is for.';

  return (
    <View>
      <Heading sub={sub}>
        {r.isGroup ? 'Your team' : 'Your details'}
      </Heading>

      {adjustable ? (
        <Card style={styles.stepperCard}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>Team size</Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              {r.teamMin} to {r.teamMax} people
            </Text>
          </View>
          <View style={styles.stepper}>
            <StepperButton icon={<Minus size={20} color={tokens.text} weight="bold" />} disabled={r.quantity <= r.teamMin} onPress={() => r.changeQuantity(r.quantity - 1)} label="Fewer people" />
            <Text style={[styles.stepperValue, { color: tokens.text }]}>{r.quantity}</Text>
            <StepperButton icon={<Plus size={20} color={tokens.text} weight="bold" />} disabled={r.quantity >= r.teamMax} onPress={() => r.changeQuantity(r.quantity + 1)} label="More people" />
          </View>
        </Card>
      ) : null}

      {r.attendees.map((a, index) => {
        const isSelf = index === 0;
        const invited = r.invitedIndices.has(index);
        // Teammates are invited by email after booking (see the note below).
        if (invited) return null;
        // Personal details stay hidden once complete (Review still lists them);
        // the form only opens when a profile field is missing.
        const hideSelfDetails = isSelf && isSelfComplete(a);
        if (hideSelfDetails && r.memberFields.length === 0) return null;

        return (
          <View key={index} style={[styles.person, index === 0 && !adjustable && { marginTop: 0 }]}>
            {hideSelfDetails ? null : (
              <>
                <AttendeeForm
                  attendee={a}
                  index={index}
                  onChange={r.changeAttendee}
                  onFillFromProfile={r.attendees.length > 1 ? () => r.fillFromProfile(index) : undefined}
                  showTitle={false}
                />
                {isSelf ? (
                  <Pressable onPress={() => r.setAlsoUpdateProfile(!r.alsoUpdateProfile)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: r.alsoUpdateProfile }}>
                    <View style={[styles.box, { backgroundColor: r.alsoUpdateProfile ? tokens.accent : tokens.fillStrong }]}>
                      {r.alsoUpdateProfile ? <Check size={14} color="#ffffff" weight="bold" /> : null}
                    </View>
                    <Text style={[styles.body, { color: tokens.textSecondary, flex: 1 }]}>Also save these to my profile</Text>
                  </Pressable>
                ) : null}
              </>
            )}

            {r.memberFields.length > 0 ? (
              <View style={styles.questions}>
                {r.memberFields.map((f) => (
                  <CustomFieldInput key={f.id} field={f} value={a.customFields?.[f.id]} onChange={(v) => r.changeCustomField(index, f.id, v)} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {r.invitedIndices.size > 0 ? (
        <View style={styles.person}>
          <Label>{r.invitedIndices.size === 1 ? 'Your teammate' : `Your ${r.invitedIndices.size} teammates`}</Label>
          <Card style={styles.inviteNote}>
            <PaperPlaneTilt size={22} color={tokens.accent} weight="duotone" />
            <Text style={[styles.body, { color: tokens.textSecondary, flex: 1 }]}>
              After you book, invite each of them by email from Manage group. They claim their seat and fill in their own details.
            </Text>
          </Card>
        </View>
      ) : null}

      {r.teamFields.length > 0 ? (
        <View style={styles.person}>
          <Label>About your team</Label>
          {r.teamFields.map((f) => (
            <CustomFieldInput key={f.id} field={f} value={r.teamFieldValues[f.id]} onChange={(v) => r.changeTeamField(f.id, v)} />
          ))}
        </View>
      ) : null}

      {!r.canContinue ? (
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          Fill in every required detail{r.isGroup ? ' for each person you add' : ''} to continue. Mobile numbers need 10 digits.
        </Text>
      ) : null}
    </View>
  );
}

function StepperButton({ icon, disabled, onPress, label }: { icon: React.ReactNode; disabled: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.stepperBtn, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

// ── Step 3: review ──────────────────────────────────────────────────────────

export function ReviewStep({ r }: { r: EventRegistration }) {
  const tokens = useTokens();
  const event = r.event!;
  const t = r.selectedTicket!;
  const where = event.venueName || event.city;

  return (
    <View>
      <Heading sub="Make sure everything looks right before you confirm.">Almost there</Heading>

      <Card>
        <View style={styles.reviewHead}>
          <TicketIcon size={26} color={tokens.accent} weight="duotone" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: tokens.text }]} numberOfLines={2}>{event.title}</Text>
            <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>
              {[relativeWhen(event.startDateTime), where].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <Line label="Ticket" value={t.name} />
        <Line label={r.isGroup ? 'Team size' : 'People'} value={`${r.quantity}`} />
        <Line label="Total" value={r.total === 0 ? 'Free' : money(r.symbol, r.total)} />
      </Card>

      <View style={styles.person}>
        <Label>{r.attendees.length > 1 ? 'People' : 'Attendee'}</Label>
        <Card style={{ gap: spacing[4] }}>
          {r.attendees.map((a, index) => {
            const invited = r.invitedIndices.has(index);
            return (
              <View key={index} style={styles.reviewPerson}>
                {invited ? (
                  <EnvelopeSimple size={22} color={tokens.textMuted} weight="duotone" />
                ) : (
                  <User size={22} color={tokens.accent} weight="duotone" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: invited ? tokens.textSecondary : tokens.text }]}>
                    {invited ? `Person ${index + 1}` : a.name}
                  </Text>
                  <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={2}>
                    {invited ? 'You invite them after this' : `${a.email} · +91 ${a.mobile} · ${a.gender}`}
                  </Text>
                  {!invited
                    ? r.memberFields.map((f) => {
                        const v = displayFieldValue(f, a.customFields?.[f.id]);
                        return v ? (
                          <Text key={f.id} style={[styles.meta, { color: tokens.textSecondary }]}>
                            {f.label}: <Text style={{ color: tokens.text }}>{v}</Text>
                          </Text>
                        ) : null;
                      })
                    : null}
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      {r.teamFields.length > 0 ? (
        <View style={styles.person}>
          <Label>About your team</Label>
          <Card style={{ gap: spacing[2] }}>
            {r.teamFields.map((f) => (
              <Line key={f.id} label={f.label} value={displayFieldValue(f, r.teamFieldValues[f.id]) || 'Not answered'} />
            ))}
          </Card>
        </View>
      ) : null}
    </View>
  );
}

// ── Step 4: pay ─────────────────────────────────────────────────────────────

export function PaymentStep({ r, waitlist }: { r: EventRegistration; waitlist: boolean }) {
  const tokens = useTokens();

  if (waitlist) {
    return (
      <View style={styles.center}>
        <Sparkle size={56} color={tokens.warning} weight="duotone" />
        <Text style={[styles.h1, styles.centerText, { color: tokens.text, marginTop: spacing[4] }]}>Join the waiting list</Text>
        <Text style={[styles.sub, styles.centerText, { color: tokens.textSecondary }]}>
          {r.selectedTicket?.name} is sold out. We'll hold your place in line and charge nothing now. If the organiser lets you in, you'll get an email.
        </Text>
      </View>
    );
  }

  if (r.total === 0) {
    return (
      <View style={styles.center}>
        <CheckCircle size={56} color={tokens.success} weight="duotone" />
        <Text style={[styles.h1, styles.centerText, { color: tokens.text, marginTop: spacing[4] }]}>Nothing to pay</Text>
        <Text style={[styles.sub, styles.centerText, { color: tokens.textSecondary }]}>
          This one's free. Confirm and your ticket is ready right away.
        </Text>
      </View>
    );
  }

  const canApply = !!r.couponInput.trim() && !r.applyingCoupon;
  return (
    <View>
      <Heading>Payment</Heading>

      <Label>Discount code</Label>
      {r.appliedCoupon ? (
        <View style={[styles.coupon, { backgroundColor: TINT }]}>
          <CheckCircle size={22} color={tokens.accent} weight="fill" />
          <Text style={[styles.couponCode, { color: tokens.accent }]}>{r.appliedCoupon.code} applied</Text>
          <Pressable onPress={r.removeCoupon} hitSlop={10} accessibilityLabel="Remove discount code">
            <XCircle size={22} color={tokens.textSecondary} weight="fill" />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.coupon, { backgroundColor: tokens.elevated }]}>
          <TextInput
            value={r.couponInput}
            onChangeText={(v) => r.setCouponInput(v.toUpperCase())}
            placeholder="Have a code?"
            placeholderTextColor={tokens.textMuted}
            selectionColor={tokens.accent}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={r.applyCoupon}
            style={[styles.couponInput, { color: tokens.text }]}
          />
          {r.applyingCoupon ? (
            <ActivityIndicator color={tokens.accent} />
          ) : (
            <Text
              onPress={canApply ? r.applyCoupon : undefined}
              style={[styles.link, { color: canApply ? tokens.accent : tokens.textMuted }]}
              accessibilityRole="button"
            >
              Apply
            </Text>
          )}
        </View>
      )}
      {r.couponError ? <Text style={[styles.error, { color: tokens.danger }]}>{r.couponError}</Text> : null}

      <Card style={{ marginTop: spacing[6], gap: spacing[3] }}>
        <Line label={`${r.selectedTicket?.name}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`} value={money(r.symbol, r.basePrice)} />
        {r.discount > 0 ? <Line label={`Discount (${r.appliedCoupon?.code})`} value={`−${money(r.symbol, r.discount)}`} tone={tokens.success} /> : null}
        {r.feePercent > 0 ? <Line label={`Processing fee (${r.feePercent}%)`} value={money(r.symbol, r.fee)} /> : null}
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <Line label="Total" value={money(r.symbol, r.total)} strong />
      </Card>

      <View style={styles.secure}>
        <ShieldCheck size={18} color={tokens.textMuted} weight="duotone" />
        <Text style={[styles.meta, { color: tokens.textMuted }]}>Payments are processed securely by Razorpay.</Text>
      </View>
    </View>
  );
}

// ── Profile gate ────────────────────────────────────────────────────────────

const GATE_GENDERS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'NON_BINARY' },
];

export function ProfileGate({ r }: { r: EventRegistration }) {
  const tokens = useTokens();
  const g = r.gate;
  return (
    <View>
      <Heading sub="We need your name, username and gender to register you and put the right name on your ticket. You only do this once.">
        One quick step
      </Heading>
      <SettingsGroup>
        <FormRow
          icon={<User size={24} color={tokens.accent} weight="duotone" />}
          value={g.name}
          onChangeText={g.setName}
          placeholder="Full name"
          autoCapitalize="words"
          textContentType="name"
          returnKeyType="next"
        />
        <FormRow
          icon={<At size={24} color={tokens.accent} weight="duotone" />}
          value={g.username}
          onChangeText={g.onUsernameChange}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          trailing={
            g.checking ? (
              <ActivityIndicator size="small" color={tokens.textMuted} />
            ) : g.usernameError ? (
              <XCircle size={20} color={tokens.danger} weight="fill" />
            ) : g.usernameAvailable ? (
              <CheckCircle size={20} color={tokens.success} weight="fill" />
            ) : null
          }
        />
      </SettingsGroup>
      {g.usernameError ? <Text style={[styles.error, { color: tokens.danger }]}>{g.usernameError}</Text> : null}

      <View style={{ marginTop: spacing[6] }}>
        <Label>Gender</Label>
        <View style={styles.chips}>
          {GATE_GENDERS.map((o) => {
            const active = g.gender === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => g.setGender(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={({ pressed }) => [styles.chip, { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
              >
                {!active ? <CardBackdrop shape={styles.chip} /> : null}
                <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {g.error ? <Text style={[styles.error, { color: tokens.danger, marginTop: spacing[4] }]}>{g.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: spacing[6] },
  h1: { fontSize: typography.fontSize['2xl'], letterSpacing: -0.4, ...font('heading') },
  sub: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3], minHeight: 32 },
  label: { fontSize: typography.fontSize.sm, ...font('semibold') },
  link: { fontSize: typography.fontSize.sm, ...font('semibold') },
  card: { borderRadius: borderRadius.xl, padding: spacing[5] },
  cardTitle: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...font() },
  body: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  confirm: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginTop: spacing[6] },
  checkbox: { width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  confirmText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  hint: { marginTop: spacing[6], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', ...font() },
  error: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font() },
  divider: { height: 1, marginVertical: spacing[4] },
  // ticket
  ticket: { borderRadius: borderRadius.xl, padding: spacing[5] },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  ticketName: { flex: 1, fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.25, ...font('heading') },
  priceCol: { alignItems: 'flex-end' },
  ticketPrice: { fontSize: typography.fontSize.lg, ...font('heading') },
  per: { fontSize: 12, ...font() },
  ticketDesc: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  ticketFoot: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing[3], gap: spacing[3] },
  // details
  stepperCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  stepperBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: typography.fontSize.xl, fontVariant: ['tabular-nums'], ...font('heading') },
  person: { marginTop: spacing[6] },
  inviteNote: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  questions: { marginTop: spacing[2] },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: -spacing[1], marginBottom: spacing[2] },
  box: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  // review
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  reviewPerson: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  personName: { fontSize: typography.fontSize.base, marginBottom: 2, ...font('semibold') },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[4], minHeight: 26 },
  lineLabel: { flexShrink: 1, fontSize: typography.fontSize.sm, ...font() },
  lineValue: { fontSize: typography.fontSize.sm, textAlign: 'right', ...font('semibold') },
  // pay
  center: { alignItems: 'center', paddingTop: spacing[10], paddingHorizontal: spacing[4] },
  centerText: { textAlign: 'center' },
  coupon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 52,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[5],
  },
  couponInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, letterSpacing: 1, ...font('semibold') },
  couponCode: { flex: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  secure: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[5], justifyContent: 'center' },
  // gate
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[5], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
