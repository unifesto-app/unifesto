import React from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type FlatListProps,
  type ScrollViewProps,
} from 'react-native';
import { RefreshControl } from './RefreshControl';
import CosmosBackdrop from './CosmosBackdrop';
import useTopSpacing from '../../hooks/useTopSpacing';
import { useCosmos } from '../../theme/cosmos';
import { column } from '../../theme/spacing';

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

/** The scroller props both CosmosScreen and CosmosList share. */
function useCosmosScroll(refreshing: boolean, onRefresh: (() => void) | undefined, bottom: number, contentContainerStyle: ScrollViewProps['contentContainerStyle']) {
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  return {
    contentContainerStyle: [column, { paddingTop: topSpacing, paddingBottom: bottom }, contentContainerStyle],
    refreshControl: onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={c.text}
        colors={[c.text]}
        progressViewOffset={topSpacing}
      />
    ) : undefined,
  };
}

const SCROLL_DEFAULTS = {
  contentInsetAdjustmentBehavior: 'never',
  automaticallyAdjustContentInsets: false,
  showsVerticalScrollIndicator: false,
  keyboardShouldPersistTaps: 'handled',
} as const;

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
  const shared = useCosmosScroll(refreshing, onRefresh, bottom, contentContainerStyle);
  const Wrap = keyboard ? KeyboardAvoidingView : View;

  return (
    <Wrap
      style={[styles.flex, { backgroundColor: c.bg }]}
      {...(keyboard ? { behavior: Platform.OS === 'ios' ? ('padding' as const) : ('height' as const) } : {})}
    >
      <CosmosBackdrop horizon={false} />
      <ScrollView {...SCROLL_DEFAULTS} {...scroll} {...shared}>
        {children}
      </ScrollView>
      {footer}
    </Wrap>
  );
}

type CosmosListProps<T> = Omit<FlatListProps<T>, 'refreshControl'> & Pick<CosmosScreenProps, 'refreshing' | 'onRefresh' | 'bottom'>;

/** CosmosScreen with a FlatList as the scroller, for long lists. */
export function CosmosList<T>({ refreshing = false, onRefresh, bottom = 120, contentContainerStyle, ...list }: CosmosListProps<T>) {
  const c = useCosmos();
  const shared = useCosmosScroll(refreshing, onRefresh, bottom, contentContainerStyle);
  return (
    <View style={[styles.flex, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <FlatList {...SCROLL_DEFAULTS} {...list} {...shared} />
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
