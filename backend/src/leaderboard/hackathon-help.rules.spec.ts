import { helpQueryRecipients } from './hackathon-help.service';

describe('helpQueryRecipients', () => {
  const base = { roomVolunteerIds: ['vol'], curatorIds: ['cur'], exclude: [] as string[] };

  it('sends a topic query to its POCs and the room volunteers', () => {
    expect(helpQueryRecipients({ ...base, pocUserIds: ['food'] }).sort()).toEqual(['food', 'vol']);
  });

  it('sends "Other" to the curators and the room volunteers', () => {
    expect(helpQueryRecipients({ ...base, pocUserIds: null }).sort()).toEqual(['cur', 'vol']);
  });

  it('falls back to the curators when the topic has no POC and the room no volunteers', () => {
    expect(helpQueryRecipients({ ...base, roomVolunteerIds: [], pocUserIds: [] })).toEqual(['cur']);
  });

  it('never sends to the team itself, and dedupes', () => {
    expect(helpQueryRecipients({ ...base, pocUserIds: ['vol', 'me'], exclude: ['me'] })).toEqual(['vol']);
  });
});
