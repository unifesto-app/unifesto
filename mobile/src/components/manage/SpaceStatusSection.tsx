import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { askSpaceBack, getSpaceLifecycle, setSpaceLifecycle, type SpaceLifecycle } from '../../lib/api/spaceSettings';
import { SettingsGroup, SettingsRow } from '../profile/SettingsGroup';
import { FieldRow } from './FormFields';
import { GUTTER } from '../home/Section';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The status as plain coloured text (no pill), and what it means. */
function describe(l: SpaceLifecycle): { label: string; tone: 'success' | 'danger' | 'muted'; line: string } {
  const since = l.changedAt ? ` since ${day(l.changedAt)}` : '';
  switch (l.status) {
    case 'INACTIVE':
      return { label: 'Paused', tone: 'muted', line: `Paused${since}. Hidden and not selling. Tickets already sold still check in.` };
    case 'SUSPENDED':
      return { label: 'Suspended', tone: 'danger', line: `Suspended by Unifesto${since}. Hidden and not selling.` };
    case 'ARCHIVED':
      return {
        label: 'Archived',
        tone: 'muted',
        line:
          l.changedBy === 'system'
            ? `Archived${since} after 180 days with no events.`
            : l.changedBy === 'owner'
              ? `Archived${since}.`
              : `Archived by Unifesto${since}.`,
      };
    default:
      return { label: 'Live', tone: 'success', line: 'Anyone can find it and buy tickets.' };
  }
}

/**
 * Q39: the owner pauses, resumes, archives or restores their space here, with
 * no review. A suspension, or an archive by Unifesto, comes back through a
 * request the team answers in Assist. Others see the status only.
 */
export default function SpaceStatusSection({ spaceId, onChange }: { spaceId: string; onChange: () => void }) {
  const c = useCosmos();
  const [life, setLife] = useState<SpaceLifecycle | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');

  const load = useCallback(async () => {
    const res = await getSpaceLifecycle(spaceId);
    if (res.ok) setLife(res.data);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!life) return null;

  const { label, tone, line } = describe(life);
  const openMoney = life.openPayouts + life.openRefunds;
  const askBack = life.status === 'SUSPENDED' || (life.status === 'ARCHIVED' && !life.canRestore);
  const toneColor = tone === 'success' ? c.success : tone === 'danger' ? c.danger : c.muted;

  const set = async (status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED') => {
    setBusy(true);
    const res = await setSpaceLifecycle(spaceId, status);
    setBusy(false);
    if (!res.ok) return AppAlert.alert("Couldn't update the space", res.message);
    setLife(res.data);
    onChange();
  };

  const pause = () => {
    const sold = life.upcomingTicketsSold;
    AppAlert.alert(
      'Pause this space?',
      sold
        ? `${sold} ${sold === 1 ? 'ticket is' : 'tickets are'} sold for upcoming events. They still check in, but nobody can buy new ones until you resume.`
        : 'It is hidden and stops selling until you resume. You can resume any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pause space', style: 'destructive', onPress: () => void set('INACTIVE') },
      ],
    );
  };

  const archive = () => {
    if (openMoney > 0) {
      return AppAlert.alert(
        'Settle payments first',
        `This space has ${openMoney} open ${openMoney === 1 ? 'payout or refund' : 'payouts and refunds'}. Archive it once they settle.`,
      );
    }
    AppAlert.alert('Archive this space?', 'It is closed and hidden. You can restore it any time from here.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive space', style: 'destructive', onPress: () => void set('ARCHIVED') },
    ]);
  };

  const sendAsk = async () => {
    setBusy(true);
    const res = await askSpaceBack(spaceId, why.trim());
    setBusy(false);
    if (!res.ok) return AppAlert.alert("Couldn't send it", res.message);
    setWhy('');
    await load();
  };

  return (
    <View style={styles.block}>
      {/* Muted title like SettingsGroup's; the status line sits on the page. */}
      <Text style={[styles.title, { color: c.muted }]} accessibilityRole="header">Status</Text>
      <View style={styles.pad}>
        <Text style={[styles.line, { color: c.soft }]}>
          <Text style={[cosmosFont.strong, { color: toneColor }]}>{label}. </Text>
          {line}
          {life.reason ? ` Reason: ${life.reason}` : ''}
        </Text>
      </View>

      {!life.isOwner ? (
        <Text style={[styles.note, { color: c.muted }]}>Only the space owner can change this.</Text>
      ) : askBack ? (
        life.pendingRequest ? (
          <Text style={[styles.note, { color: c.muted }]}>
            Request sent {day(life.pendingRequest.createdAt)}. The team replies in Assist.
          </Text>
        ) : (
          <>
            <SettingsGroup plain style={styles.group}>
              <FieldRow
                stacked
                multiline
                label={life.status === 'SUSPENDED' ? 'What changed?' : 'Why should it come back?'}
                value={why}
                onChangeText={setWhy}
                maxLength={1000}
                placeholder="Tell the team in a line or two"
              />
            </SettingsGroup>
            <View style={styles.pad}>
              <Button
                label={life.status === 'SUSPENDED' ? 'Send appeal' : 'Ask to restore'}
                size="lg"
                fullWidth
                loading={busy}
                disabled={!why.trim()}
                onPress={sendAsk}
                style={{ marginTop: spacing[4] }}
              />
            </View>
          </>
        )
      ) : (
        <SettingsGroup flat plain style={styles.group}>
          {life.status === 'ACTIVE' ? <SettingsRow label="Pause space" onPress={busy ? undefined : pause} /> : null}
          {life.status === 'INACTIVE' ? <SettingsRow label="Resume space" onPress={busy ? undefined : () => void set('ACTIVE')} /> : null}
          {life.status === 'ARCHIVED' ? <SettingsRow label="Restore space" onPress={busy ? undefined : () => void set('ACTIVE')} /> : null}
          {life.status === 'ACTIVE' || life.status === 'INACTIVE' ? (
            <SettingsRow label="Archive space" danger onPress={busy ? undefined : archive} />
          ) : null}
        </SettingsGroup>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  block: { marginTop: spacing[8] },
  title: { marginBottom: spacing[3], marginHorizontal: GUTTER + spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  group: { marginTop: spacing[3], marginHorizontal: GUTTER },
  line: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  note: { marginTop: spacing[3], marginHorizontal: GUTTER, fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
