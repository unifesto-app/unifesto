import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../../context/ThemeContext';
import { describeRecurrence, WEEKDAY_LABELS, type RecurrenceEnd, type RecurrenceFreq, type RecurrenceState } from '../../lib/recurrence';
import SegmentedTabs from '../ui/SegmentedTabs';
import { SettingsGroup } from '../profile/SettingsGroup';
import { BlockTitle, FieldRow, SwitchRow } from './FormFields';
import DateTimeRow from './DateTimeRow';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { CardBackdrop } from '../ui/CardSurface';

const FREQS: { key: RecurrenceFreq; label: string }[] = [
  { key: 'DAILY', label: 'Daily' },
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
];
const ENDS: { key: RecurrenceEnd; label: string }[] = [
  { key: 'count', label: 'After' },
  { key: 'until', label: 'On a date' },
  { key: 'never', label: 'Never' },
];
const UNIT: Record<RecurrenceFreq, string> = { DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months', YEARLY: 'years' };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  /** The first date; "until" can't be before it. */
  start: Date;
}

/**
 * Repeat settings for a series, mirroring the web editor: frequency, every N,
 * weekdays (weekly), and when it stops. The summary line is what the attendee
 * page says.
 */
export default function RecurrenceEditor({ value: s, onChange, start }: Props) {
  const tokens = useTokens();
  const set = (patch: Partial<RecurrenceState>) => onChange({ ...s, ...patch });

  const toggleDay = (d: number) => {
    const has = s.weekdays.includes(d);
    // Keep at least one day picked.
    if (has && s.weekdays.length === 1) return;
    set({ weekdays: has ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d] });
  };

  return (
    <>
      <SettingsGroup title="Repeats" plain>
        <SwitchRow
          label="Repeat this event"
          hint={s.enabled ? describeRecurrence(s) : 'Each date becomes its own event people register for.'}
          value={s.enabled}
          onValueChange={(on) => set({ enabled: on, weekdays: s.weekdays.length ? s.weekdays : [start.getDay()] })}
        />
      </SettingsGroup>

      {s.enabled ? (
        <>
          <View style={styles.block}>
            <SegmentedTabs tabs={FREQS} value={s.freq} onChange={(f) => set({ freq: f })} />
          </View>
          <SettingsGroup plain>
            <FieldRow
              label={`Every how many ${UNIT[s.freq]}`}
              value={String(s.interval)}
              onChangeText={(v) => set({ interval: Math.max(1, Number(v.replace(/\D/g, '')) || 1) })}
              keyboardType="number-pad"
            />
          </SettingsGroup>

          {s.freq === 'WEEKLY' ? (
            <View style={[styles.days, { marginTop: spacing[4] }]}>
              {WEEKDAY_LABELS.map((label, d) => {
                const on = s.weekdays.includes(d);
                return (
                  <Pressable
                    key={label}
                    onPress={() => toggleDay(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.day,
                      { backgroundColor: on ? tokens.accent : undefined, transform: [{ scale: pressed ? 0.94 : 1 }] },
                    ]}
                  >
                    {!on ? <CardBackdrop shape={styles.day} /> : null}
                    <Text style={[styles.dayText, { color: on ? tokens.accentFg : tokens.text }]}>{label.slice(0, 2)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.block}>
            <BlockTitle>Ends</BlockTitle>
            <SegmentedTabs
              tabs={ENDS}
              value={s.end}
              onChange={(e) => {
                const fallback = new Date(start.getTime() + 60 * 24 * 3600 * 1000);
                set({ end: e, until: e === 'until' && !s.until ? ymd(fallback) : s.until });
              }}
            />
          </View>
          {s.end === 'count' ? (
            <SettingsGroup plain>
              <FieldRow
                label="Number of times"
                value={String(s.count)}
                onChangeText={(v) => set({ count: Math.max(1, Number(v.replace(/\D/g, '')) || 1) })}
                keyboardType="number-pad"
              />
            </SettingsGroup>
          ) : s.end === 'until' && s.until ? (
            <SettingsGroup plain>
              <DateTimeRow
                mode="date"
                label="Last date"
                value={new Date(`${s.until}T12:00:00`)}
                minimumDate={start}
                onChange={(d) => set({ until: ymd(d) })}
              />
            </SettingsGroup>
          ) : null}
          {s.end === 'never' ? (
            <Text style={[styles.note, { color: tokens.textMuted }]}>Dates are created a few months ahead and keep rolling forward.</Text>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing[4] },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { width: 40, height: 40, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
