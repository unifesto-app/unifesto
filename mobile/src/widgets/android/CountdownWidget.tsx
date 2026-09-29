import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { countdownLabel } from '../../utils/eventFormat';
import type { CountdownWidgetProps } from '../upNext';

type Palette = { bg: string; text: string; muted: string; accent: string };

// Mirrors the app's dark / light tokens (src/theme/tokens.ts), like UpNextWidget.
const DARK: Palette = { bg: '#0b0b0d', text: '#ffffff', muted: '#94a3b8', accent: '#3491ff' };
const LIGHT: Palette = { bg: '#ffffff', text: '#0a0a0b', muted: '#52525b', accent: '#0062ff' };

type Hex = `#${string}`;

/**
 * Android "Countdown" widget: days to go until the next event. Computed at
 * render time (Android can't tick on its own); redrawn on the widget's update
 * period and whenever the app syncs, so "Today" shows "Starts in 2h" style.
 */
function CountdownView({ props, c, now }: { props: CountdownWidgetProps; c: Palette; now: Date }) {
  const root = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundColor: c.bg as Hex,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  };

  if (props.state !== 'ticket') {
    const signedOut = props.state === 'signedOut';
    return (
      <FlexWidget style={root} clickAction="OPEN_URI" clickActionData={{ uri: signedOut ? 'unifesto://login' : 'unifesto://events' }}>
        <TextWidget text="Countdown" style={{ fontSize: 13, fontWeight: '600', color: c.muted as Hex }} />
        <TextWidget
          text={signedOut ? 'Sign in to Unifesto' : 'Nothing booked yet'}
          maxLines={2}
          style={{ fontSize: 15, fontWeight: '600', color: c.text as Hex, textAlign: 'center' }}
        />
        <TextWidget text="" style={{ fontSize: 12 }} />
      </FlexWidget>
    );
  }

  const today = props.daysLeft === 0;
  const big = props.isLive ? 'Now' : today ? 'Today' : String(props.daysLeft);
  const sub = props.isLive
    ? 'Happening now'
    : today
      ? countdownLabel(new Date(props.startsAt).toISOString(), now)
      : props.daysLeft === 1
        ? 'day to go'
        : 'days to go';

  return (
    <FlexWidget style={root} clickAction="OPEN_URI" clickActionData={{ uri: props.url }}>
      <TextWidget text="Countdown" style={{ fontSize: 12, fontWeight: '600', color: c.accent as Hex }} />
      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }}>
        <TextWidget text={big} maxLines={1} style={{ fontSize: big.length > 3 ? 32 : 44, fontWeight: '700', color: c.text as Hex }} />
        <TextWidget text={sub} maxLines={1} style={{ fontSize: 13, fontWeight: '500', color: c.muted as Hex }} />
      </FlexWidget>
      <TextWidget
        text={props.title}
        maxLines={2}
        truncate="END"
        style={{ fontSize: 12, fontWeight: '600', color: c.text as Hex, textAlign: 'center' }}
      />
    </FlexWidget>
  );
}

/** Light + dark variants; the launcher picks one to match the system theme. */
export function renderCountdownWidget(props: CountdownWidgetProps, now = new Date()) {
  return {
    light: <CountdownView props={props} c={LIGHT} now={now} />,
    dark: <CountdownView props={props} c={DARK} now={now} />,
  };
}
