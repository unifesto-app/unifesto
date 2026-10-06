import { useCallback, useEffect, useState } from 'react';
import {} from 'react-native';
import { profileGenderToAttendeeOption } from '../utils/profile';
import { firstFormProblem } from '../utils/formQuestions';
import { getEventCustomFields, getFieldsForTicket, type CustomField } from '../lib/api/tickets';
import RazorpayCheckout from 'react-native-razorpay';
import {
  addSeatsAsLead,
  cancelLeadTransfer,
  createAddSeatsOrder,
  getMyDetails,
  getTeamState,
  removeSeatAsLead,
  replaceMemberAsLead,
  requestLeadTransfer,
  respondLeadTransfer,
  updateMyDetails,
  verifyAddSeats,
  type MyDetails,
  type TeamState,
} from '../lib/api/attendeeControls';
import { useAuth } from '../context/AuthContext';
import {
  getRegistrationSeats,
  inviteSeats,
  revokeSeat,
  releaseSeat,
  reopenSeat,
  getMyGroupMembers,
  updateMyGroupMembers,
  type GroupSeat,
  type MyGroupRoster,
  type GroupMemberInput,
} from '../lib/api/registrations';
import { AppAlert } from '../components/ui/AppAlert';

/**
 * One person-slot in the group, whichever model backs it:
 *  - pay-first seats: the lead invites by email, each person claims a seat;
 *  - shared-ticket roster: the lead fills in each member's details.
 * A registration is normally one model; seats win when present.
 */
/** Something the lead can do to one seat, listed on that seat's own page. */
export interface SeatAction {
  key: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

/** One person-slot in the list. Tapping it opens its page, where its actions live. */
export type GroupRow =
  | {
      key: string;
      kind: 'filled';
      isLead: boolean;
      name: string;
      sub: string | null;
      /** Set for a teammate the lead typed in: no app account holds the seat yet. */
      appStatus: string | null;
      editable: boolean;
      onOpen: () => void;
      actions: SeatAction[];
    }
  | { key: string; kind: 'invited'; isLead: boolean; label: string; email: string | null; onOpen: () => void; actions: SeatAction[] }
  | { key: string; kind: 'open'; isLead: boolean; label: string; onOpen: () => void; actions: SeatAction[] }
  | { key: string; kind: 'released'; isLead: boolean; label: string; onOpen: () => void; actions: SeatAction[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isComplete = (m?: { name?: string; email?: string; mobile?: string } | null) =>
  !!m && !!m.name?.trim() && EMAIL_RE.test(m.email?.trim() ?? '') && /^[0-9]{10}$/.test(m.mobile?.trim() ?? '');

const clean = (m: GroupMemberInput): GroupMemberInput => ({
  name: m.name.trim(),
  email: m.email.trim(),
  mobile: m.mobile.trim(),
  gender: m.gender || '',
  customFields: m.customFields ?? {},
});

/**
 * The roster is saved by seat position and the API rejects any entry that
 * isn't a complete person, so blank open / invited seats can't be sent as-is.
 * Send the edited member(s); other seats go as their saved details when
 * complete (keeps the array gap-free for older servers) and `null` otherwise,
 * which the server reads as "leave this seat alone". Trailing gaps are dropped.
 */
function buildRosterPayload(
  draft: GroupMemberInput[],
  saved: GroupMemberInput[],
  edited: number[],
): (GroupMemberInput | null)[] {
  const out = draft.map((m, i) => {
    if (edited.includes(i)) return clean(m);
    const current = saved[i];
    return isComplete(current) ? clean(current) : null;
  });
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export function useManageGroup(registrationId: string) {
  // ── Seats (pay-first invite/claim) ──
  const [seats, setSeats] = useState<GroupSeat[]>([]);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  // Which seat the composer invites into (1-based); null = next open seat.
  const [composerSeat, setComposerSeat] = useState<number | null>(null);
  // Set while the composer is inviting someone to take over a filled seat.
  const [replacing, setReplacing] = useState<{ seatIndex: number; name: string } | null>(null);
  // What the lead may change right now (organiser's window), or a lead
  // handover addressed to me as a member.
  const [team, setTeam] = useState<TeamState | null>(null);
  // The row whose page is open (its details and actions), by row key.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addCount, setAddCount] = useState(1);
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();

  // ── Roster (shared-ticket member details) ──
  const [roster, setRoster] = useState<MyGroupRoster | null>(null);
  // Per-member custom fields for this ticket. Team-wide (per_group) fields are
  // asked once at registration and aren't editable per member, so they're out.
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GroupMemberInput[]>([]);
  // Which member is being edited; null = everyone (safe fallback, unused by UI).
  const [editIndex, setEditIndex] = useState<number | null>(null);
  // fill = empty seat (full form, once); edit = filled seat (identity locked,
  // only blanks + custom answers editable); view = seat a member claimed
  // themselves (read-only, the server ignores lead edits to it).
  const [editMode, setEditMode] = useState<'fill' | 'edit' | 'view'>('fill');
  const [saving, setSaving] = useState(false);
  const [rosterError, setRosterError] = useState('');

  // ── Answers block: a lead's team (per_group) answers, or a teammate's own ──
  const [details, setDetails] = useState<MyDetails | null>(null);
  const [teamFields, setTeamFields] = useState<CustomField[]>([]);
  const [teamDraft, setTeamDraft] = useState<Record<string, unknown>>({});
  const [savingTeam, setSavingTeam] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    // Both sub-systems are optional; tolerate either failing.
    const [seatRes, rosterRes] = await Promise.allSettled([
      getRegistrationSeats(registrationId),
      getMyGroupMembers(registrationId),
    ]);
    if (seatRes.status === 'fulfilled') setSeats(seatRes.value.seats);
    if (rosterRes.status === 'fulfilled' && rosterRes.value) {
      const r = rosterRes.value;
      setRoster(r);
      try {
        const { fields } = await getEventCustomFields(r.eventId);
        const applicable = r.ticketTypeId ? getFieldsForTicket(fields, r.ticketTypeId) : fields;
        setCustomFields(applicable.filter((f) => !f.per_group).sort((a, b) => a.display_order - b.display_order));
      } catch {
        setCustomFields([]);
      }
    }
    // A lead edits the team's per-group answers here; a teammate (no access to
    // seats/roster) edits their own per-member answers.
    const [mine, teamRes] = await Promise.all([
      getMyDetails(registrationId).catch(() => null),
      getTeamState(registrationId),
    ]);
    setTeam(teamRes.ok ? teamRes.data : null);
    const isMember = mine?.ok && mine.data.role === 'member';
    if (mine?.ok && mine.data.role !== 'solo') {
      const d = mine.data;
      setDetails(d);
      setTeamDraft({ ...((isMember ? d.member?.customFields : d.formResponses) ?? {}) });
      const { fields } = await getEventCustomFields(d.eventId).catch(() => ({ fields: [] as CustomField[] }));
      setTeamFields(getFieldsForTicket(fields, d.ticketTypeId ?? '').filter((f) => !!f.per_group === !isMember));
    }
    if (seatRes.status === 'rejected' && rosterRes.status === 'rejected' && !isMember) {
      setError((seatRes.reason as Error)?.message || 'Could not load your group.');
    }
    setLoading(false);
  }, [registrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Seat actions ──
  const openComposer = (seatIndex: number | null = null) => {
    setEmail('');
    setComposerSeat(seatIndex);
    setReplacing(null);
    setComposerOpen(true);
  };

  const invite = async () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      AppAlert.alert('Check the email', 'That doesn’t look like an email address.');
      return;
    }
    setInviting(true);
    try {
      if (replacing) {
        const res = await replaceMemberAsLead(registrationId, replacing.seatIndex, value);
        if (!res.ok) throw new Error(res.message);
        setReplacing(null);
      } else {
        await inviteSeats(registrationId, [{ email: value, ...(composerSeat != null ? { seatIndex: composerSeat } : {}) }]);
      }
      setEmail('');
      setComposerOpen(false);
      await load();
    } catch (e: any) {
      AppAlert.alert('Could not invite', e?.message || 'Please try again.');
    } finally {
      setInviting(false);
    }
  };

  /** Leave the seat's page (back to the list), e.g. after an action changed it. */
  const closeSeat = () => {
    setOpenKey(null);
    setEditing(false);
    setEditIndex(null);
    setRosterError('');
  };

  /** Confirm, run, then go back to the list and refresh. */
  const confirmThen = (
    title: string,
    body: string,
    cta: string,
    run: () => Promise<{ ok: boolean; message?: string } | void>,
    destructive = true,
  ) =>
    AppAlert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: cta,
        style: destructive ? 'destructive' : 'default',
        onPress: async () => {
          try {
            const res = await run();
            if (res && !res.ok) {
              AppAlert.alert("Couldn't do that", res.message ?? 'Please try again.');
              return;
            }
            closeSeat();
          } catch (e: any) {
            AppAlert.alert("Couldn't do that", e?.message || 'Please try again.');
          } finally {
            await load();
          }
        },
      },
    ]);

  const inviteInto = (seatIndex: number, replacingName?: string) => {
    closeSeat();
    setEmail('');
    setComposerSeat(seatIndex);
    setReplacing(replacingName ? { seatIndex, name: replacingName } : null);
    setComposerOpen(true);
  };

  // ── Team changes (lead, inside the organiser's window) ──
  const lead = team?.isLead ? team : null;
  const teamOpen = !!lead?.open;
  const canShrink = !!lead && lead.groupSize > lead.minGroupSize;
  const removeNote = `Your team gets one smaller and the seat goes back on sale.${lead?.addNeedsPayment ? ' Nothing is refunded.' : ''}`;

  /** Everything the lead can do to one seat, by its state. */
  const seatActions = (s: GroupSeat, name: string, isLead: boolean): SeatAction[] => {
    if (isLead) return [];
    const i = s.seatIndex;
    const out: SeatAction[] = [];
    const removeAction: SeatAction = {
      key: 'remove',
      label: s.status === 'CLAIMED' ? 'Remove from team' : 'Remove this seat',
      danger: true,
      onPress: () =>
        confirmThen(
          s.status === 'CLAIMED' ? `Remove ${name} from the team?` : 'Remove this seat?',
          (s.status === 'CLAIMED' ? 'They lose their ticket and are told by email. ' : '') + removeNote,
          'Remove',
          () => removeSeatAsLead(registrationId, i),
        ),
    };
    switch (s.status) {
      case 'OPEN':
        out.push({ key: 'invite', label: 'Invite by email', onPress: () => inviteInto(i) });
        out.push({
          key: 'release',
          label: 'Release seat',
          danger: true,
          onPress: () =>
            confirmThen('Release this seat?', 'It is removed from your group. You keep the seat you paid for and can reopen it later.', 'Release', () =>
              releaseSeat(registrationId, i),
            ),
        });
        break;
      case 'INVITED':
        out.push({
          key: 'revoke',
          label: 'Revoke invite',
          onPress: () => confirmThen('Revoke invite?', 'The current link stops working and the seat re-opens.', 'Revoke', () => revokeSeat(registrationId, i)),
        });
        out.push({
          key: 'release',
          label: 'Release seat',
          danger: true,
          onPress: () =>
            confirmThen('Release this seat?', 'The invite stops working and the seat leaves your group. You keep the seat you paid for and can reopen it later.', 'Release', () =>
              releaseSeat(registrationId, i),
            ),
        });
        break;
      case 'RELEASED':
        out.push({
          key: 'reopen',
          label: 'Reopen seat',
          onPress: () => confirmThen('Reopen this seat?', 'It goes back to open so you can invite someone.', 'Reopen', () => reopenSeat(registrationId, i), false),
        });
        break;
      default:
        // A teammate the lead typed in has no app account on the seat, so
        // they can't open their ticket (or a hackathon). Inviting them keeps
        // them on the team, so it's allowed even while team changes are closed.
        if (!s.claimedByUserId) {
          const to = s.inviteEmail || (typeof s.memberDetails?.email === 'string' ? s.memberDetails.email.trim() : '');
          out.push({
            key: 'link',
            label: s.inviteEmail ? 'Resend app invite' : 'Invite to the app',
            onPress: () =>
              to
                ? confirmThen(
                    `Invite ${name} to the app?`,
                    `We'll email ${to} a link. Once they accept, they get their own ticket and stay in the team.`,
                    'Send invite',
                    async () => {
                      await inviteSeats(registrationId, [{ seatIndex: i, email: to }]);
                    },
                    false,
                  )
                : inviteInto(i),
          });
        }
        if (!teamOpen) return out;
        if (s.claimedByUserId && !team?.leadTransfer) {
          out.push({
            key: 'lead',
            label: 'Make team lead',
            onPress: () =>
              confirmThen(
                `Make ${name} the team lead?`,
                "They'll be asked to accept. Once they do, they manage the team and its booking, including refunds, and you become a member.",
                'Ask them',
                () => requestLeadTransfer(registrationId, i),
                false,
              ),
          });
        }
        out.push({ key: 'give', label: 'Give the seat to someone else', onPress: () => inviteInto(i, name) });
        out.push({
          key: 'free',
          label: 'Free the seat',
          danger: true,
          onPress: () =>
            confirmThen(
              `Take the seat back from ${name}?`,
              "They lose this seat and their ticket stops working. They're told by email. The seat stays in your team, open for someone new.",
              'Free the seat',
              () => replaceMemberAsLead(registrationId, i),
            ),
        });
        break;
    }
    if (teamOpen && canShrink) out.push(removeAction);
    return out;
  };

  const cancelTransfer = async () => {
    const res = await cancelLeadTransfer(registrationId);
    if (!res.ok) AppAlert.alert('Could not cancel', res.message);
    await load();
  };

  const answerTransfer = async (accept: boolean) => {
    if (!team?.leadTransfer) return;
    const res = await respondLeadTransfer(team.leadTransfer.id, accept);
    if (!res.ok) {
      AppAlert.alert(accept ? 'Could not accept' : 'Could not decline', res.message);
    } else if (accept) {
      AppAlert.alert("You're the team lead", 'You can now manage the team and its booking.');
    }
    await load();
  };

  /** Add seats: straight away when free, else pay for them first. */
  const addSeats = async () => {
    if (!lead) return;
    setAdding(true);
    try {
      if (!lead.addNeedsPayment) {
        const res = await addSeatsAsLead(registrationId, addCount);
        if (!res.ok) AppAlert.alert('Could not add seats', res.message);
        return;
      }
      const order = await createAddSeatsOrder(registrationId, addCount);
      if (!order.ok) {
        AppAlert.alert("Couldn't start payment", order.message);
        return;
      }
      const payment: any = await RazorpayCheckout.open({
        key: order.data.razorpayKeyId,
        order_id: order.data.razorpayOrderId,
        amount: order.data.amount,
        currency: order.data.currency || 'INR',
        name: 'Unifesto',
        description: `${addCount} extra seat${addCount > 1 ? 's' : ''} · ${order.data.eventTitle}`,
        prefill: { name: user?.fullName || '', email: '', contact: user?.mobileNumber || '' },
        theme: { color: '#3491ff' },
      } as any);
      const verified = await verifyAddSeats(order.data.purchaseId, {
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      });
      if (!verified.ok) {
        AppAlert.alert('Payment received', "We're adding your seats. Pull down to refresh in a moment.");
      } else if (verified.data.outcome === 'refund') {
        AppAlert.alert("Seats couldn't be added", "They're no longer available, so your payment is being refunded.");
      }
    } catch (err: any) {
      // Razorpay reports a dismissed sheet as an error; nothing to alarm anyone about.
      const cancelled = err?.code === 0 || err?.description === 'Payment Cancelled';
      if (!cancelled) AppAlert.alert('Payment failed', err?.description || err?.message || 'Please try again');
    } finally {
      setAdding(false);
      setAddCount(1);
      await load();
    }
  };

  // ── Roster editing ──
  const startEditing = (index: number | null = null, mode: 'fill' | 'edit' | 'view' = 'fill') => {
    setEditMode(mode);
    const size = roster?.groupSize ?? roster?.members.length ?? 0;
    const base = roster?.members ?? [];
    setDraft(
      Array.from({ length: size }).map((_, i) => {
        const m = base[i] ?? { name: '', email: '', mobile: '', gender: '' };
        // Stored gender ("MALE") → picker label ("Male") so it pre-selects.
        return { ...m, gender: profileGenderToAttendeeOption(m.gender), customFields: { ...(m.customFields ?? {}) } };
      }),
    );
    setEditIndex(index);
    setRosterError('');
    setEditing(true);
  };

  const closeEditing = () => {
    setOpenKey(null);
    setEditing(false);
    setEditIndex(null);
    setRosterError('');
  };

  const changeMember = (index: number, field: keyof GroupMemberInput, value: string) =>
    setDraft((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));

  const changeMemberCustomField = (index: number, fieldId: string, value: any) =>
    setDraft((prev) =>
      prev.map((m, i) => (i === index ? { ...m, customFields: { ...(m.customFields ?? {}), [fieldId]: value } } : m)),
    );


  const saveRoster = async () => {
    const toCheck = editIndex === null ? draft.map((_, i) => i) : [editIndex];
    for (const i of toCheck) {
      const m = draft[i];
      const ok = m.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email.trim()) && /^[0-9]{10}$/.test(m.mobile.trim());
      if (!ok) {
        setRosterError(`Please complete member ${i + 1}: name, a valid email and a 10-digit mobile.`);
        return;
      }
      // Answer policy: what the lead types for a teammate must be valid, but
      // required answers aren't forced (the member can add them on claim).
      const problem = firstFormProblem(customFields, m.customFields, { enforceRequired: false });
      if (problem) {
        setRosterError(`Member ${i + 1}: ${problem}`);
        return;
      }
    }
    setSaving(true);
    setRosterError('');
    try {
      await updateMyGroupMembers(registrationId, buildRosterPayload(draft, roster?.members ?? [], toCheck));
      closeEditing();
      await load();
    } catch (e) {
      setRosterError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveTeam = async () => {
    const problem = firstFormProblem(teamFields, teamDraft, { enforceRequired: true });
    if (problem) {
      AppAlert.alert('Check your answers', problem);
      return;
    }
    setSavingTeam(true);
    const isMember = details?.role === 'member';
    const res = await updateMyDetails(registrationId, isMember ? { customFields: teamDraft } : { formResponses: teamDraft });
    setSavingTeam(false);
    if (!res.ok) {
      AppAlert.alert('Couldn’t save', res.message);
      return;
    }
    setDetails(res.data);
    setTeamDraft({ ...((isMember ? res.data.member?.customFields : res.data.formResponses) ?? {}) });
    AppAlert.alert('Saved', isMember ? 'Your answers are updated.' : 'Team answers are updated.');
  };

  // ── Rows ──
  const canEdit = !!roster?.editable;
  // The organiser's edit switch + deadline (the server enforces it too).
  const answersOpen = details ? details.editable : true;
  const rows: GroupRow[] =
    seats.length > 0
      ? seats.map((s, i): GroupRow => {
          const md = s.memberDetails || {};
          const key = `seat-${s.seatIndex}`;
          const isLead = i === 0;
          const label = `Seat ${s.seatIndex}`;
          const actions = seatActions(s, md.name || label, isLead);
          const onOpen = () => setOpenKey(key);
          switch (s.status) {
            case 'RELEASED':
              return { key, kind: 'released', isLead, label, onOpen, actions };
            case 'OPEN':
              return { key, kind: 'open', isLead, label, onOpen, actions };
            case 'INVITED':
              return { key, kind: 'invited', isLead, label, email: s.inviteEmail, onOpen, actions };
            default:
              return {
                key,
                kind: 'filled',
                isLead,
                name: md.name || label,
                sub: md.email ?? null,
                appStatus:
                  isLead || s.claimedByUserId
                    ? null
                    : s.inviteEmail
                      ? `App invite sent to ${s.inviteEmail}`
                      : 'Not on the app yet',
                editable: canEdit,
                actions,
                // With a roster, the member's page is the member editor; without
                // one, it is the seat page (details + actions).
                onOpen: () => {
                  setOpenKey(key);
                  if (roster) startEditing(i, !canEdit || !answersOpen || (i > 0 && s.claimedByUserId) ? 'view' : 'edit');
                },
              };
          }
        })
      : Array.from({ length: roster?.groupSize ?? 0 }).map((_, i): GroupRow => {
          const m = roster?.members[i];
          const name = m?.name?.trim();
          const key = `member-${i}`;
          return name
            ? {
                key,
                kind: 'filled',
                isLead: i === 0,
                name,
                sub: m?.email?.trim() || null,
                appStatus: null,
                editable: true,
                actions: [],
                onOpen: () => {
                  setOpenKey(key);
                  startEditing(i, canEdit && answersOpen ? 'edit' : 'view');
                },
              }
            : // Email invite only: an empty spot is never typed in by the lead.
              // (The server creates seats for older groups on first load, so
              // this fallback is only hit if the seat list failed to load.)
              {
                key,
                kind: 'open',
                isLead: i === 0,
                label: `Member ${i + 1}`,
                onOpen: () => setOpenKey(key),
                actions: [{ key: 'invite', label: 'Invite by email', onPress: () => inviteInto(i + 1) }],
              };
        });

  /** The open seat's row and, for a filled seat, its saved details. */
  const openRow = rows.find((r) => r.key === openKey) ?? null;
  const openSeat = openKey?.startsWith('seat-') ? seats.find((x) => `seat-${x.seatIndex}` === openKey) ?? null : null;

  // "Filled" = has a person (claimed seat / named member); released seats
  // leave the group, so they don't count toward the total either.
  const activeRows = rows.filter((r) => r.kind !== 'released');
  const filledCount = activeRows.filter((r) => r.kind === 'filled').length;

  return {
    loading,
    error,
    usesSeats: seats.length > 0,
    rows,
    filledCount,
    totalCount: activeRows.length,
    // invite composer (seats)
    composerOpen,
    setComposerOpen: (open: boolean) => {
      setComposerOpen(open);
      if (!open) setReplacing(null);
    },
    /** Who the composer's invite replaces, when it's replacing someone. */
    replacing,
    email,
    setEmail,
    inviting,
    invite,
    // member editor (roster)
    editing,
    editIndex,
    editMode,
    /** The member as saved on the server (identity fields shown read-only). */
    savedMember: (index: number) => roster?.members[index] ?? null,
    draft,
    customFields,
    saving,
    rosterError,
    changeMember,
    changeMemberCustomField,
    saveRoster,
    closeEditing,
    // the open seat's page
    openRow,
    openSeat,
    closeSeat,
    // team changes
    team,
    teamOpen,
    addCount,
    setAddCount,
    adding,
    addSeats,
    cancelTransfer,
    answerTransfer,
    // answers block (lead: team answers · teammate: own answers)
    isMember: details?.role === 'member',
    /** Why answers can't be changed right now, when they can't. */
    lockedReason: details && !details.editable ? details.lockedReason ?? 'These can’t be changed right now.' : null,
    details,
    teamFields,
    teamDraft,
    teamChanged:
      JSON.stringify(teamDraft) !==
      JSON.stringify((details?.role === 'member' ? details.member?.customFields : details?.formResponses) ?? {}),
    changeTeamAnswer: (fieldId: string, value: unknown) => setTeamDraft((prev) => ({ ...prev, [fieldId]: value })),
    savingTeam,
    saveTeam,
  };
}
