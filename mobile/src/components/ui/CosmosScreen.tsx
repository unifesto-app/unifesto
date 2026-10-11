import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { RefreshControl } from './RefreshControl';
import CosmosBackdrop from './CosmosBackdrop';
import useTopSpacing from '../../hooks/useTopSpacing';
import { useCosmos } from '../../theme/cosmos';

interface CosmosScreenProps extends Omit<ScrollViewProps, 'refreshControl'> {
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Wrap in a KeyboardAvoidingView (forms with a SaveBar). */
  keyboard?: boolean;
  /** Pinned over the scroll content, e.g. a SaveBar. */
  footer?: React.ReactNode;
  /** Bottom padding of the scroll content (default 120; forms with a SaveBar need ~180). */
  bottom?: number;
}

/**
 * A pushed screen in the cosmos theme: black ground with the night sky behind a
 * ScrollView that clears the transparent stack header. Pull-to-refresh when
 * `onRefresh` is given.
 */
export default function CosmosScreen({
  refreshing = false,
  onRefresh,
  keyboard,
  footer,
  bottom = 120,
  contentContainerStyle,
  children,
  ...scroll
}: CosmosScreenProps) {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const Wrap = keyboard ? KeyboardAvoidingView : View;

  return (
    <Wrap
      style={[styles.flex, { backgroundColor: c.bg }]}
      {...(keyboard ? { behavior: Platform.OS === 'ios' ? ('padding' as const) : ('height' as const) } : {})}
    >
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        {...scroll}
        contentContainerStyle={[{ paddingTop: topSpacing, paddingBottom: bottom }, contentContainerStyle]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.text}
              colors={[c.text]}
              progressViewOffset={topSpacing}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer}
    </Wrap>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
