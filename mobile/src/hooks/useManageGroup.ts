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
export type GroupRow =
  | { key: string; kind: 'filled'; isLead: boolean; name: string; sub: string | null; onEdit: () => void; editable: boolean; onChange?: () => void }
  | { key: string; kind: 'invited'; isLead: boolean; label: string; email: string | null; onRevoke: () => void; onRelease: () => void; onRemove?: () => void }
  | { key: string; kind: 'open'; isLead: boolean; label: string; onInvite: () => void; onRelease?: () => void; onRemove?: () => void }
  | { key: string; kind: 'released'; isLead: boolean; label: string; onReopen: () => void; onRemove?: () => void };

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

  const showClaimDetails = (s: GroupSeat) => {
    const md = s.memberDetails || {};
    const lines = [md.name, md.email, md.mobile].filter(Boolean).join('\n');
    AppAlert.alert(`Seat ${s.seatIndex}`, lines || 'This seat has been claimed.', [{ text: 'Close' }]);
  };

  /** Take a filled seat back from its member: hand it to someone new, or just free it. */
  const replace = (seatIndex: number, name: string) => {
    const freeSeat = async () => {
      const res = await replaceMemberAsLead(registrationId, seatIndex);
      if (!res.ok) AppAlert.alert('Could not remove', res.message);
      await load();
    };
    AppAlert.alert(
      `Replace ${name}?`,
      "They lose this seat and their ticket stops working. They're told by email.",
      [
        {
          text: 'Invite someone else',
          onPress: () => {
            setEmail('');
            setComposerSeat(seatIndex);
            setReplacing({ seatIndex, name });
            setComposerOpen(true);
          },
        },
        { text: 'Just free the seat', style: 'destructive', onPress: () => void freeSeat() },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const revoke = (seatIndex: number) => {
    AppAlert.alert('Revoke invite?', 'The current link stops working and the seat re-opens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeSeat(registrationId, seatIndex);
            await load();
          } catch (e: any) {
            AppAlert.alert('Error', e?.message || 'Could not revoke.');
          }
        },
      },
    ]);
  };

  const release = (seatIndex: number) => {
    AppAlert.alert(
      'Release this seat?',
      'It is removed from your group. You keep the seat you paid for and can reopen it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            try {
              await releaseSeat(registrationId, seatIndex);
              await load();
            } catch (e: any) {
              AppAlert.alert('Error', e?.message || 'Could not release the seat.');
            }
          },
        },
      ],
    );
  };

  const reopen = async (seatIndex: number) => {
    try {
      await reopenSeat(registrationId, seatIndex);
      await load();
    } catch (e: any) {
      AppAlert.alert('Error', e?.message || 'Could not reopen the seat.');
    }
  };

  // ── Team changes (lead, inside the organiser's window) ──
  const lead = team?.isLead ? team : null;
  const teamOpen = !!lead?.open;
  const canShrink = !!lead && lead.groupSize > lead.minGroupSize;

  const removeSeat = (seatIndex: number, name: string | null) =>
    AppAlert.alert(
      name ? `Remove ${name} from the team?` : 'Remove this seat?',
      (name ? "They lose their ticket and are told by email. " : '') +
        `Your team gets one smaller and the seat goes back on sale.${lead?.addNeedsPayment ? ' Nothing is refunded.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await removeSeatAsLead(registrationId, seatIndex);
            if (!res.ok) AppAlert.alert('Could not remove', res.message);
            await load();
          },
        },
      ],
    );

  const makeLead = (seatIndex: number, name: string) =>
    AppAlert.alert(
      `Make ${name} the team lead?`,
      "They'll be asked to accept. Once they do, they manage the team and its booking, including refunds, and you become a member.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ask them',
          onPress: async () => {
            const res = await requestLeadTransfer(registrationId, seatIndex);
            if (!res.ok) AppAlert.alert('Could not ask', res.message);
            await load();
          },
        },
      ],
    );

  /** One menu for a filled member seat: lead, replace, free, remove. */
  const memberMenu = (s: GroupSeat, name: string) => {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (s.claimedByUserId && !team?.leadTransfer) options.push({ text: 'Make team lead', onPress: () => makeLead(s.seatIndex, name) });
    options.push({ text: 'Give the seat to someone else', onPress: () => replace(s.seatIndex, name) });
    if (canShrink) options.push({ text: 'Remove from team', style: 'destructive', onPress: () => removeSeat(s.seatIndex, name) });
    options.push({ text: 'Cancel', style: 'cancel' });
    AppAlert.alert(name, undefined, options);
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
          switch (s.status) {
            case 'RELEASED':
              return {
                key,
                kind: 'released',
                isLead,
                label,
                onReopen: () => reopen(s.seatIndex),
                ...(teamOpen && canShrink ? { onRemove: () => removeSeat(s.seatIndex, null) } : {}),
              };
            case 'OPEN':
              return {
                key,
                kind: 'open',
                isLead,
                label,
                onInvite: () => openComposer(s.seatIndex),
                onRelease: () => release(s.seatIndex),
                ...(teamOpen && canShrink ? { onRemove: () => removeSeat(s.seatIndex, null) } : {}),
              };
            case 'INVITED':
              return {
                key,
                kind: 'invited',
                isLead,
                label,
                email: s.inviteEmail,
                onRevoke: () => revoke(s.seatIndex),
                onRelease: () => release(s.seatIndex),
                ...(teamOpen && canShrink ? { onRemove: () => removeSeat(s.seatIndex, null) } : {}),
              };
            default:
              return {
                key,
                kind: 'filled',
                isLead,
                name: md.name || label,
                sub: md.email ?? null,
                editable: canEdit,
                ...(teamOpen && !isLead ? { onChange: () => memberMenu(s, md.name || label) } : {}),
                onEdit: !roster
                  ? () => showClaimDetails(s)
                  : () => startEditing(i, !canEdit || !answersOpen || (i > 0 && s.claimedByUserId) ? 'view' : 'edit'),
              };
          }
        })
      : Array.from({ length: roster?.groupSize ?? 0 }).map((_, i): GroupRow => {
          const m = roster?.members[i];
          const name = m?.name?.trim();
          return name
            ? { key: `member-${i}`, kind: 'filled', isLead: i === 0, name, sub: m?.email?.trim() || null, editable: true, onEdit: () => startEditing(i, canEdit && answersOpen ? 'edit' : 'view') }
            : // Email invite only: an empty spot is never typed in by the lead.
              // (The server creates seats for older groups on first load, so
              // this fallback is only hit if the seat list failed to load.)
              { key: `member-${i}`, kind: 'open', isLead: i === 0, label: `Member ${i + 1}`, onInvite: () => openComposer(i + 1) };
        });

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
