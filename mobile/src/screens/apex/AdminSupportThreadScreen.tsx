import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildLabel, type BuildInfo } from '../../lib/appBuild';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { getAdminTicket, PRIORITY_LABEL, replyAsStaff, sendToSpace, triageTicket, type AdminTicket } from '../../lib/api/apexSupport';
import { searchEvents, type AdminEventRow } from '../../lib/api/apex';
import {
  CATEGORY_LABEL,
  DESK_STATUS_LABEL,
  KIND_LABEL,
  type SupportMessage,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '../../lib/api/support';
import CosmosBackdrop from '../../components/ui/CosmosBackdrop';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { Button } from '../../components/ui';
import SearchField from '../../components/manage/SearchField';
import { AppAlert } from '../../components/ui/AppAlert';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import ChipPicker from '../../components/manage/ChipPicker';
import { CaseMessages, Composer, GUTTER, personName, sideOf } from '../../components/support/CaseThread';
import { longDate, shortDate } from '../../components/apex/ApexRow';
import { DESK_LABEL } from './SupportInboxScreen';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const STATUSES: { value: SupportTicketStatus; label: string }[] = (['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const).map((s) => ({
  value: s,
  label: DESK_STATUS_LABEL[s],
}));

const PRIORITIES = (Object.keys(PRIORITY_LABEL) as SupportTicketPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));

/**
 * One Assist case from Unifesto's side: triage (status, priority, owner), who
 * raised it, the conversation with a reply box and internal notes, and for a
 * help question on our desk, Send to organiser. Desk messages sit on the
 * right here, the reverse of the requester's view.
 */
export default function AdminSupportThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useCosmos();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  const scroll = useRef<ScrollView>(null);
  const [ticket, setTicket] = useState<AdminTicket | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await getAdminTicket(id);
    if (r.ok) {
      setTicket(r.data);
      setError('');
    } else setError(r.message);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const send = async () => {
    const body = reply.trim();
    if (!body || !ticket) return;
    setSending(true);
    const r = await replyAsStaff(ticket.id, body, note);
    setSending(false);
    if (!r.ok) return AppAlert.alert("Couldn't send", r.message);
    setReply('');
    await load();
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  // The PATCH response has no messages, so merge it over what we already show.
  const triage = async (patch: Parameters<typeof triageTicket>[1]) => {
    if (!ticket) return;
    setSaving(true);
    const r = await triageTicket(ticket.id, patch);
    setSaving(false);
    if (!r.ok) return AppAlert.alert("Couldn't update the case", r.message);
    setTicket((prev) => (prev ? { ...prev, ...r.data, messages: prev.messages } : r.data));
  };

  const pickOwner = () => {
    if (!ticket || !user) return;
    const mine = ticket.assignedToId === user.id;
    AppAlert.alert('Assigned to', ticket.assignedTo ? personName(ticket.assignedTo) : 'Nobody yet', [
      mine
        ? { text: 'Unassign me', onPress: () => void triage({ assignedToId: null }) }
        : { text: 'Assign to me', onPress: () => void triage({ assignedToId: user.id }) },
      ...(ticket.assignedToId && !mine ? [{ text: 'Unassign', onPress: () => void triage({ assignedToId: null }) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  if (!ticket) {
    return (
      <CosmosScreen contentContainerStyle={{ paddingHorizontal: GUTTER }}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const closed = ticket.status === 'CLOSED';
  const email = ticket.contactEmail || ticket.requester?.identities?.[0]?.email || undefined;
  const nameOf = (m: SupportMessage) => (sideOf(m) === 'ASSISTANT' ? 'Assist' : personName(m.author));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <CosmosBackdrop horizon={false} />
      <Stack.Screen options={{ title: `#${ticket.ticketNumber}` }} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subject, { color: c.text }]} accessibilityRole="header">{ticket.subject}</Text>
        <Text style={[styles.meta, { color: c.muted }]}>
          {KIND_LABEL[ticket.kind]} · {CATEGORY_LABEL[ticket.category]} · opened {longDate(ticket.createdAt)}
        </Text>

        <SettingsGroup plain>
          <SettingsRow
            label="From"
            value={personName(ticket.requester)}
            onPress={ticket.requester ? () => router.push(`/apex/users/${ticket.requester!.id}`) : undefined}
          />
          {email ? <SettingsRow label="Email" value={email} /> : null}
          {ticket.requester?.mobileNumber ? <SettingsRow label="Phone" value={ticket.requester.mobileNumber} /> : null}
          {ticket.clientInfo?.version ? (
            <SettingsRow
              label="App"
              value={`${buildLabel(ticket.clientInfo as BuildInfo)}${ticket.clientInfo.platform ? ` · ${ticket.clientInfo.platform}` : ''}`}
            />
          ) : null}
          <SettingsRow
            label="Desk"
            value={`${DESK_LABEL[ticket.desk]}${ticket.escalatedAt ? ' · escalated by the space' : ''}`}
          />
          {ticket.space ? (
            <SettingsRow label="Space" value={ticket.space.name} onPress={() => router.push(`/apex/spaces/${ticket.space!.id}`)} />
          ) : null}
          {ticket.eventId ? <SettingsRow label="Event" onPress={() => router.push(`/apex/events/${ticket.eventId}`)} /> : null}
          <SettingsRow label="Assigned to" value={ticket.assignedTo ? personName(ticket.assignedTo) : 'Nobody'} onPress={pickOwner} />
        </SettingsGroup>

        {ticket.desk === 'PLATFORM' && ticket.kind === 'HELP' && !closed ? (
          <SendToOrganiser
            ticketId={ticket.id}
            suggested={ticket.aiTriage?.routingHint === 'SPACE'}
            reason={ticket.aiTriage?.reason}
            onDone={load}
          />
        ) : null}

        <Text style={[styles.label, { color: c.muted }]}>Status</Text>
        <ChipPicker options={STATUSES} value={ticket.status} onChange={(v) => v && v !== ticket.status && !saving && void triage({ status: v })} />
        <Text style={[styles.label, { color: c.muted }]}>Priority</Text>
        <ChipPicker options={PRIORITIES} value={ticket.priority} onChange={(v) => v && v !== ticket.priority && !saving && void triage({ priority: v })} />

        <View style={{ marginTop: spacing[6] }}>
          <CaseMessages messages={ticket.messages ?? []} viewer="DESK" nameOf={nameOf} />
        </View>

        {closed ? (
          <Text style={[styles.hint, { color: c.muted }]}>This case is closed. Set it back to Needs reply to answer.</Text>
        ) : null}
      </ScrollView>

      {!closed ? (
        <Composer
          value={reply}
          onChangeText={setReply}
          onSend={send}
          sending={sending}
          placeholder="Reply as Unifesto"
          note={{ on: note, set: setNote }}
          bottomInset={insets.bottom}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * Hand a help question on our desk to an event's organiser (the space desk).
 * Opens straight to the search when AI triage says the organiser can answer.
 */
function SendToOrganiser({
  ticketId,
  suggested,
  reason,
  onDone,
}: {
  ticketId: string;
  suggested: boolean;
  reason?: string;
  onDone: () => void;
}) {
  const c = useCosmos();
  const [open, setOpen] = useState(suggested);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminEventRow[]>([]);

  // Type, then search: wait for a pause.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const r = await searchEvents({ search: q });
      setResults(r.ok ? r.data.events.slice(0, 6) : []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = (ev: AdminEventRow) =>
    AppAlert.alert(`Send to ${ev.title}?`, `The ${ev.space?.name ?? 'event'} desk takes it from here and the requester is told.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          const r = await sendToSpace(ticketId, ev.id);
          if (!r.ok) return AppAlert.alert("Couldn't send the case", r.message);
          onDone();
        },
      },
    ]);

  return (
    <View style={{ marginTop: spacing[4] }}>
      <Text style={[styles.label, { color: c.muted }]}>Send to organiser</Text>
      <Text style={[styles.meta, { color: c.muted, marginTop: 0 }]}>
        {suggested ? `Assist thinks the organiser can answer this${reason ? `: ${reason}` : '.'}` : "Pass this question to an event's space desk."}
      </Text>
      {!open ? (
        <SettingsGroup plain>
          <SettingsRow label="Pick an event" onPress={() => setOpen(true)} />
        </SettingsGroup>
      ) : (
        <>
          <View style={styles.search}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search events" accessibilityLabel="Search events" />
          </View>
          {results.length ? (
            <SettingsGroup plain>
              {results.map((ev) => (
                <SettingsRow
                  key={ev.id}
                  label={ev.title}
                  value={[ev.space?.name, shortDate(ev.startDateTime)].filter(Boolean).join(' · ')}
                  onPress={() => pick(ev)}
                />
              ))}
            </SettingsGroup>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[6] },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  subject: { fontSize: typography.fontSize['2xl'], lineHeight: 28, ...cosmosFont.display },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  label: { marginTop: spacing[4], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  hint: { marginTop: spacing[6], textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  search: { marginTop: spacing[3] },
});
