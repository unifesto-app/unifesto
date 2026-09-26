import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { ArrowsClockwise, CloudArrowUp, UsersThree, Warning } from 'phosphor-react-native';
import { useTokens } from '../../context/ThemeContext';
import { useIsOffline } from '../../lib/offline/connectivity';
import type { useOfflineCheckin } from '../../hooks/useOfflineCheckin';
import type { QueuedCheckin } from '../../lib/offline/checkinQueue';
import { SettingsGroup, SettingsRow } from '../profile/SettingsGroup';
import PersonRow from './PersonRow';
import { timeAgo } from '../../utils/checkinFormat';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

type Offline = ReturnType<typeof useOfflineCheckin>;

/**
 * The hub's offline section: whether a guest list is saved for scanning with
 * no signal, how many check-ins are waiting to upload, and anything that
 * needs a look after sync: refused (cancelled after the list was saved, no
 * access at that point…) or a ticket another device had already let in.
 */
export default function OfflineCheckinPanel({ offline }: { offline: Offline }) {
  const tokens = useTokens();
  const isOffline = useIsOffline();

  const listValue = offline.rosterSavedAt
    ? `${offline.rosterSize.toLocaleString('en-IN')} people · ${timeAgo(offline.rosterSavedAt).toLowerCase()}`
    : 'Not saved yet';

  const textAction = (label: string, onPress: () => void, busy: boolean, disabled = false) =>
    busy ? (
      <ActivityIndicator size="small" color={tokens.accent} />
    ) : (
      <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.action, { color: disabled ? tokens.textMuted : tokens.accent }]}>{label}</Text>
      </Pressable>
    );

  return (
    <>
      <SettingsGroup title="Offline scanning">
        <SettingsRow
          icon={<UsersThree size={22} color={tokens.textSecondary} />}
          label="Saved guest list"
          value={listValue}
          trailing={textAction('Refresh', () => void offline.download(), offline.downloading, isOffline)}
        />
        {offline.pending > 0 ? (
          <SettingsRow
            icon={<CloudArrowUp size={22} color={tokens.warning} />}
            label={`${offline.pending} waiting to sync`}
            trailing={textAction('Sync now', () => void offline.sync(), offline.syncing, isOffline)}
          />
        ) : null}
        {offline.error ? (
          <SettingsRow icon={<Warning size={22} color={tokens.danger} />} label={offline.error} />
        ) : null}
      </SettingsGroup>

      {offline.review.length > 0 ? (
        <SettingsGroup title="Needs review">
          {offline.review.map((r) => (
            <PersonRow key={r.id} name={r.name ?? 'Attendee'} sub={reviewLine(r)} />
          ))}
          <SettingsRow
            icon={<ArrowsClockwise size={22} color={tokens.textSecondary} />}
            label="Clear reviewed"
            onPress={() => offline.review.forEach((r) => void offline.dismiss(r.id))}
          />
        </SettingsGroup>
      ) : null}
    </>
  );
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * One line on why a check-in needs a look. A duplicate is a ticket used twice
 * at the same point (a shared screenshot, or someone stepping out and back
 * in) — the organiser decides which.
 */
function reviewLine(r: QueuedCheckin): string {
  const scanned = `scanned ${timeAgo(r.scannedAt).toLowerCase()}`;
  const d = r.duplicateOf;
  if (!d) return [r.message ?? 'Refused on sync', scanned].join(' · ');

  const who = d.byYou ? 'your account on another phone' : d.checkedInByName ?? 'another crew member';
  const first = `first in at ${clock(d.checkedInAt)} by ${who}`;
  const members = d.memberIndexes?.length;
  const what = members ? `${members} member${members === 1 ? '' : 's'} scanned twice` : 'Scanned twice';
  return `${what} · ${first}`;
}

const styles = StyleSheet.create({
  action: { fontSize: typography.fontSize.sm, ...font('semibold') },
});
