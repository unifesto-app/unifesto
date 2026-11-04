import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import SegmentedTabs from './SegmentedTabs';

export interface TabPagerProps<K extends string> {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  /** One page per tab, all kept mounted. A full-screen pager gives each page its own vertical scroll view. */
  renderPage: (key: K) => React.ReactNode;
  /** Wraps the segmented control (gutter, margins). */
  tabsStyle?: StyleProp<ViewStyle>;
  /**
   * Tabs partway down a screen's own ScrollView: the pager takes the height of
   * the page in view (easing between neighbours mid-swipe) instead of filling
   * the space left.
   */
  inline?: boolean;
  glass?: boolean;
}

/**
 * The Tickets switcher, shared: segmented tabs over a horizontal pager. Swipe
 * between pages and the thumb tracks the finger; tap a tab and the pager
 * slides there. Pages stay mounted, so a neighbour shows mid-drag as it was.
 */
export default function TabPager<K extends string>({ tabs, value, onChange, renderPage, tabsStyle, inline, glass }: TabPagerProps<K>) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const keys = tabs.map((t) => t.key);
  const last = keys.length - 1;
  const index = Math.max(0, keys.indexOf(value));
  const pager = useAnimatedRef<Animated.ScrollView>();
  // Fractional page index, written on the UI thread as the pager scrolls; the
  // thumb reads it so it tracks the finger frame by frame.
  const position = useSharedValue(index);
  const lastIndex = useSharedValue(index);
  // Page the pager is showing, and the page a tab tap is scrolling towards
  // (while set, pages passed on the way don't flip the selected tab).
  const shownIndex = useRef(index);
  const scrollTarget = useRef<number | null>(null);
  const heights = useSharedValue<number[]>([]);

  // Tab changed from outside a drag (tap, or the screen picking one).
  useEffect(() => {
    if (index === shownIndex.current) return;
    scrollTarget.current = index;
    pager.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width, pager]);

  // First layout, rotation or a window resize: the page in view stays lined
  // up at the new width instead of showing half of two.
  useEffect(() => {
    pager.current?.scrollTo({ x: shownIndex.current * width, animated: false });
  }, [width, pager]);

  // Runs on the JS thread only when the nearest page changes, not per frame.
  const onPageChange = useRef((_index: number) => {});
  onPageChange.current = (i: number) => {
    shownIndex.current = i;
    if (scrollTarget.current !== null) {
      if (i === scrollTarget.current) scrollTarget.current = null;
      return;
    }
    // Past halfway through a drag: select the incoming tab (label colours).
    if (keys[i] !== value) onChange(keys[i]);
  };
  const pageChanged = useCallback((i: number) => onPageChange.current(i), []);
  const dragStarted = useCallback(() => {
    scrollTarget.current = null;
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scheduleOnRN(dragStarted);
    },
    onScroll: (e) => {
      if (width <= 0) return;
      const p = Math.max(0, Math.min(last, e.contentOffset.x / width));
      position.value = p;
      const i = Math.round(p);
      if (i !== lastIndex.value) {
        lastIndex.value = i;
        scheduleOnRN(pageChanged, i);
      }
    },
  });

  const sized = useAnimatedStyle(() => {
    if (!inline) return {};
    const h = heights.value;
    const i = Math.floor(position.value);
    const from = h[i];
    if (from === undefined) return {};
    const to = h[i + 1] ?? from;
    return { height: from + (to - from) * (position.value - i) };
  });

  return (
    <>
      <View style={tabsStyle}>
        <SegmentedTabs tabs={tabs} value={value} onChange={onChange} position={position} glass={glass} />
      </View>
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        // Inline pages keep their own height (measured below) instead of the tallest one's.
        contentContainerStyle={inline ? { alignItems: 'flex-start' } : undefined}
        style={[inline ? null : { flex: 1 }, sized]}
      >
        {keys.map((key, i) => (
          <View
            key={key}
            style={{ width }}
            onLayout={
              inline
                ? (e) => {
                    const next = [...heights.value];
                    next[i] = e.nativeEvent.layout.height;
                    heights.value = next;
                  }
                : undefined
            }
          >
            {renderPage(key)}
          </View>
        ))}
      </Animated.ScrollView>
    </>
  );
}
