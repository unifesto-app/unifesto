import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

/*
 * Single-series charts for the Apex dashboard, in the cosmos silver. One series
 * each, so no legend: the card title names it. Recessive baseline, 2px line,
 * 4px rounded bar tops, an 8px marker on the latest point, first/last labels.
 * Press and drag across a chart to read any bucket: a guide line marks it and
 * the label row swaps to "Sep · ₹30K".
 */

interface SeriesProps {
  values: number[];
  /** x-axis labels, same length as values; only the ends are drawn. */
  labels: string[];
  height?: number;
  /** Formats the scrubbed value; defaults to Indian digit grouping. */
  format?: (v: number) => string;
}

function useWidth() {
  const [w, setW] = useState(0);
  return { w, onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width) };
}

/**
 * Touch → nearest bucket. Uses pageX against the chart's on-screen origin, so it
 * doesn't matter which SVG child took the touch. Holds the gesture while
 * reading so the page doesn't scroll away under the finger.
 */
function useScrub(n: number, xOf: (i: number) => number) {
  const ref = useRef<View>(null);
  const origin = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const pick = (pageX: number) => {
    if (!n) return;
    const tx = pageX - origin.current;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xOf(i) - tx) < Math.abs(xOf(best) - tx)) best = i;
    setActive(best);
  };
  return {
    ref,
    active,
    handlers: {
      onStartShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderGrant: (e: GestureResponderEvent) => {
        const pageX = e.nativeEvent.pageX;
        ref.current?.measureInWindow((x) => {
          origin.current = x;
          pick(pageX);
        });
      },
      onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.pageX),
      onResponderRelease: () => setActive(null),
      onResponderTerminate: () => setActive(null),
    },
  };
}

function EndLabels({ labels, active, values, format }: { labels: string[]; active: number | null; values: number[]; format?: (v: number) => string }) {
  const c = useCosmos();
  if (!labels.length) return null;
  if (active !== null) {
    const v = values[active] ?? 0;
    return (
      <View style={styles.axis} accessibilityLiveRegion="polite">
        <Text style={[styles.axisText, styles.readout, { color: c.text }]}>
          {labels[active]} · {format ? format(v) : v.toLocaleString('en-IN')}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.axis}>
      <Text style={[styles.axisText, { color: c.muted }]}>{labels[0]}</Text>
      <Text style={[styles.axisText, { color: c.muted }]}>{labels[labels.length - 1]}</Text>
    </View>
  );
}

/** Area under a line: change over time for one measure. */
export function AreaChart({ values, labels, height = 72, format }: SeriesProps) {
  const c = useCosmos();
  const { w, onLayout } = useWidth();
  const max = Math.max(...values, 1);
  const pad = 5; // room for the end marker
  const x = (i: number) => (values.length > 1 ? pad + (i / (values.length - 1)) * (w - pad * 2) : w / 2);
  const y = (v: number) => pad + (1 - v / max) * (height - pad * 2);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  const { ref, active, handlers } = useScrub(values.length, x);
  const dot = active ?? last;

  return (
    <View onLayout={onLayout}>
      {w > 0 && values.length ? (
        <View ref={ref} {...handlers}>
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={`rgb(${c.glow})`} stopOpacity={0.22} />
              <Stop offset="1" stopColor={`rgb(${c.glow})`} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1={0} x2={w} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
          <Path d={`${line} L${x(last)},${height} L${x(0)},${height} Z`} fill="url(#area)" />
          <Path d={line} stroke={c.text} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {active !== null ? <Line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke={c.outline} strokeWidth={1} /> : null}
          <Circle cx={x(dot)} cy={y(values[dot])} r={4} fill={c.text} stroke={c.bg} strokeWidth={2} />
        </Svg>
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <EndLabels labels={labels} active={active} values={values} format={format} />
    </View>
  );
}

/** Vertical bars: a count per bucket. The latest bar is full ink, the rest muted. */
export function BarChart({ values, labels, height = 72, format }: SeriesProps) {
  const c = useCosmos();
  const { w, onLayout } = useWidth();
  const max = Math.max(...values, 1);
  const gap = 2;
  const bw = values.length ? Math.max(2, (w - gap * (values.length - 1)) / values.length) : 0;
  const { ref, active, handlers } = useScrub(values.length, (i) => i * (bw + gap) + bw / 2);
  const lit = active ?? values.length - 1;

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <View ref={ref} {...handlers}>
        <Svg width={w} height={height}>
          <Line x1={0} x2={w} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
          {values.map((v, i) => {
            const h = v > 0 ? Math.max(3, (v / max) * (height - 2)) : 0;
            const r = Math.min(4, bw / 2, h);
            const bx = i * (bw + gap);
            const top = height - h;
            // Rounded top, square foot on the baseline.
            const d = `M${bx},${height} L${bx},${top + r} Q${bx},${top} ${bx + r},${top} L${bx + bw - r},${top} Q${bx + bw},${top} ${bx + bw},${top + r} L${bx + bw},${height} Z`;
            return h ? <Path key={i} d={d} fill={c.text} opacity={i === lit ? 1 : 0.35} /> : null;
          })}
        </Svg>
        </View>
      ) : (
        <View style={{ height }} />
      )}
      <EndLabels labels={labels} active={active} values={values} format={format} />
    </View>
  );
}

/** Part of a whole as a ring, the percentage in the middle. */
export function Ring({ part, whole, size = 64 }: { part: number; whole: number; size?: number }) {
  const c = useCosmos();
  const stroke = Math.max(4, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = whole > 0 ? Math.min(1, part / whole) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.text}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ * frac} ${circ}`}
          // Start at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.ringText, { color: c.text }]}>{whole > 0 ? `${Math.round(frac * 100)}%` : '—'}</Text>
    </View>
  );
}

/** Thin horizontal meter, e.g. one queue's share of everything waiting. */
export function Meter({ frac, color }: { frac: number; color: string }) {
  const c = useCosmos();
  return (
    <Svg width="100%" height={4}>
      <Rect x={0} y={0} width="100%" height={4} rx={2} fill={c.border} />
      <Rect x={0} y={0} width={`${Math.max(4, Math.min(1, frac) * 100)}%`} height={4} rx={2} fill={color} />
    </Svg>
  );
}

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Shown on the right; defaults to the grouped number. */
  display?: string;
  onPress?: () => void;
}

/**
 * Ranked horizontal bars (top N, a status breakdown, a money split). One hue:
 * the label carries identity, so no legend and no categorical palette.
 */
export function BarList({ items, color }: { items: BarListItem[]; color?: string }) {
  const c = useCosmos();
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <View style={styles.list}>
      {items.map((it) => {
        const shown = it.display ?? it.value.toLocaleString('en-IN');
        const body = (
          <>
            <View style={styles.listHead}>
              <Text style={[styles.listLabel, { color: c.text }]} numberOfLines={1}>
                {it.label}
              </Text>
              <Text style={[styles.listValue, { color: c.soft }]}>{shown}</Text>
            </View>
            <Meter frac={Math.abs(it.value) / max} color={color ?? c.text} />
          </>
        );
        return it.onPress ? (
          <Pressable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}, ${shown}`}
            style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={it.key} style={styles.listRow} accessible accessibilityLabel={`${it.label}, ${shown}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  readout: { flex: 1, textAlign: 'center', ...cosmosFont.strong },
  list: { gap: 10 },
  listRow: { gap: 6, minHeight: 32, justifyContent: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  listLabel: { flex: 1, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  listValue: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  ringText: { fontSize: 11, ...cosmosFont.strong },
});
