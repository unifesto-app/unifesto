import { isEmail } from '../lib/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import RazorpayCheckout from 'react-native-razorpay';
import { AppAlert } from '../components/ui/AppAlert';
import { useAuth } from '../context/AuthContext';
import { verifyPayment, createRegistration, isWaitlistJoin, validateCoupon, type CouponQuote } from '../lib/api/registrations';
import { getEventById, getEventBySlug, getMyRegistrationsForEvent, type Event } from '../lib/api/events';
import { attributionFor } from '../services/utm';
import { displayAnswer, firstFormProblem } from '../utils/formQuestions';
import {
  getEventCustomFields,
  getFieldsForTicket,
  mapBackendTicket,
  calculateTicketPrice,
  isTicketAvailable,
  isWaitlistOnly,
  getProcessingFeeTerms,
  buyerFee,
  buyerFeeIncluded,
  NO_FEE,
  type Ticket,
  type CustomField,
} from '../lib/api/tickets';
import { getUserIdentities, getCurrentUser, updateUserProfile, checkUsernameAvailability, type User } from '../lib/api/auth';
import { normalizeMobile, profileGenderToAttendeeOption, attendeeGenderToProfileValue } from '../utils/profile';

export type StepType = 'ticket' | 'details' | 'review' | 'payment';
export const STEPS: { id: StepType; label: string }[] = [
  { id: 'ticket', label: 'Ticket' },
  { id: 'details', label: 'Details' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Pay' },
];

export interface AttendeeInfo {
  name: string;
  email: string;
  mobile: string;
  gender: string;
  customFields?: Record<string, any>;
}

/** How a ticket can be picked right now, derived once for the list. */
export interface TicketState {
  ticket: Ticket;
  owned: boolean;
  blocked: boolean;
  waitlistOnly: boolean;
  available: boolean;
  selectable: boolean;
  spotsLeft: number;
  symbol: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
export const symbolFor = (currency?: string) => (currency ? CURRENCY_SYMBOLS[currency] || currency : '₹');

const blankAttendee = (): AttendeeInfo => ({ name: '', email: '', mobile: '', gender: '', customFields: {} });


/**
 * Split a ticket's applicable fields into the per-member set (asked of
 * everyone) and the per-group set (asked once for the team). `per_group` only
 * matters for group tickets; an individual ticket has one attendee.
 */
export const splitFields = (fields: CustomField[], isGroup: boolean) =>
  isGroup
    ? { perMember: fields.filter((f) => !f.per_group), team: fields.filter((f) => f.per_group) }
    : { perMember: fields, team: [] as CustomField[] };

/** Human value for a custom-field answer on the review step. */
export function displayFieldValue(field: CustomField, value: any): string {
  if (field.field_type === 'checkbox' && !Array.isArray(value)) return value ? 'Yes' : 'No';
  return displayAnswer(field, value);
}

/**
 * Everything behind the registration flow: event + tickets, the profile gate,
 * attendee details, coupon, the 15-minute hold, order creation, Razorpay and
 * verification. The screen only renders what this returns.
 */
/** attendee[0] has everything needed to show as the read-only "You" summary. */
export function isSelfComplete(a: AttendeeInfo): boolean {
  return !!(a.name.trim() && a.email.trim() && /^[0-9]{10}$/.test(a.mobile) && a.gender);
}

export function useEventRegistration() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  // ── Event, tickets, fields ──
  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ownedTicketTypeIds, setOwnedTicketTypeIds] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  // Team-wide (per-group) answers, asked once for the whole group.
  const [teamFieldValues, setTeamFieldValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  // App-wide buyer fee terms (percent + per-ticket cap); none until loaded.
  const [feeTerms, setFeeTerms] = useState(NO_FEE);

  useEffect(() => {
    getProcessingFeeTerms().then(setFeeTerms).catch(() => setFeeTerms(NO_FEE));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [eventData, fieldsData, myRegistrations] = await Promise.all([
          getEventBySlug(eventId).catch(() => getEventById(eventId)),
          getEventCustomFields(eventId).catch(() => ({ fields: [] })),
          getMyRegistrationsForEvent(eventId).catch(() => []),
        ]);
        setOwnedTicketTypeIds(new Set(myRegistrations.map((r: any) => r.ticketTypeId).filter(Boolean)));
        setEvent(eventData);
        // The shared mapper keeps GROUP tickets' type, team size and pricing mode.
        if (eventData?.ticketTypes?.length) {
          setTickets(eventData.ticketTypes.map((tt: any) => mapBackendTicket(tt, eventData.id)));
        }
        setCustomFields(fieldsData.fields || []);
      } catch (error) {
        if (__DEV__) console.error('Error loading event data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  // ── Flow ──
  const [step, setStep] = useState<StepType>('ticket');
  // Whether Details was skipped, decided when leaving the Ticket step so the
  // flow doesn't reshuffle while someone is filling the form in.
  const [detailsSkipped, setDetailsSkipped] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  // Step 1 confirmation: the attendee ticks it before they can continue.
  const [confirmed, setConfirmed] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Coupon: `couponInput` is raw text; `appliedCoupon` a server quote for the
  // CURRENT ticket + quantity, so it's dropped whenever either changes.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponQuote | null>(null);
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError('');
  }, [selectedTicket?.id, quantity]);

  // Primary email (from linked identities) for prefill; User has no email.
  const [primaryEmail, setPrimaryEmail] = useState('');
  useEffect(() => {
    if (!token) return;
    getUserIdentities(token)
      .then((ids) => {
        const primary = ids.find((i) => i.isPrimary && i.email) ?? ids.find((i) => i.email);
        if (primary?.email) setPrimaryEmail(primary.email);
      })
      .catch(() => {});
  }, [token]);

  const [pendingRegistrationId, setPendingRegistrationId] = useState('');
  // Order creation + Razorpay sheet in flight (the pay button spins).
  const [submitting, setSubmitting] = useState(false);
  // Razorpay reported success and we're verifying: blocks the whole screen so
  // the payment step can't be re-submitted (which would create a duplicate order).
  const [verifying, setVerifying] = useState(false);

  const [attendees, setAttendees] = useState<AttendeeInfo[]>([blankAttendee()]);
  const [alsoUpdateProfile, setAlsoUpdateProfile] = useState(false);

  // ── Profile gate (name + username + gender required) ──
  const [profileGender, setProfileGender] = useState('');
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [gateName, setGateName] = useState('');
  const [gateUsername, setGateUsername] = useState('');
  const [gateGender, setGateGender] = useState('');
  const [gateUsernameError, setGateUsernameError] = useState('');
  const [gateUsernameAvailable, setGateUsernameAvailable] = useState<boolean | null>(null);
  const [gateChecking, setGateChecking] = useState(false);
  const [gateSaving, setGateSaving] = useState(false);
  const [gateError, setGateError] = useState('');
  const gateUsernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-checked on focus so completing the profile elsewhere clears the gate.
  const loadProfile = useCallback(() => {
    if (!token) return;
    getCurrentUser(token)
      .then((p) => {
        setProfile(p);
        setProfileGender(p.gender || '');
        setGateName(p.fullName || '');
        setGateUsername(p.username || '');
        setGateGender(p.gender || '');
        setProfileComplete(!!(p.fullName && p.username && p.gender));
      })
      .catch(() => setProfileComplete(true)); // never hard-block on a fetch failure
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  // Prefill attendee[0] from the profile. While the form is open it fills
  // EMPTY fields only (never clobbers typing); once complete it shows as a
  // read-only summary whose only edit path is Edit profile, so it mirrors
  // the profile and picks up changes made there (reloaded on focus).
  useEffect(() => {
    if (!profile && !user) return;
    const fullName = profile?.fullName ?? user?.fullName;
    const rawMobile = profile?.mobileNumber ?? user?.mobileNumber;
    setAttendees((prev) => {
      const a = { ...prev[0] };
      const mirror = isSelfComplete(a);
      let changed = false;
      const put = (key: 'name' | 'email' | 'mobile' | 'gender', value: string | null | undefined) => {
        if (value && (mirror || !a[key]) && a[key] !== value) { a[key] = value; changed = true; }
      };
      put('name', fullName);
      put('email', primaryEmail);
      put('mobile', normalizeMobile(rawMobile));
      put('gender', profileGenderToAttendeeOption(profileGender));
      if (!changed) return prev;
      const next = [...prev];
      next[0] = a;
      return next;
    });
  }, [user, profile, primaryEmail, profileGender]);

  const onGateUsernameChange = (text: string) => {
    setGateUsername(text);
    setGateUsernameError('');
    setGateUsernameAvailable(null);
    if (gateUsernameTimeout.current) clearTimeout(gateUsernameTimeout.current);
    const trimmed = text.trim();
    if (!trimmed || trimmed === (profile?.username || '')) return;
    gateUsernameTimeout.current = setTimeout(async () => {
      try {
        setGateChecking(true);
        const { available } = await checkUsernameAvailability(trimmed);
        setGateUsernameAvailable(available);
        if (!available) setGateUsernameError('Username is already taken');
      } catch {
        setGateUsernameAvailable(null);
      } finally {
        setGateChecking(false);
      }
    }, 600);
  };

  const saveGate = async () => {
    if (!token || gateSaving) return;
    const name = gateName.trim();
    const uname = gateUsername.trim();
    setGateError('');
    if (!name) { setGateError('Please enter your name.'); return; }
    if (!uname) { setGateUsernameError('Username cannot be empty'); return; }
    if (!gateGender) { setGateError('Please select your gender.'); return; }
    if (gateUsernameError) return;

    if (uname !== (profile?.username || '') && gateUsernameAvailable !== true) {
      try {
        setGateChecking(true);
        const { available } = await checkUsernameAvailability(uname);
        setGateUsernameAvailable(available);
        if (!available) { setGateUsernameError('Username is already taken'); return; }
      } catch {
        // the PATCH rejects a dupe as the last line of defence
      } finally {
        setGateChecking(false);
      }
    }
    try {
      setGateSaving(true);
      await updateUserProfile(token, { username: uname, fullName: name, gender: gateGender });
      loadProfile(); // flips the gate and prefills attendee[0]
    } catch (e: any) {
      setGateError(e?.message || 'Could not save. Check your connection and try again.');
    } finally {
      setGateSaving(false);
    }
  };

  // ── Tickets ──
  const ticketStates: TicketState[] = tickets.map((ticket) => {
    const owned = ownedTicketTypeIds.has(ticket.id);
    const blocked = ticket.blockedByTicketTypeIds.some((id) => ownedTicketTypeIds.has(id));
    // Sold out but queueing: selectable, but buys a place in line, not a seat.
    const waitlistOnly = isWaitlistOnly(ticket) && !owned && !blocked;
    const available = isTicketAvailable(ticket) && !owned && !blocked;
    return {
      ticket,
      owned,
      blocked,
      waitlistOnly,
      available,
      selectable: available || waitlistOnly,
      spotsLeft: ticket.quantity_available - ticket.quantity_sold,
      symbol: symbolFor(ticket.currency),
    };
  });

  const selectTicket = (ticket: Ticket) => {
    // The tick confirms *this* ticket, so a different pick has to be re-confirmed.
    if (ticket.id !== selectedTicket?.id) setConfirmed(false);
    setSelectedTicket(ticket);
    // Group: team size starts at the minimum. Everything else is one person.
    const teamSize = ticket.type === 'group' ? Math.max(1, ticket.group_size || ticket.min_purchase || 1) : 1;
    setQuantity(teamSize);
    // Keep the prefilled "you" at index 0; only extra group slots are new.
    setAttendees((prev) => Array.from({ length: teamSize }, (_, i) => prev[i] || blankAttendee()));
  };

  const isGroup = selectedTicket?.type === 'group';
  // Email invite only: in a group, every teammate (index 1+) gets their seat by
  // email after booking and fills in their own details; only the lead (0) is
  // filled in here. Their seats are left OPEN (index + 1 = seat number).
  const invitedIndices = useMemo(
    () => new Set(isGroup ? attendees.map((_, i) => i).filter((i) => i > 0) : []),
    [isGroup, attendees],
  );
  const teamMin = selectedTicket ? (isGroup ? selectedTicket.group_size || 5 : selectedTicket.min_purchase) : 1;
  const teamMax = selectedTicket
    ? Math.min(selectedTicket.max_purchase, selectedTicket.quantity_available - selectedTicket.quantity_sold)
    : 1;

  const changeQuantity = (next: number) => {
    if (!selectedTicket || next < teamMin || next > teamMax) return;
    setQuantity(next);
    setAttendees((prev) => Array.from({ length: next }, (_, i) => prev[i] || blankAttendee()));
  };

  // ── Attendees ──
  const fillFromProfile = (index: number) => {
    if (!profile && !user) return;
    setAttendees((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        name: (profile?.fullName ?? user?.fullName) || '',
        email: primaryEmail || (user as any)?.email || '',
        mobile: normalizeMobile(profile?.mobileNumber ?? user?.mobileNumber) ?? next[index].mobile ?? '',
        gender: profileGenderToAttendeeOption(profileGender) || next[index].gender,
      };
      return next;
    });
  };

  const changeAttendee = (index: number, field: keyof AttendeeInfo, value: string) =>
    setAttendees((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));

  const changeCustomField = (index: number, fieldId: string, value: any) =>
    setAttendees((prev) =>
      prev.map((a, i) => (i === index ? { ...a, customFields: { ...a.customFields, [fieldId]: value } } : a)),
    );

  const changeTeamField = (fieldId: string, value: any) =>
    setTeamFieldValues((prev) => ({ ...prev, [fieldId]: value }));

  const applicableFields = selectedTicket ? getFieldsForTicket(customFields, selectedTicket.id) : [];
  const { perMember: memberFields, team: teamFields } = splitFields(applicableFields, !!isGroup);

  // The first thing stopping Continue, in words (null = good to go). Question
  // answers follow the same rules the backend enforces, incl. show-if.
  const detailsProblem = ((): string | null => {
    if (!selectedTicket) return 'Pick a ticket first.';
    const teamProblem = firstFormProblem(teamFields, teamFieldValues);
    if (teamProblem) return teamProblem;
    for (let index = 0; index < attendees.length; index++) {
      if (invitedIndices.has(index)) continue; // invitee fills their own later
      const a = attendees[index];
      const basicValid =
        a.name.trim() !== '' &&
        isEmail(a.email.trim()) &&
        /^[0-9]{10}$/.test(a.mobile) &&
        a.gender !== '';
      if (!basicValid) return null;
      const p = firstFormProblem(memberFields, a.customFields);
      if (p) return attendees.length > 1 && index > 0 ? `Person ${index + 1}: ${p}` : p;
    }
    return null;
  })();
  const attendeesValid = (() => {
    if (!selectedTicket || detailsProblem) return false;
    return attendees.every((a, index) => {
      if (invitedIndices.has(index)) return true;
      return (
        a.name.trim() !== '' &&
        isEmail(a.email.trim()) &&
        /^[0-9]{10}$/.test(a.mobile) &&
        a.gender !== ''
      );
    });
  })();

  // With the "You" details hidden once complete, the Details step can end up
  // with nothing to fill in: no team size to pick and no questions. Skip it
  // then (Review still lists who the ticket is for).
  const skipDetails =
    !!selectedTicket && !(isGroup && teamMax > teamMin) && memberFields.length === 0 && teamFields.length === 0 && attendeesValid;
  const steps = (step === 'ticket' ? skipDetails : detailsSkipped) ? STEPS.filter((s) => s.id !== 'details') : STEPS;

  // ── Money ──
  const symbol = symbolFor(selectedTicket?.currency);
  const basePrice = selectedTicket ? calculateTicketPrice(selectedTicket, quantity) : 0;
  // A coupon comes off the base first; the fee is on the discounted base,
  // matching the backend exactly.
  const discount = appliedCoupon ? Math.min(appliedCoupon.discount, basePrice) : 0;
  const discountedBase = Math.max(0, basePrice - discount);
  // Per-person tickets count each ticket for the cap; a per-group price is one.
  const feeTickets = selectedTicket?.price_type === 'per_person' ? quantity : 1;
  // The organiser may absorb the fee (A33): then the buyer pays the listed
  // price and the fee is shown as included, never added.
  const feeIncluded = !!event?.absorbProcessingFee;
  const fee =
    basePrice === 0
      ? 0
      : feeIncluded
        ? buyerFeeIncluded(discountedBase, feeTerms, feeTickets)
        : buyerFee(discountedBase, feeTerms, feeTickets);
  const total = basePrice === 0 ? 0 : feeIncluded ? discountedBase : Math.round((discountedBase + fee) * 100) / 100;
  const feePercent = feeTerms.percent;
  const feeCapped =
    !feeIncluded && fee > 0 && fee < Math.round(discountedBase * feeTerms.percent + 1e-9) / 100;

  const applyCoupon = async () => {
    if (!selectedTicket || !event || !couponInput.trim()) return;
    setApplyingCoupon(true);
    setCouponError('');
    try {
      const quote = await validateCoupon(event.id, {
        code: couponInput.trim(),
        ticketTypeId: selectedTicket.id,
        quantity: isGroup ? 1 : quantity,
        groupSize: isGroup ? quantity : undefined,
      });
      setAppliedCoupon(quote);
    } catch (e: any) {
      setAppliedCoupon(null);
      setCouponError(e?.message || 'That discount code is not valid');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  // ── Steps ──
  const canContinue = step === 'ticket' ? !!selectedTicket && confirmed : step === 'details' ? attendeesValid : true;

  const next = () => {
    if (step === 'ticket' && selectedTicket && confirmed) {
      setDetailsSkipped(skipDetails);
      setStep(skipDetails ? 'review' : 'details');
    } else if (step === 'details' && attendeesValid) {
      // Opt-in, best-effort: persist the edited identity to the profile.
      if (alsoUpdateProfile && token) {
        const self = attendees[0];
        updateUserProfile(token, { fullName: self.name, gender: attendeeGenderToProfileValue(self.gender) }).catch(() => {});
      }
      setStep('review');
    } else if (step === 'review') {
      setStep('payment');
      // The fee may have changed while the form was open; refresh the total.
      getProcessingFeeTerms().then(setFeeTerms).catch(() => {});
    }
  };

  const back = () => {
    if (step === 'details') setStep('ticket');
    else if (step === 'review') setStep(detailsSkipped ? 'ticket' : 'details');
    else if (step === 'payment') setStep('review');
  };

  const confirmLeave = () => {
    AppAlert.alert('Leave registration?', 'Your details and ticket choice will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  /**
   * The payable amount may differ from what we SHOWED (usually an admin
   * changed the fee mid-flow). Proceed silently when the charge is equal,
   * lower, or within a paisa; confirm explicitly only on a real increase.
   */
  const confirmAmountChange = (shownPaise: number, chargePaise: number): Promise<boolean> => {
    if (chargePaise <= shownPaise + 1) return Promise.resolve(true);
    const shown = (shownPaise / 100).toFixed(2);
    const charge = (chargePaise / 100).toFixed(2);
    return new Promise((resolve) => {
      AppAlert.alert(
        'Processing fee updated',
        `The processing fee changed while you were on this page, so the total is now ${symbol}${charge} instead of ${symbol}${shown}. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: `Pay ${symbol}${charge}`, onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
  };

  // Values are passed in (not read from state) so they're never a render stale.
  const goToSuccess = (paid: number, openSeats: number) => {
    router.replace({
      pathname: '/registration-success',
      params: {
        eventId: event?.id || '',
        eventTitle: event?.title || '',
        ticketName: selectedTicket?.name || '',
        quantity: String(quantity),
        total: String(paid),
        currency: symbol,
        openSeats: String(openSeats),
      },
    });
  };

  const submit = async () => {
    if (!selectedTicket || !event || submitting || verifying) return;
    setSubmitting(true);
    try {
      const finalAmount = Math.max(0, total);
      // Group: `quantity` is the team size → backend `groupSize`, one
      // registration. Invite-later members are omitted so their seats stay OPEN.
      const groupMembers = isGroup
        ? attendees
            .filter((_, i) => !invitedIndices.has(i))
            .map((a) => ({ name: a.name, email: a.email, mobile: a.mobile, gender: a.gender, customFields: a.customFields }))
        : undefined;
      const openSeats = isGroup ? invitedIndices.size : 0;

      const utm = await attributionFor({ id: event.id, slug: event.slug, spaceSlug: event.space?.slug });
      const order = await createRegistration(event.id, {
        ...utm,
        ticketTypeId: selectedTicket.id,
        quantity: isGroup ? 1 : quantity,
        groupSize: isGroup ? quantity : undefined,
        groupMembers,
        couponCode: appliedCoupon ? couponInput.trim() : undefined,
        // Group: team-wide answers (members carry their own). Individual: the
        // sole attendee's identity + answers.
        formResponses: isGroup
          ? teamFieldValues
          : attendees[0]
            ? {
                name: attendees[0].name,
                email: attendees[0].email,
                mobile: attendees[0].mobile,
                gender: attendees[0].gender,
                ...(attendees[0].customFields || {}),
              }
            : undefined,
      });

      // Sold out mid-flow: queued instead of an order. Checked before the
      // "no order id" branch, which would read it as a free registration.
      if (isWaitlistJoin(order)) {
        AppAlert.alert(
          "You're on the waiting list",
          `${selectedTicket.name} sold out, so we've put you in the queue at number ${order.position}. ` +
            (finalAmount > 0
              ? "Nothing has been charged. If the organiser lets you in, you'll get an email and can pay then."
              : 'Nothing to pay. If the organiser lets you in, your spot is confirmed straight away.'),
          [{ text: 'Got it', onPress: () => router.back() }],
        );
        return;
      }

      // The server decides whether money is due (A31): no order means it
      // registered them for free; an order is always paid, whatever this
      // screen computed.
      if (!order.razorpayOrderId) {
        goToSuccess(0, openSeats);
        return;
      }

      const shownPaise = Math.round(finalAmount * 100);
      if (order.amount && order.amount !== shownPaise) {
        const proceed = await confirmAmountChange(shownPaise, order.amount);
        if (!proceed) {
          // Show the live total; the PENDING registration is reused/cleaned up server-side.
          getProcessingFeeTerms().then(setFeeTerms).catch(() => {});
          return;
        }
      }

      const registrationId = order.registrationId || '';
      setPendingRegistrationId(registrationId);
      // What Razorpay actually charges (authoritative), for the success screen.
      const charged = order.amount ? order.amount / 100 : finalAmount;

      // White-label the sheet when the event carries (server-gated) branding.
      const branding = event.branding;
      const options = {
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: branding ? event.space?.name || 'Unifesto' : 'Unifesto',
        description: event.title,
        image: (branding && event.space?.logoUrl) || event.coverImageUrl || 'https://unifesto.app/logo.png',
        prefill: {
          name: attendees[0]?.name || user?.fullName || '',
          email: attendees[0]?.email || '',
          contact: attendees[0]?.mobile || user?.mobileNumber || '',
        },
        theme: { color: branding?.color || '#3491ff' },
      };

      let paymentData: any;
      try {
        paymentData = await RazorpayCheckout.open(options as any);
      } catch (paymentError: any) {
        // Cancelled or failed: the registration stays PENDING for reuse.
        if (paymentError?.code !== 0 && paymentError?.description !== 'Payment Cancelled') {
          AppAlert.alert('Payment failed', paymentError?.description || 'Payment was not completed');
        }
        return;
      }
      await verify(paymentData, registrationId, charged, openSeats);
    } catch (error: any) {
      if (__DEV__) console.error('Registration error:', error);
      AppAlert.alert('Could not register', error?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (payment: any, registrationId: string, charged: number, openSeats: number) => {
    // Money is already collected: block the screen until it's confirmed.
    setVerifying(true);
    try {
      await verifyPayment(event?.id || '', {
        registrationId: registrationId || pendingRegistrationId,
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      });
      // The overlay leaves with this screen when the route is replaced.
      goToSuccess(charged, openSeats);
    } catch (error: any) {
      setVerifying(false);
      AppAlert.alert('Payment verification failed', error?.message || 'Please contact support');
    }
  };

  return {
    // data
    event,
    loading,
    ticketStates,
    hasTickets: tickets.length > 0,
    // gate
    gate: {
      needed: profileComplete === false,
      name: gateName,
      setName: setGateName,
      username: gateUsername,
      onUsernameChange: onGateUsernameChange,
      usernameError: gateUsernameError,
      usernameAvailable: gateUsernameAvailable,
      checking: gateChecking,
      gender: gateGender,
      setGender: setGateGender,
      saving: gateSaving,
      error: gateError,
      save: saveGate,
    },
    // timer
    // flow
    step,
    steps,
    next,
    back,
    canContinue,
    detailsProblem,
    confirmLeave,
    // ticket
    selectedTicket,
    selectTicket,
    confirmed,
    setConfirmed,
    isGroup: !!isGroup,
    quantity,
    teamMin,
    teamMax,
    changeQuantity,
    // attendees
    attendees,
    alsoUpdateProfile,
    setAlsoUpdateProfile,
    invitedIndices,
    fillFromProfile,
    changeAttendee,
    changeCustomField,
    memberFields,
    teamFields,
    teamFieldValues,
    changeTeamField,
    applicableFields,
    // money
    symbol,
    basePrice,
    discount,
    fee,
    feePercent,
    feeCapped,
    feeIncluded,
    total,
    couponInput,
    setCouponInput,
    appliedCoupon,
    couponError,
    applyingCoupon,
    applyCoupon,
    removeCoupon,
    // submit
    submit,
    submitting,
    verifying,
  };
}

export type EventRegistration = ReturnType<typeof useEventRegistration>;
