import type { GlyphName } from '@unifesto/unicon/react-native';

/**
 * In-app "What's new". The notes ship inside the JS bundle, so an OTA update
 * brings its own: add a release at the top for every version that has
 * something people will notice (store build or OTA), newest first. Only the
 * newest is shown, once, after it lands; never on a fresh install, where
 * nothing is "new". Profile › What's new reopens it any time.
 * The sheet and the once-per-version storage live in components/WhatsNewSheet.
 */
export interface WhatsNewItem {
  icon?: GlyphName;
  title: string;
  body?: string;
}

export interface WhatsNewSection {
  title: string;
  /** 'operators': only people with a Space tab (curators, crew, check-in staff, judges, sponsors). */
  audience?: 'operators';
  items: WhatsNewItem[];
}

export interface WhatsNewRelease {
  /** The app version (or OTA release name) these notes belong to. */
  version: string;
  sections: WhatsNewSection[];
}

export const WHATS_NEW: WhatsNewRelease[] = [
  {
    version: '5.0.0',
    sections: [
      {
        title: 'For everyone',
        items: [
          { icon: 'chats-circle', title: 'Live polls, Q&A and quizzes', body: 'Vote, ask and upvote questions, and play quizzes from the ticket while the event is on.' },
          { icon: 'certificate', title: 'After the event', body: 'Past tickets and the Sprint hub show results and certificates once an event ends.' },
          { icon: 'lifebuoy', title: 'Get help in the app', body: 'Ask from Profile and follow every request in My help.' },
          { icon: 'bell', title: 'Updates in one place', body: 'The bell on Home keeps every update, and quiet hours hold pushes overnight.' },
          { icon: 'lightning', title: 'Faster and steadier', body: 'Long lists scroll smoothly, and tickets keep the last copy when the signal drops.' },
          { icon: 'sparkle', title: 'A fresh look', body: 'Home, Tickets and Profile are redesigned, with Up next at the top of My tickets.' },
        ],
      },
      {
        title: 'For organisers',
        audience: 'operators',
        items: [
          { icon: 'chart-bar', title: 'Run the room live', body: 'Launch polls, Q&A and quizzes from Manage event, and put results on a projector from Space.' },
          { icon: 'users-three', title: 'Group check-in by person', body: 'Check in each member of a group, and undo a scan that was a mistake.' },
          { icon: 'wifi-slash', title: 'Door tools that work offline', body: 'The scanner and guest list keep working without signal and sync when you are back.' },
          { icon: 'identification-card', title: 'Print badges', body: 'Print badges and passes from the attendee list on Space, on A4 or label printers.' },
          { icon: 'tray', title: 'Support in Assist', body: 'Attendee requests land in the Space Assist inbox, with unread badges.' },
        ],
      },
    ],
  },
  {
    version: '4.1.0',
    sections: [
      {
        title: 'What’s new',
        items: [
          { title: 'Unifesto Sprint: your hackathon team hub, rooms, problem statements, judging, results and a help desk, all in the app.' },
          { title: 'Team leads can add or remove members and hand over the lead, while the organiser allows it.' },
          { title: 'Organisers: the attendee list now has pages, and stays can have a photo gallery.' },
          { title: 'Hiding a seat invite from Home now declines it, so your team lead knows.' },
        ],
      },
    ],
  },
  {
    version: '4.0.5',
    sections: [
      {
        title: 'What’s new',
        items: [
          { title: 'Change your registration details from your ticket, while the organiser allows it.' },
          { title: 'Team leads can replace a teammate, while the organiser allows it.' },
          { title: 'Organisers: page views, short links and link stats in Tracking.' },
          { title: 'Check-in finds every team member and stops double check-ins.' },
          { title: 'Smoother Home and a clearer header on every screen.' },
        ],
      },
    ],
  },
];

/** The sections this person sees: operator-only ones need a Space tab. */
export const sectionsFor = (release: WhatsNewRelease, operator: boolean) =>
  release.sections.filter((s) => s.audience !== 'operators' || operator);

/**
 * Whether to show the newest notes on this launch.
 * - `seen`: the release last marked seen on this device (null if never).
 * - `ranBefore`: an earlier version of the app ran here, which tells an
 *   upgrade from a fresh install the first time this check ever runs.
 * The caller marks `latest` seen whatever this returns, so it shows once.
 */
export function shouldShowWhatsNew(latest: string, seen: string | null, ranBefore: boolean): boolean {
  if (seen === latest) return false;
  // Never seen any notes and the app never ran before: a fresh install.
  if (seen === null && !ranBefore) return false;
  return true;
}
