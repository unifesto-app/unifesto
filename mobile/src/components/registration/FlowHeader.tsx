import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeft, X } from '@unifesto/unicon/react-native';
import PressableScale from '../ui/PressableScale';
import { spacing } from '../../theme/spacing';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

export const GUTTER = spacing[6];

/**
 * Top of the registration modals. They open full screen (never as sheets, see
 * app/_layout.tsx), so the top clears the status bar.
 */
export function SheetTop({ children, style, fill }: { children?: React.ReactNode; style?: object; fill?: boolean }) {
  return (
    <SafeAreaView edges={['top']} style={[fill && { flex: 1 }, style]}>
      <View style={[{ paddingTop: spacing[2] }, fill && { flex: 1 }]}>{children}</View>
    </SafeAreaView>
  );
}

/**
 * Registration header: back/close on the left and the event title. No step
 * progress: the step's own heading in the body says where you are. No
 * seat-hold countdown: seats aren't held before payment (Q37); checkout
 * trusts the server's stock (A31).
 */
export function FlowHeader({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack: (() => void) | null;
  onClose: () => void;
}) {
  const c = useCosmos();

  return (
    <SheetTop style={{ paddingHorizontal: GUTTER }}>
      <View style={styles.bar}>
        <PressableScale
          feedback="inline"
          onPress={onBack ?? onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={onBack ? 'Previous step' : 'Close'}
          style={styles.side}
        >
          {onBack ? <CaretLeft size={24} color={c.text} weight="bold" /> : <X size={24} color={c.text} weight="bold" />}
        </PressableScale>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {/* Balances the close button so the title stays centred. */}
        <View style={styles.side} />
      </View>
    </SheetTop>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  side: { width: 76, height: 44, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, ...cosmosFont.strong },
});
