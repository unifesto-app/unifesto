import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readUpNextSnapshot } from '../sync';
import { COUNTDOWN_WIDGET_NAME, UP_NEXT_WIDGET_NAME, countdownPropsAt, propsAt } from '../upNext';
import { renderUpNextWidget } from './UpNextWidget';
import { renderCountdownWidget } from './CountdownWidget';

/**
 * Headless JS entry Android calls when a widget is added, resized or hits its
 * update period, possibly with the app closed. Draws from the snapshot the
 * app last saved; it never calls the API.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  const name = widgetInfo.widgetName;
  if (name !== UP_NEXT_WIDGET_NAME && name !== COUNTDOWN_WIDGET_NAME) return;
  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await readUpNextSnapshot();
      const now = new Date();
      renderWidget(
        name === COUNTDOWN_WIDGET_NAME
          ? renderCountdownWidget(countdownPropsAt(snapshot, now.getTime()), now)
          : renderUpNextWidget(propsAt(snapshot, now.getTime()), now),
      );
      break;
    }
    default:
      // Taps use OPEN_URI, handled natively; nothing to do on delete.
      break;
  }
}
