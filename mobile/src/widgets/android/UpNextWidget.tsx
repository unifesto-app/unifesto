import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { countdownLabel, relativeWhen } from '../../utils/eventFormat';
import type { UpNextWidgetProps } from '../upNext';

type Palette = { bg: string; text: string; muted: string; accent: string };

// Mirrors the app's dark / light tokens (src/theme/tokens.ts).
const DARK: Palette = { bg: '#0b0b0d', text: '#ffffff', muted: '#94a3b8', accent: '#e8e8ea' };
const LIGHT: Palette = { bg: '#ffffff', text: '#0a0a0b', muted: '#52525b', accent: '#111113' };

/**
 * Android "Up next" widget. Rendered to RemoteViews by react-native-android-widget,
 * so only its Flex/Text/Image primitives work here — no RN views or hooks.
 * Android can't tick a countdown on its own, so the label is computed at render
 * time and refreshed by the widget's update period and whenever the app syncs.
 */
function UpNextView({ props, c, now }: { props: UpNextWidgetProps; c: Palette; now: Date }) {
  const root = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundColor: c.bg as `#${string}`,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'column' as const,
    justifyContent: 'space-between' as const,
  };

  if (props.state !== 'ticket') {
    const signedOut = props.state === 'signedOut';
    return (
      <FlexWidget
        style={root}
        clickAction="OPEN_URI"
        clickActionData={{ uri: signedOut ? 'unifesto://login' : 'unifesto://events' }}
      >
        <TextWidget text="Up next" style={{ fontSize: 13, fontWeight: '600', color: c.muted as `#${string}` }} />
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text={signedOut ? 'Sign in to see your tickets' : 'Nothing booked yet'}
            maxLines={2}
            style={{ fontSize: 16, fontWeight: '600', color: c.text as `#${string}` }}
          />
          <TextWidget
            text={signedOut ? 'Open Unifesto' : 'Find events'}
            style={{ fontSize: 13, color: c.accent as `#${string}`, marginTop: 4 }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  const iso = new Date(props.startsAt).toISOString();
  return (
    <FlexWidget style={root} clickAction="OPEN_URI" clickActionData={{ uri: props.url }}>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
        <TextWidget
          text={props.isLive ? 'Happening now' : countdownLabel(iso, now)}
          style={{ fontSize: 13, fontWeight: '600', color: c.accent as `#${string}` }}
        />
        {props.moreCount > 0 ? (
          <TextWidget text={`+${props.moreCount}`} style={{ fontSize: 12, color: c.muted as `#${string}` }} />
        ) : (
          <TextWidget text="" style={{ fontSize: 12 }} />
        )}
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        <TextWidget
          text={props.title}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 17, fontWeight: '700', color: c.text as `#${string}` }}
        />
        <TextWidget
          text={relativeWhen(iso, now)}
          maxLines={1}
          style={{ fontSize: 13, fontWeight: '500', color: c.text as `#${string}`, marginTop: 4 }}
        />
        <TextWidget
          text={props.venue}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: c.muted as `#${string}`, marginTop: 2 }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light + dark variants; the launcher picks one to match the system theme. */
export function renderUpNextWidget(props: UpNextWidgetProps, now = new Date()) {
  return {
    light: <UpNextView props={props} c={LIGHT} now={now} />,
    dark: <UpNextView props={props} c={DARK} now={now} />,
  };
}
