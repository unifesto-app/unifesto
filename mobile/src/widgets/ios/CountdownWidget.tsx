import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  multilineTextAlignment,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { CountdownWidgetProps } from '../upNext';

/**
 * iOS "Countdown" widget: days to go until the next event, big.
 *
 * Same rules as UpNextWidget: the 'widget' directive compiles this to a string
 * for the extension's JS runtime, so no hooks, no outside helpers, and imports
 * used under their exported names. The day count is pre-rendered per timeline
 * entry (one at each local midnight); on the day itself a `timer` Text counts
 * down to the start on its own.
 */
const CountdownWidget = (props: CountdownWidgetProps, env: WidgetEnvironment) => {
  'widget';

  const dark = env.colorScheme !== 'light';
  const bg = dark ? '#0b0b0d' : '#ffffff';
  const text = dark ? '#ffffff' : '#0a0a0b';
  const muted = dark ? '#94a3b8' : '#52525b';
  const accent = dark ? '#e8e8ea' : '#111113';
  const family = env.widgetFamily;

  if (props.state !== 'ticket') {
    const label = props.state === 'signedOut' ? 'Sign in' : 'No events';
    if (family === 'accessoryCircular' || family === 'accessoryRectangular') {
      return <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>{label}</Text>;
    }
    return (
      <VStack
        spacing={4}
        modifiers={[
          frame({ maxWidth: 10000, maxHeight: 10000 }),
          containerBackground(bg, 'widget'),
          widgetURL(props.state === 'signedOut' ? 'unifesto://login' : 'unifesto://events'),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>Countdown</Text>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(text)]}>
          {props.state === 'signedOut' ? 'Sign in to Unifesto' : 'Nothing booked yet'}
        </Text>
      </VStack>
    );
  }

  const startsAt = new Date(props.startsAt);
  const big = props.isLive ? 'Now' : props.daysLeft === 0 ? 'Today' : String(props.daysLeft);
  const unit = props.isLive || props.daysLeft === 0 ? '' : props.daysLeft === 1 ? 'day to go' : 'days to go';

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={0} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: props.daysLeft > 99 ? 16 : 22, weight: 'bold' }), minimumScaleFactor(0.6)]}>{big}</Text>
        {unit ? <Text modifiers={[font({ size: 9, weight: 'semibold' })]}>days</Text> : null}
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.title}</Text>
        {props.isLive ? (
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>Happening now</Text>
        ) : props.daysLeft === 0 ? (
          <Text date={startsAt} dateStyle="timer" modifiers={[font({ size: 15, weight: 'bold' })]} />
        ) : (
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>{`${big} ${unit}`}</Text>
        )}
      </VStack>
    );
  }

  return (
    <VStack
      spacing={2}
      modifiers={[
        frame({ maxWidth: 10000, maxHeight: 10000 }),
        containerBackground(bg, 'widget'),
        widgetURL(props.url),
      ]}
    >
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent)]}>
        {props.isLive ? 'Happening now' : 'Countdown'}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 44, weight: 'bold' }), foregroundStyle(text), minimumScaleFactor(0.5), lineLimit(1)]}>{big}</Text>
      {props.daysLeft === 0 && !props.isLive ? (
        // Ticks down on its own between timeline entries.
        <Text date={startsAt} dateStyle="timer" modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(text), multilineTextAlignment('center')]} />
      ) : unit ? (
        <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(muted)]}>{unit}</Text>
      ) : null}
      <Spacer />
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(text), lineLimit(2), multilineTextAlignment('center')]}>
        {props.title}
      </Text>
    </VStack>
  );
};

export default createWidget<CountdownWidgetProps>('Countdown', CountdownWidget);
