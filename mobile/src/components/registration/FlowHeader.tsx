import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaretLeft, X } from '@unifesto/unicon/react-native';
import PressableScale from '../ui/PressableScale';
import { spacing } from '../../theme/spacing';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

export const GUTTER = spacing[6];

/**
 * Top of the registration modals. iOS opens them as sheets, which start below
 * the status bar: no inset there (SafeAreaView reads the app's insets, the
 * window's, so it padded a sheet by the status bar's height). Android opens
 * them full screen, so the top clears the status bar.
 */
export function SheetTop({ children, style, fill }: { children?: React.ReactNode; style?: object; fill?: boolean }) {
  const outer = [fill && { flex: 1 }, style];
  // A sheet's own top margin (clear of its rounded corners); full screen sits under the inset.
  const inner = <View style={[{ paddingTop: Platform.OS === 'ios' ? spacing[5] : spacing[2] }, fill && { flex: 1 }]}>{children}</View>;
  return Platform.OS === 'ios' ? (
    <View style={outer}>{inner}</View>
  ) : (
    <SafeAreaView edges={['top']} style={outer}>
      {inner}
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
