import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { UpcomingTicket } from '../hooks/useHomeData';
import {
  COUNTDOWN_WIDGET_NAME,
  UP_NEXT_STORAGE_KEY,
  UP_NEXT_WIDGET_NAME,
  countdownMoments,
  countdownPropsAt,
  propsAt,
  timelineMoments,
  toUpNextTicket,
  type UpNextSnapshot,
} from './upNext';

const EMPTY: UpNextSnapshot = { signedIn: false, tickets: [], full: {}, savedAt: 0 };

export async function readUpNextSnapshot(): Promise<UpNextSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(UP_NEXT_STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Save the latest upcoming tickets and redraw the home-screen widget.
 * `tickets === null` means signed out: the widget drops every ticket.
 * Never throws: a widget refresh must not break the Home tab.
 */
export async function syncUpNextWidget(tickets: UpcomingTicket[] | null): Promise<void> {
  try {
    const rows = (tickets ?? [])
      .map(toUpNextTicket)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => a.startsAt - b.startsAt);
    const snapshot: UpNextSnapshot = {
      signedIn: tickets !== null,
      tickets: rows,
      full: Object.fromEntries((tickets ?? []).filter((t) => t?.id).map((t) => [String(t.id), t])),
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(UP_NEXT_STORAGE_KEY, JSON.stringify(snapshot));
    await pushToWidget(snapshot);
  } catch (error) {
    if (__DEV__) console.warn('[widgets] sync failed', error);
  }
}

async function pushToWidget(snapshot: UpNextSnapshot) {
  const now = Date.now();
  if (Platform.OS === 'ios') {
    // A dev client built before expo-widgets was added has no native module;
    // requiring the widget file would throw (and log a red error) every sync.
    if (!requireOptionalNativeModule('ExpoWidgets')) return;
    // Lazy: @expo/ui's SwiftUI views only exist in the iOS binary.
    const UpNextWidget = require('./ios/UpNextWidget').default as typeof import('./ios/UpNextWidget').default;
    UpNextWidget.updateTimeline(
      timelineMoments(snapshot.tickets, now).map((t) => ({ date: new Date(t), props: propsAt(snapshot, t) })),
    );
    const CountdownWidget = require('./ios/CountdownWidget').default as typeof import('./ios/CountdownWidget').default;
    CountdownWidget.updateTimeline(
      countdownMoments(snapshot.tickets, now).map((t) => ({ date: new Date(t), props: countdownPropsAt(snapshot, t) })),
    );
  } else if (Platform.OS === 'android') {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { renderUpNextWidget } = require('./android/UpNextWidget') as typeof import('./android/UpNextWidget');
    await requestWidgetUpdate({
      widgetName: UP_NEXT_WIDGET_NAME,
      renderWidget: () => renderUpNextWidget(propsAt(snapshot, now), new Date(now)),
    });
    const { renderCountdownWidget } = require('./android/CountdownWidget') as typeof import('./android/CountdownWidget');
    await requestWidgetUpdate({
      widgetName: COUNTDOWN_WIDGET_NAME,
      renderWidget: () => renderCountdownWidget(countdownPropsAt(snapshot, now), new Date(now)),
    });
  }
}
