import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Check,
  CheckCircle,
  EnvelopeSimple,
  Minus,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  Sparkle,
  User,
  XCircle,
} from '@unifesto/unicon/react-native';
import AttendeeForm from '../AttendeeForm';
import CustomFieldInput from '../CustomFieldInput';
import AuthField from '../auth/AuthField';
import PressableScale from '../ui/PressableScale';
import { visibleFields } from '../../utils/formQuestions';
import { displayFieldValue, isSelfComplete, type EventRegistration, type TicketState } from '../../hooks/useEventRegistration';
import { relativeWhen } from '../../utils/eventFormat';
import { selectionTick } from '../../lib/haptics';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';

/** ₹1,200 or ₹1,062.50: whole amounts stay clean, paise show when present. */
export function money(symbol: string, n: number) {
  const whole = Math.abs(n % 1) < 0.005;
  return `${symbol}${n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

/** The step's one title (Michroma, a VoiceOver heading) and a quiet line under it. */
function Heading({ children, sub }: { children: string; sub?: string }) {
  const c = useCosmos();
  return (
    <View style={styles.heading}>
      <Text style={[styles.h1, { color: c.text }]} accessibilityRole="header">{children}</Text>
      {sub ? <Text style={[styles.sub, { color: c.soft }]}>{sub}</Text> : null}
    </View>
  );
}

function Label({ children }: { children: string }) {
  const c = useCosmos();
  return <Text style={[styles.label, { color: c.muted }]} accessibilityRole="header">{children}</Text>;
}

/** Borderless solid card: lifts off the black (dark) or grey (light) ground. */
function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useCosmos();
  return <View style={[styles.card, { backgroundColor: c.raised }, style]}>{children}</View>;
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  const c = useCosmos();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: tone ?? (strong ? c.text : c.soft) }, strong && cosmosFont.strong]}>{label}</Text>
      <Text style={[styles.lineValue, { color: tone ?? c.text }, strong && styles.lineTotal]}>{value}</Text>
    </View>
  );
}

/** Square-ish tick box: silver when on. The whole row is the target. */
function Checkbox({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const c = useCosmos();
  return (
    <Pressable
      onPress={() => {
        selectionTick();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.checkRow}
    >
      <View style={[styles.box, checked ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.outline }]}>
        {checked ? <Check size={14} color={c.primaryFg} weight="bold" /> : null}
      </View>
      <Text style={[styles.body, { color: c.soft, flex: 1 }]}>{children}</Text>
    </Pressable>
  );
}

/** Ticket-stub perforation: a dashed rule with notches cut into both card edges. */
function Perforation() {
  const c = useCosmos();
  return (
    <View style={styles.perfRow} importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, styles.notchLeft, { backgroundColor: c.bg }]} />
      <View style={[styles.perf, { borderColor: c.border }]} />
      <View style={[styles.notch, styles.notchRight, { backgroundColor: c.bg }]} />
    </View>
  );
}

// ── Step 1: ticket ──────────────────────────────────────────────────────────

export function TicketStep({ r }: { r: EventRegistration }) {
  const c = useCosmos();
  const event = r.event!;
  const where = event.venueName || event.city;
  const none = r.ticketStates.every((s) => !s.selectable);
  return (
    <View>
      <Heading sub={[relativeWhen(event.startDateTime), where].filter(Boolean).join(' · ')}>Pick your ticket</Heading>
      <View style={{ gap: spacing[3] }} accessibilityRole="radiogroup">
        {r.ticketStates.map((s) => (
          <TicketOption
            key={s.ticket.id}
            s={s}
            selected={r.selectedTicket?.id === s.ticket.id}
            onPress={() => {
              if (r.selectedTicket?.id !== s.ticket.id) selectionTick();
              r.selectTicket(s.ticket);
            }}
          />
        ))}
      </View>
      {none ? <Text style={[styles.hint, { color: c.muted }]}>None of these tickets can be booked right now.</Text> : null}
      {r.selectedTicket ? (
        <View style={styles.confirm}>
          <Checkbox checked={r.confirmed} onToggle={() => r.setConfirmed(!r.confirmed)}>
            I confirm this is the ticket I want and agree to the Terms, including the organiser's refund rules.
          </Checkbox>
          <Pressable
            onPress={() => Linking.openURL('https://unifesto.app/terms').catch(() => {})}
            accessibilityRole="link"
            hitSlop={8}
            style={({ pressed }) => [styles.termsLink, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.linkText, { color: c.text }]}>Read the Terms</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TicketOption({ s, selected, onPress }: { s: TicketState; selected: boolean; onPress: () => void }) {
  const c = useCosmos();
  const t = s.ticket;
  const status = s.owned
    ? { text: 'You already have this ticket', color: c.success }
    : s.blocked
      ? { text: 'Not available with your current ticket', color: c.muted }
      : s.iosBlocked
        ? { text: "Paid tickets for online events aren't available in the iOS app", color: c.muted }
        : s.waitlistOnly
          ? { text: 'Sold out · join the waiting list', color: c.warn }
          : !s.available
            ? { text: s.spotsLeft <= 0 ? 'Sold out' : 'Not on sale right now', color: c.muted }
            : s.spotsLeft <= 10
              ? { text: `Only ${s.spotsLeft} left`, color: c.warn }
              : null;
  const team = t.type === 'group' ? (t.max_purchase > t.min_purchase ? `Team of ${t.min_purchase} to ${t.max_purchase}` : `Team of ${t.min_purchase}`) : null;
  const per = t.price > 0 && t.price_type === 'per_person' ? 'per person' : t.price > 0 && t.price_type === 'per_group' ? 'per team' : null;
  const price = t.price === 0 ? 'Free' : money(s.symbol, t.price);

  return (
    <PressableScale
      onPress={onPress}
      disabled={!s.selectable}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !s.selectable }}
      accessibilityLabel={[t.name, price, per, team, status?.text].filter(Boolean).join(', ')}
      style={[
        styles.ticket,
        {
          backgroundColor: c.raised,
          // Always 1.5pt so selecting never shifts the layout; only the colour changes.
          borderColor: selected ? c.primary : 'transparent',
          opacity: s.selectable ? 1 : 0.55,
        },
      ]}
    >
      <View style={styles.ticketTop}>
        <Text style={[styles.ticketName, { color: c.text }]}>{t.name}</Text>
        <View style={styles.priceCol}>
          <Text style={[styles.ticketPrice, { color: c.text }]}>{price}</Text>
          {per ? <Text style={[styles.per, { color: c.muted }]}>{per}</Text> : null}
        </View>
      </View>
      {t.description ? (
        <Text style={[styles.ticketDesc, { color: c.soft }]} numberOfLines={3}>{t.description}</Text>
      ) : null}
      {team || status || selected ? (
        <View style={styles.ticketFoot}>
          <View style={{ flex: 1, gap: 2 }}>
            {team ? <Text style={[styles.meta, { color: c.soft }]}>{team}</Text> : null}
            {status ? <Text style={[styles.meta, { color: status.color }, cosmosFont.strong]}>{status.text}</Text> : null}
          </View>
          {selected ? <CheckCircle size={24} color={c.primary} weight="fill" /> : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

// ── Step 2: details ─────────────────────────────────────────────────────────

export function DetailsStep({ r }: { r: EventRegistration }) {
  const c = useCosmos();
  const adjustable = r.isGroup && r.teamMax > r.teamMin;
  const selfDone = r.attendees[0] ? isSelfComplete(r.attendees[0]) : false;
  const sub = r.isGroup
    ? 'You invite your teammates by email after booking, and they fill in their own details.'
    : selfDone
      ? 'A few more details for this ticket.'
      : 'This is who the ticket is for.';

  return (
    <View>
      <Heading sub={sub}>{r.isGroup ? 'Your team' : 'Your details'}</Heading>

      {adjustable ? (
        <Card style={styles.stepperCard}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Team size</Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {r.teamMin} to {r.teamMax} people
            </Text>
          </View>
          <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel="Team size" accessibilityValue={{ min: r.teamMin, max: r.teamMax, now: r.quantity }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment' && r.quantity < r.teamMax) r.changeQuantity(r.quantity + 1);
              if (e.nativeEvent.actionName === 'decrement' && r.quantity > r.teamMin) r.changeQuantity(r.quantity - 1);
            }}
          >
            <StepperButton icon={<Minus size={22} color={c.text} weight="bold" />} disabled={r.quantity <= r.teamMin} onPress={() => r.changeQuantity(r.quantity - 1)} />
            <Text style={[styles.stepperValue, { color: c.text }]}>{r.quantity}</Text>
            <StepperButton icon={<Plus size={22} color={c.text} weight="bold" />} disabled={r.quantity >= r.teamMax} onPress={() => r.changeQuantity(r.quantity + 1)} />
          </View>
        </Card>
      ) : null}

      {r.attendees.map((a, index) => {
        const isSelf = index === 0;
        // Teammates are invited by email after booking (see the note below).
        if (r.invitedIndices.has(index)) return null;
        // Personal details stay hidden once complete (Review still lists them);
        // the form only opens when a profile field is missing.
        const hideSelfDetails = isSelf && isSelfComplete(a);
        if (hideSelfDetails && r.memberFields.length === 0) return null;

        return (
          <View key={index} style={[styles.block, index === 0 && !adjustable && { marginTop: 0 }]}>
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
                  <Checkbox checked={r.alsoUpdateProfile} onToggle={() => r.setAlsoUpdateProfile(!r.alsoUpdateProfile)}>
                    Also save these to my profile
                  </Checkbox>
                ) : null}
              </>
            )}

            {r.memberFields.length > 0 ? (
              <View style={hideSelfDetails ? null : styles.questions}>
                {visibleFields(r.memberFields, a.customFields).map((f) => (
                  <CustomFieldInput key={f.id} field={f} value={a.customFields?.[f.id]} onChange={(v) => r.changeCustomField(index, f.id, v)} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {r.invitedIndices.size > 0 ? (
        <View style={styles.block}>
          <Label>{r.invitedIndices.size === 1 ? 'Your teammate' : `Your ${r.invitedIndices.size} teammates`}</Label>
          <Card style={styles.inviteNote}>
            <PaperPlaneTilt size={24} color={c.text} weight="duotone" />
            <Text style={[styles.body, { color: c.soft, flex: 1 }]}>
              After you book, invite each of them by email from Manage group. They claim their seat and fill in their own details.
            </Text>
          </Card>
        </View>
      ) : null}

      {r.teamFields.length > 0 ? (
        <View style={styles.block}>
          <Label>About your team</Label>
          {visibleFields(r.teamFields, r.teamFieldValues).map((f) => (
            <CustomFieldInput key={f.id} field={f} value={r.teamFieldValues[f.id]} onChange={(v) => r.changeTeamField(f.id, v)} />
          ))}
        </View>
      ) : null}

      {!r.canContinue ? (
        <Text style={[styles.hint, { color: c.muted }]}>
          {r.detailsProblem ??
            `Fill in every required detail${r.isGroup ? ' for each person you add' : ''} to continue. Mobile numbers need 10 digits.`}
        </Text>
      ) : null}
    </View>
  );
}

/** Bare glyph on a 44pt target; the stepper as a whole is the VoiceOver control. */
function StepperButton({ icon, disabled, onPress }: { icon: React.ReactNode; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selectionTick();
        onPress();
      }}
      disabled={disabled}
      importantForAccessibility="no"
      style={({ pressed }) => [styles.stepperBtn, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

// ── Step 3: review ──────────────────────────────────────────────────────────

export function ReviewStep({ r }: { r: EventRegistration }) {
  const c = useCosmos();
  const event = r.event!;
  const t = r.selectedTicket!;
  const where = event.venueName || event.city;

  return (
    <View>
      <Heading sub="Make sure everything looks right before you confirm.">Almost there</Heading>

      {/* A preview of the pass they're about to get: same stub as the Tickets tab. */}
      <View style={[styles.pass, { backgroundColor: c.raised }]}>
        <View style={styles.passBody}>
          <Text style={[styles.passTitle, { color: c.text }]} numberOfLines={3}>{event.title}</Text>
          <Text style={[styles.meta, { color: c.soft, marginTop: spacing[2] }]} numberOfLines={2}>
            {[relativeWhen(event.startDateTime), where].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Perforation />
        <View style={styles.passStub}>
          <Line label="Ticket" value={t.name} />
          <Line label={r.isGroup ? 'Team size' : 'People'} value={`${r.quantity}`} />
          <Line label="Total" value={r.total === 0 ? 'Free' : money(r.symbol, r.total)} strong />
        </View>
      </View>

      <View style={styles.block}>
        <Label>{r.attendees.length > 1 ? 'People' : 'Attendee'}</Label>
        <Card style={{ gap: spacing[5] }}>
          {r.attendees.map((a, index) => {
            const invited = r.invitedIndices.has(index);
            return (
              <View key={index} style={styles.reviewPerson}>
                {invited ? (
                  <EnvelopeSimple size={24} color={c.muted} weight="duotone" />
                ) : (
                  <User size={24} color={c.text} weight="duotone" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.personName, { color: invited ? c.soft : c.text }]}>
                    {invited ? `Person ${index + 1}` : a.name}
                  </Text>
                  <Text style={[styles.meta, { color: c.muted }]} numberOfLines={2}>
                    {invited ? 'You invite them after this' : `${a.email} · +91 ${a.mobile} · ${a.gender}`}
                  </Text>
                  {!invited
                    ? visibleFields(r.memberFields, a.customFields).filter((f) => f.field_type !== 'section').map((f) => {
                        const v = displayFieldValue(f, a.customFields?.[f.id]);
                        return v ? (
                          <Text key={f.id} style={[styles.meta, { color: c.soft }]}>
                            {f.label}: <Text style={{ color: c.text }}>{v}</Text>
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
        <View style={styles.block}>
          <Label>About your team</Label>
          <Card style={{ gap: spacing[2] }}>
            {visibleFields(r.teamFields, r.teamFieldValues)
              .filter((f) => f.field_type !== 'section')
              .map((f) => (
                <Line key={f.id} label={f.label} value={displayFieldValue(f, r.teamFieldValues[f.id]) || 'Not answered'} />
              ))}
          </Card>
        </View>
      ) : null}
    </View>
  );
}

// ── Step 4: pay ─────────────────────────────────────────────────────────────

function CenterNote({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const c = useCosmos();
  return (
    <View style={styles.center}>
      {icon}
      <Text style={[styles.h1, styles.centerText, { color: c.text, marginTop: spacing[5] }]} accessibilityRole="header">{title}</Text>
      <Text style={[styles.sub, styles.centerText, { color: c.soft }]}>{body}</Text>
    </View>
  );
}

export function PaymentStep({ r, waitlist }: { r: EventRegistration; waitlist: boolean }) {
  const c = useCosmos();

  if (waitlist) {
    return (
      <CenterNote
        icon={<Sparkle size={56} color={c.warn} weight="duotone" />}
        title="Join the waiting list"
        body={`${r.selectedTicket?.name} is sold out. We'll hold your place in line and charge nothing now. If the organiser lets you in, you'll get an email.`}
      />
    );
  }

  if (r.total === 0) {
    return (
      <CenterNote
        icon={<CheckCircle size={56} color={c.success} weight="duotone" />}
        title="Nothing to pay"
        body="This one's free. Confirm and your ticket is ready right away."
      />
    );
  }

  const canApply = !!r.couponInput.trim() && !r.applyingCoupon;
  return (
    <View>
      <Heading sub="Check the total, add a code if you have one, then pay.">Payment</Heading>

      <Card style={{ gap: spacing[3] }}>
        <Line label={`${r.selectedTicket?.name}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`} value={money(r.symbol, r.basePrice)} />
        {r.discount > 0 ? <Line label={`Discount (${r.appliedCoupon?.code})`} value={`−${money(r.symbol, r.discount)}`} tone={c.success} /> : null}
        {r.feePercent > 0 && r.fee > 0 ? (
          <Line
            label={r.feeIncluded ? 'Processing fee (included)' : `Processing fee (${r.feePercent}%${r.feeCapped ? ', capped' : ''})`}
            value={money(r.symbol, r.fee)}
          />
        ) : null}
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Line label="Total" value={money(r.symbol, r.total)} strong />
      </Card>

      <View style={styles.block}>
        {r.appliedCoupon ? (
          <View style={[styles.coupon, { backgroundColor: c.tint, borderColor: c.primary }]} accessible accessibilityLabel={`Code ${r.appliedCoupon.code} applied`}>
            <CheckCircle size={22} color={c.success} weight="fill" />
            <Text style={[styles.couponCode, { color: c.text }]}>{r.appliedCoupon.code} applied</Text>
            <Pressable
              onPress={r.removeCoupon}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Remove discount code"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <XCircle size={24} color={c.muted} weight="fill" />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>Discount code</Text>
            <View style={[styles.coupon, { backgroundColor: c.card, borderColor: r.couponError ? c.danger : c.input }]}>
              <TextInput
                value={r.couponInput}
                onChangeText={(v) => r.setCouponInput(v.toUpperCase())}
                placeholder="Have a code?"
                placeholderTextColor={c.muted}
                selectionColor={c.primary}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={canApply ? r.applyCoupon : undefined}
                accessibilityLabel="Discount code"
                style={[styles.couponInput, { color: c.text }]}
              />
              {r.applyingCoupon ? (
                <ActivityIndicator color={c.text} />
              ) : (
                <Pressable
                  onPress={r.applyCoupon}
                  disabled={!canApply}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canApply }}
                  style={({ pressed }) => [styles.apply, { opacity: !canApply ? 0.4 : pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.linkText, { color: c.text }]}>Apply</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
        {r.couponError ? <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">{r.couponError}</Text> : null}
      </View>

      <View style={styles.secure}>
        <ShieldCheck size={18} color={c.muted} weight="duotone" />
        <Text style={[styles.meta, { color: c.muted }]}>Payments are processed securely by Razorpay.</Text>
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
  const c = useCosmos();
  const g = r.gate;
  return (
    <View>
      <Heading sub="We need your name, username and gender to register you and put the right name on your pass. You only do this once.">
        One quick step
      </Heading>
      <View style={styles.fields}>
        <AuthField
          label="Full name"
          value={g.name}
          onChangeText={g.setName}
          placeholder="As it should appear on the pass"
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
        />
        <View>
          <AuthField
            label="Username"
            prefix="@"
            value={g.username}
            onChangeText={g.onUsernameChange}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            error={!!g.usernameError}
            trailing={
              g.checking ? (
                <ActivityIndicator size="small" color={c.muted} />
              ) : g.usernameError ? (
                <XCircle size={20} color={c.danger} weight="fill" />
              ) : g.usernameAvailable ? (
                <CheckCircle size={20} color={c.success} weight="fill" accessibilityLabel="Username available" />
              ) : null
            }
          />
          {g.usernameError ? <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">{g.usernameError}</Text> : null}
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>Gender</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {GATE_GENDERS.map((o) => {
              const active = g.gender === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    if (!active) selectionTick();
                    g.setGender(o.value);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? c.primary : c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] },
                  ]}
                >
                  {active ? <Check size={14} color={c.primaryFg} weight="bold" /> : null}
                  <Text style={[styles.chipText, { color: active ? c.primaryFg : c.text }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      {g.error ? <Text style={[styles.error, { color: c.danger, marginTop: spacing[4] }]} accessibilityLiveRegion="polite">{g.error}</Text> : null}
    </View>
  );
}

const NOTCH = 18;

const styles = StyleSheet.create({
  heading: { marginBottom: spacing[6] },
  // Michroma runs wide and has one weight: size carries the hierarchy, never bold.
  h1: { fontSize: 21, lineHeight: 30, ...cosmosFont.display },
  sub: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  label: { fontSize: typography.fontSize.base, marginBottom: spacing[3], ...cosmosFont.strong },
  fieldLabel: { fontSize: 13, marginBottom: 8, ...cosmosFont.strong },
  linkText: { fontSize: typography.fontSize.base, textDecorationLine: 'underline', ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  cardTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.45, ...cosmosFont.body },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], minHeight: 44, paddingVertical: spacing[1] },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  confirm: { marginTop: spacing[6] },
  termsLink: { alignSelf: 'flex-start', marginLeft: 24 + spacing[3], minHeight: 32, justifyContent: 'center' },
  hint: { marginTop: spacing[6], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, textAlign: 'center', ...cosmosFont.body },
  error: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing[2] },
  // ticket
  ticket: { borderRadius: cosmosCardRadius, padding: spacing[5], borderWidth: 1.5 },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  ticketName: { flex: 1, fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.3, ...cosmosFont.strong },
  priceCol: { alignItems: 'flex-end' },
  ticketPrice: { fontSize: typography.fontSize.lg, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  per: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  ticketDesc: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  ticketFoot: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing[3], gap: spacing[3] },
  // details
  stepperCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 32, textAlign: 'center', fontSize: typography.fontSize.xl, fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  block: { marginTop: spacing[8] },
  inviteNote: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  questions: { marginTop: spacing[5] },
  fields: { gap: spacing[5] },
  // review (pass preview)
  pass: { borderRadius: cosmosCardRadius, overflow: 'hidden' },
  passBody: { padding: spacing[5], paddingBottom: spacing[2] },
  passTitle: { fontSize: 17, lineHeight: 26, ...cosmosFont.display },
  perfRow: { height: NOTCH, justifyContent: 'center', marginVertical: spacing[2] },
  perf: { marginHorizontal: NOTCH, borderTopWidth: 1, borderStyle: 'dashed' },
  notch: { position: 'absolute', width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2 },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  passStub: { paddingHorizontal: spacing[5], paddingBottom: spacing[5], paddingTop: spacing[1], gap: spacing[2] },
  reviewPerson: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  personName: { fontSize: typography.fontSize.base, marginBottom: 2, ...cosmosFont.strong },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[4], minHeight: 28 },
  lineLabel: { flexShrink: 1, fontSize: typography.fontSize.base, ...cosmosFont.body },
  lineValue: { flexShrink: 1, fontSize: typography.fontSize.base, textAlign: 'right', fontVariant: ['tabular-nums'], ...cosmosFont.strong },
  lineTotal: { fontSize: typography.fontSize.xl },
  // pay
  center: { alignItems: 'center', paddingTop: spacing[10], paddingHorizontal: spacing[4] },
  centerText: { textAlign: 'center' },
  coupon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 54,
    borderWidth: 1,
    borderRadius: cosmosRadius,
    paddingLeft: spacing[4],
    paddingRight: spacing[2],
  },
  couponInput: { flex: 1, height: '100%', fontSize: 16, letterSpacing: 1, ...cosmosFont.strong },
  couponCode: { flex: 1, fontSize: 16, ...cosmosFont.strong },
  apply: { minWidth: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
  secure: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[6], justifyContent: 'center' },
  // gate
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing[4], borderRadius: 999 },
  chipText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
