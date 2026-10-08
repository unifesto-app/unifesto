import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CaretRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

/** Inbox-style stamp: time today, "Yesterday", else "12 Sep". */
export function whenShort(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diff === 1) return 'Yesterday';
  return shortDate(iso);
}

export const longDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

interface ApexRowProps {
  title: string;
  meta?: string;
  /** Right-aligned, e.g. an amount or a status word. */
  value?: string;
  valueColor?: string;
  /** Square thumbnail (logo / avatar). */
  imageUrl?: string | null;
  /** Bold title + dot for unread items. */
  unread?: boolean;
  onPress?: () => void;
}

/** One line in an Apex list: title, a muted meta line, optional value and chevron. */
export function ApexRow({ title, meta, value, valueColor, imageUrl, unread, onPress }: ApexRowProps) {
  const tokens = useTokens();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {imageUrl !== undefined ? (
        imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: tokens.elevated }]}>
            <Text style={[styles.initial, { color: tokens.textMuted }]}>{title.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
        )
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: tokens.text }, unread && font('bold')]} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: unread ? tokens.textSecondary : tokens.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={[styles.value, { color: valueColor ?? tokens.textSecondary }]}>{value}</Text> : null}
      {unread ? <View style={[styles.dot, { backgroundColor: tokens.accent }]} /> : null}
      {onPress ? <CaretRight size={16} color={tokens.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4] },
  thumb: { width: 40, height: 40, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: typography.fontSize.base, ...font('semibold') },
  title: { fontSize: typography.fontSize.base, ...font('semibold') },
  meta: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  value: { fontSize: typography.fontSize.sm, ...font('semibold') },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
