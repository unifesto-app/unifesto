import { AppAlert } from '../ui/AppAlert';
import { importTeams, type HackathonOverview } from '../../lib/api/hackathon';

/**
 * "Import teams": pick which group tickets to take (when there's more than
 * one), run the import, and report what happened. Re-running is safe, so the
 * copy says so. Calls `done` after a successful import so the screen reloads.
 */
export function runImportTeams(
  eventId: string,
  overview: Pick<HackathonOverview, 'hackathon' | 'groupTicketTypes'>,
  done: () => void,
) {
  if (!overview.hackathon?.teamCodePrefix) {
    AppAlert.alert('Set a Team ID prefix first', 'Teams get their IDs as they are imported. Add the prefix in hackathon settings.');
    return;
  }

  const go = async (ticketTypeIds?: string[]) => {
    const res = await importTeams(eventId, ticketTypeIds);
    if (!res.ok) return AppAlert.alert("Couldn't import", res.message);
    const r = res.data;
    const lines = [
      r.imported
        ? `${r.imported} new team${r.imported === 1 ? '' : 's'} imported. Each got a Team ID and a notification.`
        : 'No new group registrations to import.',
      r.alreadyImported ? `${r.alreadyImported} already had a team.` : '',
      r.individualSkipped
        ? `${r.individualSkipped} individual registration${r.individualSkipped === 1 ? ' was' : 's were'} left out (only group registrations become teams).`
        : '',
      `Next Team ID: ${r.nextTeamCode}`,
    ].filter(Boolean);
    AppAlert.alert(r.imported ? 'Teams imported' : 'Up to date', lines.join('\n\n'));
    done();
  };

  const types = overview.groupTicketTypes;
  const intro =
    'Confirmed group registrations become teams, in booking order. Running it again only adds new ones: Team IDs are never reassigned.';
  if (types.length <= 1) {
    AppAlert.alert('Import teams?', intro, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import', onPress: () => void go() },
    ]);
    return;
  }
  AppAlert.alert('Import teams from', intro, [
    { text: 'All group tickets', onPress: () => void go() },
    ...types.map((t) => ({ text: t.name, onPress: () => void go([t.id]) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
