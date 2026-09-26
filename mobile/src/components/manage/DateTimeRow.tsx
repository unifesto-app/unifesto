import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTokens } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface DateTimeRowProps {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  minimumDate?: Date;
  /** 'date' drops the time (e.g. "repeat until"). */
  mode?: 'datetime' | 'date';
}

const display = (d: Date, mode: 'datetime' | 'date') =>
  mode === 'date'
    ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * One "Starts ........ Sat 4 Oct, 10:00 am" line inside a `SettingsGroup plain`.
 * iOS shows the native compact picker inline; Android has no combined mode, so
 * a tap opens the date dialog and then the time dialog.
 */
export default function DateTimeRow({ label, value, onChange, minimumDate, mode = 'datetime' }: DateTimeRowProps) {
  const tokens = useTokens();

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <Text style={[styles.label, { color: tokens.text }]}>{label}</Text>
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          minimumDate={minimumDate}
          accentColor={tokens.accent}
          onValueChange={(_, d) => onChange(d)}
        />
      </View>
    );
  }

  const pick = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      // onValueChange only fires on a confirmed pick; dismissing does nothing.
      onValueChange: (_, day) => {
        if (mode === 'date') {
          onChange(day);
          return;
        }
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          onValueChange: (_2, time) => {
            const next = new Date(day);
            next.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(next);
          },
        });
      },
    });

  return (
    <Pressable onPress={pick} style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.pressed }]} accessibilityRole="button">
      <Text style={[styles.label, { color: tokens.text }]}>{label}</Text>
      <Text style={[styles.value, { color: tokens.accent }]}>{display(value, mode)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 56 },
  label: { fontSize: typography.fontSize.base, ...font('medium') },
  value: { fontSize: typography.fontSize.base, ...font('medium') },
});
