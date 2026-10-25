import { EMAIL_RE } from '../lib/constants';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { splitFields } from '../hooks/useEventRegistration';
import { getManagedEvent } from '../lib/api/eventAdmin';
import { getEventCustomFields, getFieldsForTicket, type CustomField } from '../lib/api/tickets';
import {
  getMyFreeAddRequests,
  manualAddAttendee,
  requestFreeAdds,
  type ManualMember,
} from '../lib/api/attendeeAdd';
import { ATTENDEE_GENDER_OPTIONS } from '../utils/profile';
import CustomFieldInput from '../components/CustomFieldInput';
import { firstFormProblem, visibleFields } from '../utils/formQuestions';
import { BlockTitle, FieldRow, SwitchRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const PHONE = /^[0-9]{10}$/;
const GENDERS = ATTENDEE_GENDER_OPTIONS.map((g) => ({ value: g, label: g }));

interface TicketOption {
  id: string;
  name: string;
  kind: string;
  price: number;
  minGroupSize: number | null;
  maxGroupSize: number | null;
}

type Person = ManualMember & { customFields: Record<string, unknown> };
const blank = (): Person => ({ name: '', email: '', mobile: '', gender: '', customFields: {} });

/** "Member 2: " prefix for group errors; nothing for the lead. */
function checkPerson(p: Person, who: string, fields: CustomField[]): string {
  const pre = who ? `${who}: ` : '';
  if (!p.name.trim()) return `${pre}name is required.`;
  if (!EMAIL_RE.test(p.email.trim())) return `${pre}a valid email is required.`;
  if (!PHONE.test(p.mobile.trim())) return `${pre}a 10-digit phone number is required.`;
  if (!p.gender) return `${pre}gender is required.`;
  // Answer policy: a curator may not know every answer, so required ones
  // aren't forced, but what is entered must be valid (the backend agrees).
  const problem = firstFormProblem(fields, p.customFields, { enforceRequired: false });
  return problem ? `${pre}${problem}` : '';
}

/**
 * Add one person (or a whole group) to an event. The account is found or
 * created by email. A paid ticket sends them a payment link, unless a
 * Platform Admin has allowed free adds for this event.
 */
export default function AddAttendeeScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const insets = useSafeAreaInsets();

  const [tickets, setTickets] = useState<TicketOption[] | null>(null);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [allowFree, setAllowFree] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [ticketId, setTicketId] = useState('');
  const [lead, setLead] = useState<Person>(blank());
  const [groupSize, setGroupSize] = useState('2');
  const [members, setMembers] = useState<Person[]>([]);
  const [team, setTeam] = useState<Record<string, unknown>>({});
  const [collectPayment, setCollectPayment] = useState(true);
  const [freeReq, setFreeReq] = useState<'none' | 'PENDING' | 'REJECTED'>('none');
  const [freeReason, setFreeReason] = useState('');
  const [freeBusy, setFreeBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    void Promise.all([getManagedEvent(eventId), getEventCustomFields(eventId)]).then(([ev, cf]) => {
      if (!ev.ok) {
        setLoadError(ev.message);
        return;
      }
      const raw = ((ev.data as unknown as { ticketTypes?: Record<string, unknown>[] }).ticketTypes ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        kind: t.kind as string,
        price: Number(t.price) || 0,
        minGroupSize: (t.minGroupSize as number | null) ?? null,
        maxGroupSize: (t.maxGroupSize as number | null) ?? null,
      }));
      setTickets(raw);
      setFields(cf.fields);
      setAllowFree(!!(ev.data as unknown as { allowFreeAttendeeAdd?: boolean }).allowFreeAttendeeAdd);
      if (raw[0]) setTicketId(raw[0].id);
    });
  }, [eventId]);

  const ticket = tickets?.find((t) => t.id === ticketId);
  const isGroup = ticket?.kind === 'GROUP';
  const isPaid = (ticket?.price ?? 0) > 0;
  const { perMember, team: teamFields } = useMemo(
    () => splitFields(ticket ? getFieldsForTicket(fields, ticket.id) : [], isGroup),
    [fields, ticket, isGroup],
  );
  const size = Math.max(1, Number(groupSize) || 0);
  const minSize = ticket?.minGroupSize ?? 2;
  const maxSize = ticket?.maxGroupSize ?? Infinity;
  // Every member is typed by hand here; a bigger group belongs in a CSV import.
  const MAX_TYPED = 30;
  const extra = isGroup ? Math.min(MAX_TYPED - 1, Math.max(0, size - 1)) : 0;
  const payNow = isPaid && (allowFree ? collectPayment : true);

  // Seed the group size from the ticket's minimum when switching to a group ticket.
  useEffect(() => {
    if (isGroup) setGroupSize(String(ticket?.minGroupSize ?? 2));
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pending free-add request? Then don't offer a duplicate.
  useEffect(() => {
    if (!eventId || !isPaid || allowFree) return;
    void getMyFreeAddRequests(eventId).then((r) => {
      if (!r.ok) return;
      setFreeReq(r.data.some((x) => x.status === 'PENDING') ? 'PENDING' : r.data.some((x) => x.status === 'REJECTED') ? 'REJECTED' : 'none');
    });
  }, [eventId, isPaid, allowFree]);

  const setMember = (i: number, patch: Partial<Person>) =>
    setMembers((prev) => {
      const next = [...prev];
      next[i] = { ...(next[i] ?? blank()), ...patch };
      return next;
    });

  const validate = () => {
    if (!ticket) return 'Pick a ticket.';
    const leadProblem = checkPerson(lead, isGroup ? 'Member 1' : '', perMember);
    if (leadProblem) return leadProblem;
    if (isGroup) {
      if (size > MAX_TYPED) return `For groups over ${MAX_TYPED}, use Import from CSV.`;
      if (size < minSize || size > maxSize)
        return Number.isFinite(maxSize) ? `Group size must be ${minSize} to ${maxSize}.` : `Group size must be at least ${minSize}.`;
      const teamProblem = firstFormProblem(teamFields, team, { enforceRequired: false });
      if (teamProblem) return teamProblem;
      for (let i = 0; i < extra; i++) {
        const p = checkPerson(members[i] ?? blank(), `Member ${i + 2}`, perMember);
        if (p) return p;
      }
    }
    return '';
  };

  const confirmAdd = () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    const who = isGroup ? `${lead.name.trim()} and ${extra} more` : lead.name.trim();
    AppAlert.alert(
      payNow ? 'Send a payment link?' : `Add ${who}?`,
      payNow
        ? `${who} gets a payment link for ${ticket!.name}. They're registered once they pay.`
        : `${ticket!.name}. Their ticket is emailed straight away.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: payNow ? 'Send link' : 'Add', onPress: () => void submit() },
      ],
    );
  };

  const submit = async () => {
    setSaving(true);
    const clean = (p: Person): ManualMember => ({
      name: p.name.trim(),
      email: p.email.trim(),
      mobile: p.mobile.trim(),
      gender: p.gender,
      ...(Object.keys(p.customFields).length ? { customFields: p.customFields } : {}),
    });
    const res = await manualAddAttendee(eventId!, {
      ticketTypeId: ticketId,
      ...clean(lead),
      ...(isGroup
        ? {
            groupSize: size,
            groupMembers: members.slice(0, extra).map(clean),
            ...(Object.keys(team).length ? { formResponses: team } : {}),
            ...(Object.keys(lead.customFields).length ? { leadCustomFields: lead.customFields } : {}),
          }
        : Object.keys(lead.customFields).length
          ? { formResponses: lead.customFields }
          : {}),
      collectPayment: payNow,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    // Clear for the next person; stay on the screen.
    setLead(blank());
    setMembers([]);
    setTeam({});
    const link = res.data.paymentLinkUrl;
    AppAlert.alert(
      link ? 'Payment link sent' : 'Added',
      res.data.message,
      link
        ? [
            { text: 'Share link', onPress: () => void Share.share({ message: link }) },
            { text: 'Done', style: 'cancel' },
          ]
        : undefined,
    );
  };

  const sendFreeRequest = async () => {
    if (!freeReason.trim()) return;
    setFreeBusy(true);
    const res = await requestFreeAdds(eventId!, freeReason.trim());
    setFreeBusy(false);
    if (!res.ok) {
      AppAlert.alert("Couldn't send", res.message);
      return;
    }
    setFreeReq('PENDING');
    setFreeReason('');
  };

  if (!tickets) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {loadError ? (
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.muted, { color: c.soft }]}>{loadError}</Text>
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  if (tickets.length === 0) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.muted, { color: c.soft }]}>Add a ticket or RSVP option to this event first.</Text>
        </View>
      </CosmosScreen>
    );
  }

  const personBlock = (p: Person, onChange: (patch: Partial<Person>) => void, title: string) => (
    <>
      <SettingsGroup title={title} plain>
        <FieldRow stacked label="Name" value={p.name} onChangeText={(v) => onChange({ name: v })} autoCapitalize="words" />
        <FieldRow
          stacked
          label="Email"
          value={p.email}
          onChangeText={(v) => onChange({ email: v })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FieldRow
          stacked
          label="Phone"
          value={p.mobile}
          onChangeText={(v) => onChange({ mobile: v.replace(/\D/g, '').slice(-10) })}
          keyboardType="phone-pad"
          placeholder="10 digits"
        />
      </SettingsGroup>
      <View style={styles.block}>
        <ChipPicker options={GENDERS} value={p.gender} onChange={(g) => onChange({ gender: g })} />
      </View>
      {visibleFields(perMember, p.customFields).map((f) => (
        <View key={f.id} style={styles.block}>
          <CustomFieldInput
            field={f}
            value={p.customFields[f.id]}
            onChange={(v) => onChange({ customFields: { ...p.customFields, [f.id]: v } })}
          />
        </View>
      ))}
    </>
  );

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible label={payNow ? 'Send payment link' : 'Add attendee'} onPress={confirmAdd} loading={saving} error={error} />}
    >
      <BlockTitle>Ticket</BlockTitle>
      <ChipPicker
        options={tickets.map((t) => ({ value: t.id, label: t.price > 0 ? `${t.name} · ₹${t.price.toLocaleString('en-IN')}` : t.name }))}
        value={ticketId}
        onChange={(v) => v && setTicketId(v)}
      />

      {isGroup ? (
        <SettingsGroup title="Group" plain>
          <FieldRow
            label={`Group size (${minSize}${Number.isFinite(maxSize) ? `–${maxSize}` : '+'})`}
            value={groupSize}
            onChangeText={(v) => setGroupSize(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
          />
        </SettingsGroup>
      ) : null}

      {personBlock(lead, (patch) => setLead((l) => ({ ...l, ...patch })), isGroup ? 'Member 1 (lead)' : 'Person')}

      {isGroup && teamFields.length > 0 ? (
        <>
          <Text style={[styles.heading, { color: c.text }]}>About the team</Text>
          {visibleFields(teamFields, team).map((f) => (
            <View key={f.id} style={styles.block}>
              <CustomFieldInput field={f} value={team[f.id]} onChange={(v) => setTeam((t) => ({ ...t, [f.id]: v }))} />
            </View>
          ))}
        </>
      ) : null}

      {Array.from({ length: extra }, (_, i) => (
        <View key={i}>{personBlock(members[i] ?? blank(), (patch) => setMember(i, patch), `Member ${i + 2}`)}</View>
      ))}

      {isPaid ? (
        allowFree ? (
          <SettingsGroup title="Payment" plain>
            <SwitchRow
              label="Collect payment"
              hint={collectPayment ? 'They get a payment link and are registered once they pay.' : 'Added free, ticket emailed now.'}
              value={collectPayment}
              onValueChange={setCollectPayment}
            />
          </SettingsGroup>
        ) : (
          <>
            <Text style={[styles.note, { color: c.muted, marginTop: spacing[6] }]}>
              They'll get a payment link. Adding people free to a paid ticket needs approval from Unifesto.
            </Text>
            {freeReq === 'PENDING' ? (
              <Text style={[styles.note, { color: c.warn }]}>Your free-add request is waiting for review.</Text>
            ) : (
              <>
                {freeReq === 'REJECTED' ? (
                  <Text style={[styles.note, { color: c.danger }]}>Your last free-add request was declined.</Text>
                ) : null}
                <SettingsGroup plain>
                  <FieldRow stacked multiline label="Why add people free? (optional request)" value={freeReason} onChangeText={setFreeReason} />
                </SettingsGroup>
                {freeReason.trim() ? (
                  <Button label="Ask to allow free adds" variant="secondary" fullWidth loading={freeBusy} onPress={sendFreeRequest} style={{ marginTop: spacing[3] }} />
                ) : null}
              </>
            )}
          </>
        )
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  block: { marginTop: spacing[4] },
  heading: { marginTop: spacing[8], marginLeft: spacing[1], fontSize: typography.fontSize.base, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
