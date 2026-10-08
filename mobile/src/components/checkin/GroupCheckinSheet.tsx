import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, CircleIcon as Circle } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import type { GroupScanResult } from '../../lib/api/checkin';
import { Button } from '../ui';
import { SheetBackdrop } from '../ui/CardSurface';
import { Avatar } from './PersonRow';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

interface GroupCheckinSheetProps {
  group: GroupScanResult | null;
  selected: Set<number>;
  onToggle: (index: number) => void;
  onToggleAll: () => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
}

/**
 * A group ticket was scanned: pick who's actually at the door. Members not yet
 * in at this point come pre-selected; people already in show a green tick.
 */
export default function GroupCheckinSheet({
  group,
  selected,
  onToggle,
  onToggleAll,
  onSubmit,
  onClose,
  submitting,
}: GroupCheckinSheetProps) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const members = group?.members ?? [];
  const allOn = members.length > 0 && selected.size === members.length;
  const alreadyIn = members.filter((m) => m.checkedInAtPoint).length;

  return (
    <Modal visible={!!group} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onClose} accessibilityLabel="Close" />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[5]) }]}
        >
          <SheetBackdrop radius={borderRadius['3xl']} />
          <View style={[styles.handle, { backgroundColor: tokens.fillStrong }]} />

          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={1}>
            {group?.leadName ? `${group.leadName}'s group` : 'Group ticket'}
          </Text>
          <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
            {[group?.ticketType, `${group?.groupSize ?? members.length} people`, alreadyIn ? `${alreadyIn} already in` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <View style={styles.toolbar}>
            <Text style={[styles.count, { color: tokens.textSecondary }]}>
              {selected.size} of {members.length} selected
            </Text>
            <Pressable onPress={onToggleAll} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.toggleAll, { color: tokens.accent }]}>{allOn ? 'Clear all' : 'Select all'}</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list} bounces={false}>
            {members.map((m, i) => {
              const on = selected.has(m.index);
              const name = m.name || `Member ${m.index + 1}`;
              return (
                <Pressable
                  key={m.index}
                  onPress={() => onToggle(m.index)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [
                    styles.member,
                    i < members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tokens.border },
                    pressed && { backgroundColor: tokens.pressed },
                  ]}
                >
                  {on ? (
                    <CheckCircle size={26} color={tokens.accent} weight="fill" />
                  ) : (
                    <Circle size={26} color={tokens.textMuted} />
                  )}
                  <Avatar name={name} size={36} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>
                      {name}
                      {m.index === 0 ? <Text style={{ color: tokens.textMuted }}> · Lead</Text> : null}
                    </Text>
                    {m.email ? (
                      <Text style={[styles.email, { color: tokens.textMuted }]} numberOfLines={1}>
                        {m.email}
                      </Text>
                    ) : null}
                  </View>
                  {m.checkedInAtPoint ? <Text style={[styles.in, { color: tokens.success }]}>In</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" size="lg" onPress={onClose} disabled={submitting} style={{ flex: 1 }} fullWidth />
            <Button
              label={selected.size > 0 ? `Check in ${selected.size}` : 'Check in'}
              size="lg"
              onPress={onSubmit}
              loading={submitting}
              disabled={selected.size === 0}
              style={{ flex: 2 }}
              fullWidth
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    borderTopLeftRadius: borderRadius['3xl'],
    borderTopRightRadius: borderRadius['3xl'],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing[4] },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  sub: { fontSize: typography.fontSize.sm, marginTop: 2, ...font() },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[5],
    marginBottom: spacing[1],
  },
  count: { fontSize: typography.fontSize.sm, ...font('medium') },
  toggleAll: { fontSize: typography.fontSize.sm, ...font('semibold') },
  list: { maxHeight: 380 },
  member: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  name: { fontSize: typography.fontSize.base, ...font('semibold') },
  email: { fontSize: typography.fontSize.xs, ...font() },
  in: { fontSize: typography.fontSize.sm, ...font('semibold') },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
});
