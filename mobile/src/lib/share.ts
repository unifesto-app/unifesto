import { Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AppAlert } from '../components/ui/AppAlert';

type ShareArgs = {
  /** Human-readable message. Do NOT embed the url here — this helper adds it. */
  message: string;
  /** Canonical link to share. */
  url: string;
  /** Optional share-sheet title (Android uses it as the chooser title). */
  title?: string;
};

/**
 * Share a message + link across platforms.
 *
 * Why a shared helper: the three detail screens each hand-rolled this and each
 * swallowed errors with an empty catch, so a failed share on Android showed the
 * user nothing at all. Centralising it lets us (a) build the correct per-OS
 * payload once and (b) degrade gracefully — if the native sheet can't be
 * presented we copy the link to the clipboard and tell the user, so the button
 * always does *something*.
 *
 * Android's ACTION_SEND ignores the `url` key, so the link must be folded into
 * the message text; iOS keeps them separate and renders a richer preview.
 */
export async function shareLink({ message, url, title }: ShareArgs): Promise<void> {
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url, ...(title ? { title } : {}) }
        : { message: `${message}\n${url}`, ...(title ? { title } : {}) }
    );
  } catch (error) {
    // The native share sheet failed to present (seen on some Android builds).
    // Fall back to the clipboard so the user can still paste the link.
    if (__DEV__) console.warn('[shareLink] native share failed, falling back to clipboard:', error);
    try {
      await Clipboard.setStringAsync(url);
      AppAlert.alert('Link copied', "We couldn't open the share menu, so the link is on your clipboard.");
    } catch {
      AppAlert.alert('Unable to share', 'Please try again in a moment.');
    }
  }
}
