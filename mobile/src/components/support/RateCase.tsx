import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Star } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import { rateTicket, type SupportTicket } from '../../lib/api/support';
import { Button } from '../ui';
import { AppAlert } from '../ui/AppAlert';
import { CardBackdrop } from '../ui/CardSurface';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/** D20: the requester rates a resolved case 1-5, with an optional comment. */
export function RateCase({ ticket, onRated }: { ticket: SupportTicket; onRated: () => void }) {
  const tokens = useTokens();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  if (ticket.rating) {
    return (
      <Text style={[styles.done, { color: tokens.textMuted }]}>
        You rated this {ticket.rating} of 5. Thanks for telling us.
      </Text>
    );
  }

  const send = async () => {
    setSaving(true);
    const ok = await rateTicket(ticket.id, rating, comment.trim() || undefined);
    setSaving(false);
    if (!ok) return AppAlert.alert("Couldn't save your rating", 'Check your connection and try again.');
    onRated();
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: tokens.text }]}>How did we do?</Text>
      <View style={styles.stars} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ checked: rating === n }}
            accessibilityLabel={`${n} of 5`}
          >
            <Star size={32} color={n <= rating ? tokens.warning : tokens.textMuted} weight={n <= rating ? 'fill' : 'regular'} />
          </Pressable>
        ))}
      </View>
      {rating > 0 ? (
        <>
          <View style={styles.inputWrap}>
            <CardBackdrop shape={styles.inputWrap} />
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Anything to add? (optional)"
              placeholderTextColor={tokens.textMuted}
              selectionColor={tokens.accent}
              maxLength={1000}
              multiline
              style={[styles.input, { color: tokens.text }]}
            />
          </View>
          <Button label="Send rating" loading={saving} onPress={send} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing[6], alignItems: 'center', gap: spacing[3] },
  title: { fontSize: typography.fontSize.base, ...font('500') },
  stars: { flexDirection: 'row', gap: spacing[2] },
  inputWrap: { alignSelf: 'stretch', borderRadius: borderRadius.xl, overflow: 'hidden', paddingHorizontal: spacing[4], paddingVertical: spacing[2], minHeight: 44, justifyContent: 'center' },
  input: { fontSize: typography.fontSize.base, maxHeight: 120, ...font() },
  done: { marginTop: spacing[6], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
