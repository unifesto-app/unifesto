import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRight, CheckCircle, EnvelopeSimple, GenderIntersex, LinkBreak, Phone, Ticket, User, UserSwitch } from 'phosphor-react-native';
import { useTokens } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import useTopSpacing from '../../src/hooks/useTopSpacing';
import Skeleton from '../../src/components/Skeleton';
import { Button } from '../../src/components/ui';
import { AppAlert } from '../../src/components/ui/AppAlert';
import { markClaimLinkHandled } from '../../src/services/claimLinks';
import BrandGlow from '../../src/components/ui/BrandGlow';
import { ActionBar, useActionBarSpace } from '../../src/components/event/EventOverlays';
import { SettingsGroup, SettingsRow } from '../../src/components/profile/SettingsGroup';
import FormRow from '../../src/components/profile/FormRow';
import { getCurrentUser, getUserIdentities } from '../../src/lib/api/auth';
import { getClaimInfo, claimSeat, declineSeat } from '../../src/lib/api/registrations';
import { getEventCustomFields, getFieldsForTicket, type CustomField } from '../../src/lib/api/tickets';
import CustomFieldInput from '../../src/components/CustomFieldInput';
import { firstFormProblem, visibleFields } from '../../src/utils/formQuestions';
import { normalizeMobile, profileGenderToAttendeeOption, ATTENDEE_GENDER_OPTIONS, isCustomGender } from '../../src/utils/profile';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { font } from '../../src/theme/fontHelpers';
import { CardBackdrop } from '../../src/components/ui/CardSurface';
import { markTicketsStale } from '../../src/lib/ticketsRefresh';

const GUTTER = spacing[6];

interface ClaimInfo {
  seatIndex: number;
  status: string;
  event?: { id: string; title: string; slug?: string } | null;
  /** The group's ticket type, for its custom questions (newer servers only). */
  ticketTypeId?: string | null;
  invitedEmail?: string | null;
  /** This account already has a ticket for the event (claiming would fail). */
  alreadyRegistered?: boolean;
}


type Phase = 'loading' | 'signedOut' | 'ready' | 'already' | 'claimed' | 'declined' | 'error';

/**
 * Group-seat claim, reached from an invite link (unifesto://claim/{token} or
 * unifesto.app/claim/{token}). Signed-out visitors sign in and come straight
 * back here. Details from their profile are shown read-only; only what the
 * profile is missing can be filled in. Then they claim their own seat and ticket.
 */
export default function ClaimSeatRoute() {
  const tokens = useTokens();
  const router = useRouter();
  const topSpacing = useTopSpacing(8);
  const barSpace = useActionBarSpace();
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = String(rawToken ?? '');
  const { token: authToken, isLoading: authLoading, logout } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState('');
  // The email the seat is recorded under: the account's primary email (the
  // server uses the same one), else the address the invite was sent to.
  const [email, setEmail] = useState('');
  // Which details came from the signed-in profile. Those are shown read-only;
  // only what the profile is missing can be filled in here.
  const [locked, setLocked] = useState({ name: false, mobile: false, gender: false });
  // The organiser's per-member questions for this ticket; team-wide ones were
  // answered by the lead at registration.
  const [fields, setFields] = useState<CustomField[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    if (authLoading) return;
    // The claim endpoints need an account, so don't call them signed out
    // (that used to surface as a misleading "invalid link").
    if (!authToken) {
      setPhase('signedOut');
      return;
    }
    setPhase('loading');
    setError('');
    try {
      const [data, me, identities] = await Promise.all([
        getClaimInfo(token),
        getCurrentUser(authToken).catch(() => null),
        getUserIdentities(authToken).catch(() => []),
      ]);
      setInfo(data);
      const primary = identities.find((i) => i.isPrimary && i.email) ?? identities.find((i) => i.email);
      setEmail(primary?.email || data?.invitedEmail || '');
      if (me) {
        const pName = me.fullName?.trim() || '';
        const pMobile = normalizeMobile(me.mobileNumber) || '';
        const pGender = profileGenderToAttendeeOption(me.gender);
        const has = { name: !!pName, mobile: /^[0-9]{10}$/.test(pMobile), gender: !!pGender };
        setLocked(has);
        if (has.name) setName(pName);
        if (has.mobile) setMobile(pMobile);
        if (has.gender) setGender(pGender);
      }
      if (data?.event?.id) {
        const { fields: all } = await getEventCustomFields(data.event.id).catch(() => ({ fields: [] as CustomField[] }));
        // Without a ticket type (older server) this keeps only questions that apply to every ticket.
        setFields(
          getFieldsForTicket(all, data.ticketTypeId ?? '')
            .filter((f) => !f.per_group)
            .sort((a, b) => a.display_order - b.display_order),
        );
      }
      setPhase(data?.alreadyRegistered ? 'already' : 'ready');
    } catch (e: any) {
      setError(e?.message || 'This claim link is invalid or has expired');
      setPhase('error');
    }
  }, [token, authToken, authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  // Remember final outcomes so a replayed link (Android relaunch, push) doesn't
  // reopen this screen. Signed-out / wrong-account aren't final: the same link
  // should still work once they sign in with the right account.
  useEffect(() => {
    // Only server answers that mean the invite is finished; a network blip
    // must not mark a good link as dead.
    const finalError =
      phase === 'error' &&
      /already been claimed|no longer available|invalid or has expired|no longer active|ended|cancelled|isn't open|hasn't been sent/i.test(error);
    if (phase === 'claimed' || phase === 'declined' || phase === 'already' || finalError) {
      void markClaimLinkHandled(token);
    }
  }, [phase, error, token]);

  const mobileValid = /^[0-9]{10}$/.test(mobile.trim());
  // Same rules the backend enforces on claim (required, formats, show-if).
  const questionProblem = firstFormProblem(fields, answers);
  const questionsDone = !questionProblem;
  const canClaim = !!name.trim() && mobileValid && !!gender && questionsDone;
  const anyLocked = locked.name || locked.mobile || locked.gender || !!email;

  const claim = async () => {
    if (!canClaim || submitting) return;
    setSubmitting(true);
    try {
      await claimSeat(token, {
        name: name.trim(),
        mobile: mobile.trim(),
        gender,
        ...(fields.length ? { customFields: answers } : {}),
      });
      setPhase('claimed');
      markTicketsStale(); // their new ticket shows in Tickets and the widgets
    } catch (e: any) {
      AppAlert.alert("Couldn't claim the seat", e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const decline = () => {
    AppAlert.alert('Decline this invite?', 'Your seat goes back to the group so your team lead can invite someone else.', [
      { text: 'Keep my seat', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await declineSeat(token);
            setPhase('declined');
          } catch (e: any) {
            AppAlert.alert("Couldn't decline", e?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const eventLink = info?.event ? () => router.push(`/event/${info.event!.slug || info.event!.id}`) : undefined;

  const genderOptions: string[] = isCustomGender(gender) ? [...ATTENDEE_GENDER_OPTIONS, gender] : [...ATTENDEE_GENDER_OPTIONS];
  const header = <Stack.Screen options={{ title: 'Claim your seat', headerShown: true }} />;

  // ── Non-form states ──
  if (phase === 'loading') {
    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg, paddingTop: topSpacing + spacing[6], paddingHorizontal: GUTTER, alignItems: 'center' }]}>
        {header}
        <Skeleton width={56} height={56} borderRadius={28} />
        <Skeleton width="70%" height={28} borderRadius={8} style={{ marginTop: spacing[5] }} />
        <Skeleton width="50%" height={14} borderRadius={6} style={{ marginTop: spacing[3] }} />
        <Skeleton width="100%" height={170} borderRadius={borderRadius.xl} style={{ marginTop: spacing[8] }} />
      </View>
    );
  }

  if (phase !== 'ready') {
    const different = /different account/i.test(error);
    const taken = /already been claimed/i.test(error);
    // Event over / cancelled / not open, or the group was cancelled: a new invite won't help.
    const over = /ended|cancelled|isn't open/i.test(error);
    const view =
      phase === 'signedOut'
        ? {
            icon: <Ticket size={64} color={tokens.accent} weight="duotone" />,
            title: "You've been invited",
            body: 'Sign in to claim your seat. Use the email address your invite was sent to.',
            action: 'Sign in to claim',
            onAction: () => router.push({ pathname: '/login', params: { redirect: `/claim/${token}` } }),
          }
        : phase === 'already'
          ? {
              icon: <CheckCircle size={64} color={tokens.success} weight="duotone" />,
              title: "You're already going",
              body: `This account already has a ticket for ${info?.event?.title ?? 'this event'}, so this seat can't be claimed too. Decline it so your team lead can give it to someone else.`,
              action: 'View my tickets',
              onAction: () => router.replace('/tickets'),
            }
        : phase === 'claimed'
          ? {
              icon: <CheckCircle size={72} color={tokens.success} weight="duotone" />,
              title: 'Your seat is yours',
              body: `You're going to ${info?.event?.title ?? 'the event'}. Your ticket is waiting in the Tickets tab.`,
              action: 'View my ticket',
              onAction: () => router.replace('/tickets'),
            }
          : phase === 'declined'
            ? {
                icon: <CheckCircle size={64} color={tokens.textSecondary} weight="duotone" />,
                title: 'Invite declined',
                body: 'The seat is back with your group, so your team lead can invite someone else.',
                action: 'Done',
                onAction: leave,
              }
            : different
              ? {
                  icon: <UserSwitch size={64} color={tokens.warning} weight="duotone" />,
                  title: 'Wrong account',
                  // The server names the invited address (masked), e.g. "dh•••@wegobeyond.in".
                  body: error,
                  action: 'Sign in with that email',
                  onAction: async () => {
                    await logout().catch(() => {});
                    router.replace({ pathname: '/login', params: { redirect: `/claim/${token}` } });
                  },
                }
              : {
                  icon: <LinkBreak size={64} color={tokens.textSecondary} weight="duotone" />,
                  title: taken ? 'This seat is taken' : over ? "This seat can't be claimed" : "This link doesn't work",
                  body: taken
                    ? 'Someone has already claimed this seat. If it was meant for you, ask your team lead to send a new invite.'
                    : over
                      ? `${error.replace(/\.$/, '')}.`
                      : `${error.replace(/\.$/, '')}. Ask your team lead to send a new invite.`,
                  action: 'Go back',
                  onAction: leave,
                };

    return (
      <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
        {header}
        <BrandGlow />
        <View style={[styles.state, { paddingTop: topSpacing }]}>
          {view.icon}
          <Text style={[styles.stateTitle, { color: tokens.text }]}>{view.title}</Text>
          <Text style={[styles.stateBody, { color: tokens.textSecondary }]}>{view.body}</Text>
          <Button label={view.action} size="lg" onPress={view.onAction} style={styles.stateButton} />
          {phase === 'already' ? (
            <Text style={[styles.link, { color: tokens.textSecondary, marginTop: spacing[5] }]} onPress={decline}>
              Decline this invite
            </Text>
          ) : null}
          {different && phase === 'error' ? (
            <Text style={[styles.link, { color: tokens.textSecondary, marginTop: spacing[5] }]} onPress={leave}>
              Not now
            </Text>
          ) : null}
          {phase === 'claimed' && eventLink ? (
            <Text style={[styles.link, { color: tokens.textSecondary, marginTop: spacing[5] }]} onPress={eventLink}>
              View event
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  // ── Claim form ──
  return (
    <View style={[styles.flex, { backgroundColor: tokens.bg }]}>
      {header}
      <BrandGlow />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: topSpacing + spacing[4], paddingHorizontal: GUTTER, paddingBottom: barSpace }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Ticket size={56} color={tokens.accent} weight="duotone" />
            <Text style={[styles.kicker, { color: tokens.textSecondary }]}>You've been invited to</Text>
            <Text style={[styles.title, { color: tokens.text }]}>{info?.event?.title ?? 'an event'}</Text>
            <Text style={[styles.meta, { color: tokens.textMuted }]}>
              Seat {info?.seatIndex} in a group ticket{info?.invitedEmail ? ` · for ${info.invitedEmail}` : ''}
            </Text>
          </View>

          {eventLink ? (
            <Pressable
              onPress={eventLink}
              accessibilityRole="link"
              style={({ pressed }) => [styles.eventRow, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            >
              <CardBackdrop shape={styles.eventRow} />
              <Text style={[styles.eventRowText, { color: tokens.text }]}>See event details</Text>
              <CaretRight size={16} color={tokens.textMuted} weight="bold" />
            </Pressable>
          ) : null}

          {anyLocked ? (
            <>
              <Text style={[styles.section, { color: tokens.textMuted }]}>Your details</Text>
              <SettingsGroup>
                {locked.name ? <SettingsRow icon={<User size={24} color={tokens.accent} weight="duotone" />} label={name} /> : null}
                {email ? <SettingsRow icon={<EnvelopeSimple size={24} color={tokens.accent} weight="duotone" />} label={email} /> : null}
                {locked.mobile ? <SettingsRow icon={<Phone size={24} color={tokens.accent} weight="duotone" />} label={`+91 ${mobile}`} /> : null}
                {locked.gender ? <SettingsRow icon={<GenderIntersex size={24} color={tokens.accent} weight="duotone" />} label={gender} /> : null}
              </SettingsGroup>
              <Text style={[styles.hint, { color: tokens.textMuted }]}>From your profile.</Text>
            </>
          ) : null}

          {!locked.name || !locked.mobile ? (
            <>
              <Text style={[styles.section, { color: tokens.textMuted }]}>{anyLocked ? "Add what's missing" : 'Your details'}</Text>
              <SettingsGroup>
                {!locked.name ? (
                  <FormRow
                    icon={<User size={24} color={tokens.accent} weight="duotone" />}
                    value={name}
                    onChangeText={setName}
                    placeholder="Full name"
                    autoCapitalize="words"
                    textContentType="name"
                    returnKeyType="next"
                  />
                ) : null}
                {!locked.mobile ? (
                  <FormRow
                    icon={<Phone size={24} color={tokens.accent} weight="duotone" />}
                    prefix="+91"
                    value={mobile}
                    onChangeText={(v) => setMobile(v.replace(/[^0-9]/g, ''))}
                    placeholder="10-digit mobile"
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    maxLength={10}
                  />
                ) : null}
              </SettingsGroup>
              {!locked.mobile && mobile.length > 0 && !mobileValid ? (
                <Text style={[styles.hint, { color: tokens.danger }]}>Mobile numbers need 10 digits.</Text>
              ) : null}
            </>
          ) : null}

          {!locked.gender ? (
            <>
              <Text style={[styles.section, { color: tokens.textMuted }]}>Gender</Text>
              <View style={styles.chips}>
                {genderOptions.map((opt) => {
                  const active = gender === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setGender(opt)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={({ pressed }) => [styles.chip, { backgroundColor: active ? tokens.text : undefined, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                    >
                      {!active ? <CardBackdrop shape={styles.chip} /> : null}
                      <Text style={[styles.chipText, { color: active ? tokens.bg : tokens.text }]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {fields.length > 0 ? (
            <>
              <Text style={[styles.section, { color: tokens.textMuted }]}>A few questions from the organiser</Text>
              {visibleFields(fields, answers).map((f) => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  value={answers[f.id]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [f.id]: v }))}
                />
              ))}
              {!questionsDone ? (
                <Text style={[styles.hint, { color: tokens.textMuted, marginTop: 0 }]}>Answer the questions marked * to claim.</Text>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.note, { color: tokens.textMuted }]}>
            Claiming gives you your own ticket and QR code for check-in.
          </Text>
          <Text style={[styles.link, styles.decline, { color: tokens.textSecondary }]} onPress={decline} accessibilityRole="button">
            Can't make it? Decline the invite
          </Text>
        </ScrollView>

        <ActionBar info={null} label="Claim my seat" disabled={!canClaim} loading={submitting} accent={tokens.accent} onPress={claim} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', paddingHorizontal: spacing[2] },
  kicker: { marginTop: spacing[4], fontSize: typography.fontSize.sm, ...font('medium') },
  title: {
    marginTop: spacing[1],
    textAlign: 'center',
    fontSize: typography.fontSize['2xl'],
    lineHeight: typography.fontSize['2xl'] * 1.2,
    letterSpacing: -0.4,
    ...font('heading'),
  },
  meta: { marginTop: spacing[2], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  eventRow: {
    marginTop: spacing[6],
    height: 52,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventRowText: { fontSize: typography.fontSize.base, ...font('semibold') },
  section: { marginTop: spacing[8], marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...font('semibold') },
  hint: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font() },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { height: 40, paddingHorizontal: spacing[5], borderRadius: borderRadius.full, justifyContent: 'center' },
  chipText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  link: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font('semibold') },
  decline: { marginTop: spacing[4] },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8] },
  stateTitle: { marginTop: spacing[5], fontSize: typography.fontSize['2xl'], textAlign: 'center', letterSpacing: -0.4, ...font('heading') },
  stateBody: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
    textAlign: 'center',
    maxWidth: 320,
    ...font(),
  },
  stateButton: { marginTop: spacing[8], alignSelf: 'stretch' },
});
