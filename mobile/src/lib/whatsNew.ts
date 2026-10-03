import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppAlert } from '../components/ui/AppAlert';

/**
 * In-app "What's new". The notes ship inside the JS bundle, so an OTA update
 * brings its own: add an entry at the top for every release that has
 * something people will notice (store build or OTA), newest first. Shown once
 * per entry after it lands; never on a fresh install, where nothing is "new".
 */
export interface WhatsNewEntry {
  /** Release id: the app version, or the OTA release name ("4.1.0"). */
  id: string;
  title: string;
  items: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '4.1.0',
    title: 'What’s new',
    items: [
      'Hackathons: your team hub, rooms, problem statements, judging, results and a help desk, all in the app.',
      'Team leads can add or remove members and hand over the lead, while the organiser allows it.',
      'Organisers: the attendee list now has pages, and stays can have a photo gallery.',
      'Hiding a seat invite from Home now declines it, so your team lead knows.',
    ],
  },
  {
    id: '4.0.5',
    title: 'What’s new',
    items: [
      'Change your registration details from your ticket, while the organiser allows it.',
      'Team leads can replace a teammate, while the organiser allows it.',
      'Organisers: page views, short links and link stats in Tracking.',
      'Check-in finds every team member and stops double check-ins.',
      'Smoother Home and a clearer header on every screen.',
    ],
  },
];

const SEEN_KEY = 'whatsNew.seen';
/** Written by appVersionReport on any earlier version; tells an upgrade from a fresh install. */
const EARLIER_VERSION_KEY = 'unifesto_last_reported_app_version';

/** Show the newest notes once, if this person hasn't seen them. Never throws. */
export async function showWhatsNewIfNeeded(): Promise<void> {
  const latest = WHATS_NEW[0];
  if (!latest) return;
  try {
    const seen = await AsyncStorage.getItem(SEEN_KEY);
    if (seen === latest.id) return;
    await AsyncStorage.setItem(SEEN_KEY, latest.id);
    // First run of this feature: only an upgrade (the app ran before) gets the notes.
    if (seen === null && !(await AsyncStorage.getItem(EARLIER_VERSION_KEY))) return;
    AppAlert.alert(latest.title, latest.items.map((i) => `•  ${i}`).join('\n'));
  } catch {
    // Storage unavailable: skip rather than nag every launch.
  }
}
