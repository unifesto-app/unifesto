import { Linking } from 'react-native';
import { AppAlert } from '../components/ui/AppAlert';

const CONSOLE_URL = 'https://www.unifesto.app/console';
const APEX_WEB_URL = 'https://apex.unifesto.app';

const open = (url: string, app: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${app}`));

/**
 * Desk work lives on the web (D3): editors and setup open the same page in
 * the console (Track V). `path` is relative to /console; `spaceId` makes the
 * console switch to that space first.
 */
export const openSpaceWeb = (path = '', spaceId?: string) =>
  open(`${CONSOLE_URL}${path}${spaceId ? `${path.includes('?') ? '&' : '?'}space=${spaceId}` : ''}`, 'Unifesto Space');

/** The Apex web console, for platform setup that stays off mobile. */
export const openApexWeb = (path = '/dashboard') => open(`${APEX_WEB_URL}${path}`, 'Apex');
