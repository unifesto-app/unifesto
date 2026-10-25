import { Linking } from 'react-native';
import { AppAlert } from '../components/ui/AppAlert';

const SPACE_WEB_URL = 'https://space.unifesto.app';
const APEX_WEB_URL = 'https://apex.unifesto.app';

const open = (url: string, app: string) =>
  Linking.openURL(url).catch(() => AppAlert.alert('Error', `Unable to open ${app}`));

/**
 * Desk work lives on the web (D3): editors and setup open the same page on
 * space.unifesto.app. `spaceId` makes the web app switch to that space first.
 */
export const openSpaceWeb = (path = '/dashboard', spaceId?: string) =>
  open(`${SPACE_WEB_URL}${path}${spaceId ? `${path.includes('?') ? '&' : '?'}space=${spaceId}` : ''}`, 'Unifesto Space');

/** The Apex web console, for platform setup that stays off mobile. */
export const openApexWeb = (path = '/dashboard') => open(`${APEX_WEB_URL}${path}`, 'Apex');
