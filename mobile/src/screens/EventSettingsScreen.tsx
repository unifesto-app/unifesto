import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowCounterClockwise, Bank, CheckCircle, CircleIcon, EyeSlash, RocketLaunch, Trash, XCircle } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import { useSpaceAccess } from '../context/SpaceAccessContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import {
  cancelEvent,
  deleteEvent,
  getManagedEvent,
  hideEvent,
  publishEvent,
  restoreEvent,
  setEventPayoutAccount,
} from '../lib/api/eventAdmin';
import { describeAccount, getEligibleAccounts, type EligibleAccount } from '../lib/api/finance';
import { setAttendeeControls } from '../lib/api/attendeeControls';
import { FieldRow, SwitchRow } from '../components/manage/FormFields';
import DateTimeRow from '../components/manage/DateTimeRow';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;

type ManagedEvent = NonNullable<Extract<Awaited<ReturnType<typeof getManagedEvent>>, { ok: true }>['data']>;

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'Draft. Only your team can see it.',
  PUBLISHED: 'Live and taking registrations.',
  ONGOING: 'Happening now.',
  COMPLETED: 'Finished.',
  CANCELLED: 'Cancelled.',
};

/**
 * Status and the irreversible stuff for one event: publish a draft, pick the
 * payout account, cancel, hide or delete. The rules match the web: hide only
 * finished or cancelled events, delete only drafts or cancelled ones.
 */
export default function EventSettingsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { spaces } = useSpaceAccess();

  const [event, setEvent] = useState<ManagedEvent | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const [accounts, setAccounts] = useState<EligibleAccount[] | null>(null);
  const [selected, setSelected] = useState<string>(''); // '' = creator's primary
  const [savedAccount, setSavedAccount] = useState('');

  useAnalyticsScreenTracking('EventSettings');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getManagedEvent(eventId);
    if (res.ok) {
      setEvent(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Payout routing is money, so Space Admins of the owning space only.
  const isSpaceAdmin = !!event && spaces.some((s) => s.id === event.spaceId && s.userRole?.code === 'SPACE_ADMIN');
  useEffect(() => {
    if (!isSpaceAdmin || !eventId) return;
    void getEligibleAccounts(eventId).then((res) => {
      if (!res.ok) return;
      const preset = res.data.accounts.some((a) => a.id === res.data.selectedBankAccountId) ? res.data.selectedBankAccountId! : '';
      setAccounts(res.data.accounts);
      setSelected(preset);
      setSavedAccount(preset);
    });
  }, [isSpaceAdmin, eventId]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean }>, onDone?: () => void) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      AppAlert.alert("Couldn't do that", (res as unknown as { message: string }).message);
      return false;
    }
    onDone?.();
    await load();
    return true;
  };

  const publish = () =>
    AppAlert.alert('Publish this event?', 'It becomes visible and starts taking registrations.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Publish', onPress: () => void run('publish', () => publishEvent(eventId!)) },
    ]);

  const confirmCancel = () =>
    AppAlert.alert('Cancel this event?', 'Everyone registered is told. Refunds are handled separately.', [
      { text: 'Keep event', style: 'cancel' },
      {
        text: 'Cancel event',
        style: 'destructive',
        onPress: () =>
          void run('cancel', () => cancelEvent(eventId!, reason.trim() || undefined), () => {
            setCancelOpen(false);
            setReason('');
          }),
      },
    ]);

  const hide = () =>
    AppAlert.alert('Hide this event?', "It leaves listings, search and attendees' tickets. Nothing is deleted, and you can restore it any time.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide', onPress: () => void run('hide', () => hideEvent(eventId!)) },
    ]);

  const remove = () =>
    AppAlert.alert('Delete permanently?', 'All of its registrations, tickets and content go with it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          const res = await deleteEvent(eventId!);
          setBusy(null);
          if (!res.ok) {
            AppAlert.alert("Couldn't delete", res.message);
            return;
          }
          router.dismissAll();
        },
      },
    ]);

  // Attendee controls save as soon as they change; the reload shows the server's view.
  const setControls = (key: string, body: Parameters<typeof setAttendeeControls>[1]) =>
    void run(key, () => setAttendeeControls(eventId!, body));

  const saveAccount = async () => {
    const ok = await run('account', () => setEventPayoutAccount(eventId!, selected || null));
    if (ok) setSavedAccount(selected);
  };

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        {error ? (
          <>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} style={{ marginTop: spacing[3] }} />
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const status = event.status;
  const isDraft = status === 'DRAFT';
  const isCancelled = status === 'CANCELLED';
  const isCompleted = status === 'COMPLETED';
  const isHidden = !!event.deletedAt;
  const canHide = (isCompleted || isCancelled) && !isHidden;
  const canDelete = isDraft || isCancelled;
  const canCancel = status === 'PUBLISHED';
  const icon = (I: typeof Trash, color = tokens.accent) => <I size={ICON} color={color} weight="fill" />;
  const radio = (on: boolean) =>
    on ? <CheckCircle size={22} color={tokens.accent} weight="fill" /> : <CircleIcon size={22} color={tokens.textMuted} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topSpacing}
          />
        }
      >
        <Text style={[styles.status, { color: isCancelled ? tokens.danger : isDraft ? tokens.warning : tokens.success }]}>
          {isHidden ? 'Hidden' : status.charAt(0) + status.slice(1).toLowerCase()}
        </Text>
        <Text style={[styles.muted, { color: tokens.textSecondary, textAlign: 'left' }]}>
          {isHidden ? 'Off every listing. Restore it to bring it back.' : STATUS_TEXT[status] ?? ''}
        </Text>
        {isCancelled && event.cancellationReason ? (
          <Text style={[styles.note, { color: tokens.textMuted }]}>Reason: {event.cancellationReason}</Text>
        ) : null}

        {isDraft ? (
          <Button
            label="Publish event"
            size="lg"
            fullWidth
            loading={busy === 'publish'}
            icon={<RocketLaunch size={18} color={tokens.accentFg} weight="fill" />}
            onPress={publish}
            style={{ marginTop: spacing[6] }}
          />
        ) : null}

        {!isCompleted && !isCancelled ? (
          <>
            <SettingsGroup title="Attendees" plain>
              <SwitchRow
                label="Allow team changes"
                hint="Team leads can add, remove or replace members and hand over the lead. You can always do this from Attendees."
                value={!!event.allowTeamChanges}
                disabled={busy === 'teamChanges'}
                onValueChange={(v) => setControls('teamChanges', { allowTeamChanges: v })}
              />
              {event.allowTeamChanges ? (
                <SwitchRow
                  label="Lock teams at a set time"
                  value={!!event.teamChangesUntil}
                  disabled={busy === 'teamDeadline'}
                  onValueChange={(v) =>
                    setControls('teamDeadline', {
                      // Default to the day before the event starts, never in the past.
                      teamChangesUntil: v
                        ? new Date(Math.max(Date.now() + 3600e3, new Date(event.startDateTime).getTime() - 864e5)).toISOString()
                        : null,
                    })
                  }
                />
              ) : null}
              {event.allowTeamChanges && event.teamChangesUntil ? (
                <DateTimeRow
                  label="Teams lock"
                  value={new Date(event.teamChangesUntil)}
                  minimumDate={new Date()}
                  onChange={(d) => setControls('teamDeadline', { teamChangesUntil: d.toISOString() })}
                />
              ) : null}
              <SwitchRow
                label="Attendees can edit their details"
                hint="People can change their registration answers from their ticket. Group leads edit the team's, members their own."
                value={!!event.attendeeEditsEnabled}
                disabled={busy === 'edits'}
                onValueChange={(v) => setControls('edits', { attendeeEditsEnabled: v })}
              />
              {event.attendeeEditsEnabled ? (
                <SwitchRow
                  label="Close edits at a set time"
                  value={!!event.attendeeEditsUntil}
                  disabled={busy === 'deadline'}
                  onValueChange={(v) =>
                    setControls('deadline', {
                      // Default to the day before the event starts, never in the past.
                      attendeeEditsUntil: v
                        ? new Date(Math.max(Date.now() + 3600e3, new Date(event.startDateTime).getTime() - 864e5)).toISOString()
                        : null,
                    })
                  }
                />
              ) : null}
              {event.attendeeEditsEnabled && event.attendeeEditsUntil ? (
                <DateTimeRow
                  label="Edits close"
                  value={new Date(event.attendeeEditsUntil)}
                  minimumDate={new Date()}
                  onChange={(d) => setControls('deadline', { attendeeEditsUntil: d.toISOString() })}
                />
              ) : null}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              {event.attendeeEditsEnabled && event.attendeeEditsUntil && new Date(event.attendeeEditsUntil).getTime() <= Date.now()
                ? 'The edit deadline has passed, so details are locked. Move the deadline or turn it off to reopen.'
                : 'You can always edit any attendee’s details from Attendees, whatever these say.'}
            </Text>
          </>
        ) : null}

        {/* Where this event's earnings are paid. Blank = the creator's primary account. */}
        {isSpaceAdmin && accounts ? (
          <>
            <SettingsGroup title="Payout account">
              <SettingsRow
                icon={icon(Bank)}
                label="Creator's primary account"
                trailing={radio(selected === '')}
                onPress={() => setSelected('')}
              />
              {accounts.map((a) => (
                <SettingsRow
                  key={a.id}
                  icon={icon(Bank)}
                  label={describeAccount(a)}
                  value={a.isOwn ? undefined : a.ownerName}
                  trailing={radio(selected === a.id)}
                  onPress={() => setSelected(a.id)}
                />
              ))}
            </SettingsGroup>
            {accounts.length === 0 ? (
              <Text style={[styles.note, { color: tokens.textMuted }]}>No verified accounts yet. Add one under Finance, Payout accounts.</Text>
            ) : null}
            {selected !== savedAccount ? (
              <Button label="Save payout account" onPress={saveAccount} loading={busy === 'account'} fullWidth style={{ marginTop: spacing[4] }} />
            ) : null}
          </>
        ) : null}

        <SettingsGroup title="Danger zone">
          {canCancel ? (
            <SettingsRow icon={icon(XCircle, tokens.danger)} label="Cancel event" danger onPress={() => setCancelOpen((o) => !o)} />
          ) : null}
          {isHidden ? (
            <SettingsRow
              icon={icon(ArrowCounterClockwise)}
              label="Restore event"
              trailing={busy === 'restore' ? <ActivityIndicator size="small" color={tokens.accent} /> : undefined}
              onPress={() => void run('restore', () => restoreEvent(eventId!))}
            />
          ) : (
            <SettingsRow
              icon={icon(EyeSlash, canHide ? tokens.accent : tokens.textMuted)}
              label="Hide event"
              trailing={busy === 'hide' ? <ActivityIndicator size="small" color={tokens.accent} /> : undefined}
              onPress={canHide ? hide : undefined}
            />
          )}
          <SettingsRow
            icon={icon(Trash, canDelete ? tokens.danger : tokens.textMuted)}
            label="Delete permanently"
            danger={canDelete}
            trailing={busy === 'delete' ? <ActivityIndicator size="small" color={tokens.danger} /> : undefined}
            onPress={canDelete ? remove : undefined}
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {canDelete
            ? 'Hiding is reversible. Deleting is not.'
            : isCompleted
              ? "A finished event can't be deleted, its attendance and payments are kept. Hide it instead."
              : 'Only finished or cancelled events can be hidden. Cancel it first to delete it.'}
        </Text>

        {cancelOpen ? (
          <>
            <SettingsGroup title="Cancel event" plain>
              <FieldRow
                stacked
                multiline
                label="Reason (optional, shown to attendees)"
                value={reason}
                onChangeText={setReason}
                placeholder="Due to unforeseen circumstances…"
              />
            </SettingsGroup>
            <Button
              label="Cancel event"
              variant="danger"
              size="lg"
              fullWidth
              loading={busy === 'cancel'}
              onPress={confirmCancel}
              style={{ marginTop: spacing[4] }}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  status: { fontSize: typography.fontSize['2xl'], marginLeft: spacing[1], ...font('heading') },
  muted: { marginTop: spacing[1], marginLeft: spacing[1], fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  note: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...font() },
});
