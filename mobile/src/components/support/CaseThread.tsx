import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PaperPlaneRight } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import type { SupportMessage, SupportMessageSide } from '../../lib/api/support';
import ChipPicker from '../manage/ChipPicker';
import { CardBackdrop } from '../ui/CardSurface';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

export const GUTTER = spacing[6];

export const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export const personName = (p?: { fullName: string | null; username: string | null } | null) =>
  p?.fullName || (p?.username ? `@${p.username}` : 'Someone');

/** Older messages predate `side`; the staff flag is all they have. */
export const sideOf = (m: SupportMessage): SupportMessageSide => m.side ?? (m.isStaffReply ? 'DESK' : 'REQUESTER');

/**
 * A case's messages, oldest first. The viewer's own side sits on the right in
 * the accent colour; SYSTEM lines (sent to the organiser, refund approved…)
 * read as timeline text; internal notes stay on the right but unfilled.
 * `nameOf` labels a message; return '' to show the time alone.
 */
export function CaseMessages({
  messages,
  viewer,
  nameOf,
}: {
  messages: SupportMessage[];
  viewer: 'REQUESTER' | 'DESK';
  nameOf: (m: SupportMessage) => string;
}) {
  const tokens = useTokens();
  return (
    <View style={{ gap: spacing[3] }}>
      {messages.map((m) => {
        const side = sideOf(m);
        if (side === 'SYSTEM') {
          return (
            <Text key={m.id} style={[styles.system, { color: tokens.textMuted }]}>
              {m.body} · {stamp(m.createdAt)}
            </Text>
          );
        }
        const filled = side === viewer && !m.internal;
        const right = side === viewer;
        const name = nameOf(m);
        return (
          <View key={m.id} style={[styles.bubble, right ? styles.right : styles.left, filled && { backgroundColor: tokens.accent }]}>
            {filled ? null : <CardBackdrop shape={styles.bubble} />}
            <Text style={[styles.body, { color: filled ? tokens.accentFg : tokens.text }]}>{m.body}</Text>
            <Text style={[styles.time, { color: filled ? tokens.accentFg : tokens.textMuted, opacity: filled ? 0.7 : 1 }]}>
              {[m.internal ? 'Internal note' : null, name || null, stamp(m.createdAt)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const NOTE_OPTIONS = [
  { value: 'reply' as const, label: 'Reply' },
  { value: 'note' as const, label: 'Internal note' },
];

/** Reply box pinned under a thread. With `note`, the desk can switch to a desk-only note. */
export function Composer({
  value,
  onChangeText,
  onSend,
  sending,
  placeholder,
  note,
  bottomInset,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  placeholder: string;
  note?: { on: boolean; set: (on: boolean) => void };
  bottomInset: number;
}) {
  const tokens = useTokens();
  return (
    <View style={[styles.composerWrap, { paddingBottom: Math.max(bottomInset, spacing[3]), backgroundColor: tokens.bg }]}>
      {note ? (
        <ChipPicker options={NOTE_OPTIONS} value={note.on ? 'note' : 'reply'} onChange={(v) => note.set(v === 'note')} />
      ) : null}
      <View style={styles.composer}>
        <View style={styles.inputWrap}>
          <CardBackdrop shape={styles.inputWrap} />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={note?.on ? 'Note for the desk only' : placeholder}
            placeholderTextColor={tokens.textMuted}
            selectionColor={tokens.accent}
            multiline
            style={[styles.input, { color: tokens.text }]}
          />
        </View>
        <Pressable onPress={onSend} disabled={sending || !value.trim()} hitSlop={8} accessibilityLabel={note?.on ? 'Save note' : 'Send reply'}>
          {sending ? (
            <ActivityIndicator color={tokens.accent} />
          ) : (
            <PaperPlaneRight size={28} color={value.trim() ? tokens.accent : tokens.textMuted} weight="fill" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  system: { alignSelf: 'center', textAlign: 'center', maxWidth: '85%', fontSize: typography.fontSize.xs, ...font() },
  bubble: { maxWidth: '85%', borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  body: { fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.4, ...font() },
  time: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  composerWrap: { paddingHorizontal: GUTTER, paddingTop: spacing[3], gap: spacing[2] },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] },
  inputWrap: { flex: 1, borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 44, justifyContent: 'center' },
  input: { fontSize: typography.fontSize.base, maxHeight: 120, ...font() },
});
