import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { UpNextWidgetProps } from '../upNext';

/**
 * iOS "Up next" widget (home screen + lock screen).
 *
 * The 'widget' directive compiles this function to a string that runs in the
 * widget extension's own JS runtime, where `@expo/ui` components and modifiers
 * are globals. So: no hooks, no helpers or constants from outside this
 * function, and imports must be used under their exported names (no aliasing).
 */
const UpNextWidget = (props: UpNextWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = env.colorScheme !== 'light';
  const bg = dark ? '#0b0b0d' : '#ffffff';
  const text = dark ? '#ffffff' : '#0a0a0b';
  const muted = dark ? '#94a3b8' : '#52525b';
  const accent = dark ? '#e8e8ea' : '#111113';
  const family = env.widgetFamily;
  const isLockScreen = family === 'accessoryRectangular' || family === 'accessoryInline';

  // Lock screen widgets are tinted by the system; only text weight carries meaning there.
  if (family === 'accessoryInline') {
    if (props.state !== 'ticket') return <Text>No upcoming events</Text>;
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {props.isLive ? `Now: ${props.title}` : props.title}
      </Text>
    );
  }

  if (props.state !== 'ticket') {
    const signedOut = props.state === 'signedOut';
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }),
          ...(isLockScreen ? [] : [containerBackground(bg, 'widget')]),
          widgetURL(signedOut ? 'unifesto://login' : 'unifesto://events'),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Up next</Text>
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(text), lineLimit(2)]}>
          {signedOut ? 'Sign in to see your tickets' : 'Nothing booked yet'}
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(accent)]}>
          {signedOut ? 'Open Unifesto' : 'Find events'}
        </Text>
      </VStack>
    );
  }

  const startsAt = new Date(props.startsAt);

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>
          {props.isLive ? 'Happening now' : 'Up next'}
        </Text>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{props.title}</Text>
        {props.isLive ? (
          <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{props.venue}</Text>
        ) : (
          <Text date={startsAt} dateStyle="relative" modifiers={[font({ size: 13 }), lineLimit(1)]} />
        )}
      </VStack>
    );
  }

  const isMedium = family === 'systemMedium' || family === 'systemLarge';

  return (
    <VStack
      alignment="leading"
      spacing={isMedium ? 6 : 4}
      modifiers={[
        frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }),
        containerBackground(bg, 'widget'),
        widgetURL(props.url),
      ]}
    >
      <HStack spacing={6}>
        <Image systemName={props.isLive ? 'dot.radiowaves.left.and.right' : 'ticket.fill'} modifiers={[foregroundStyle(accent), font({ size: 13, weight: 'semibold' })]} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent)]}>
          {props.isLive ? 'Happening now' : 'Up next'}
        </Text>
        <Spacer />
        {props.moreCount > 0 ? (
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(muted)]}>{`+${props.moreCount}`}</Text>
        ) : null}
      </HStack>

      <Spacer />

      <Text
        modifiers={[
          font({ size: isMedium ? 20 : 16, weight: 'bold' }),
          foregroundStyle(text),
          lineLimit(isMedium ? 2 : 3),
          minimumScaleFactor(0.85),
        ]}
      >
        {props.title}
      </Text>

      {props.isLive ? null : (
        // A date-styled Text ticks down on its own, so the countdown stays live
        // between timeline entries without the app running.
        <Text
          date={startsAt}
          dateStyle="relative"
          modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(text), lineLimit(1)]}
        />
      )}
      {isMedium ? (
        // SwiftUI formats the date in the user's locale; no Intl needed in the widget runtime.
        <HStack spacing={4}>
          <Text date={startsAt} dateStyle="date" modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]} />
          <Text date={startsAt} dateStyle="time" modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]} />
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1), padding({ leading: 2 })]}>{`· ${props.venue}`}</Text>
        </HStack>
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(1)]}>{props.venue}</Text>
      )}
    </VStack>
  );
};

export default createWidget<UpNextWidgetProps>('UpNext', UpNextWidget);
