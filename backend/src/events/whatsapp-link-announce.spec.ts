import { EventsService } from './events.service';
import { WHATSAPP_LINK_SET } from '../common/whatsapp-links';

// Saving a group link sends it to confirmed attendees (the registrations module
// listens). Only a new, non-empty link on an event that hasn't ended counts.
describe('announceWhatsAppLink', () => {
  const announce = (EventsService.prototype as any).announceWhatsAppLink;
  const link = 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv';
  const live = { id: 'ev1', endDateTime: new Date(Date.now() + 86_400_000) };
  const over = { id: 'ev1', endDateTime: new Date(Date.now() - 86_400_000) };

  const emitted = (event: typeof live, before: string | null, after: string | null | undefined) => {
    const emit = jest.fn();
    announce.call({ events: { emit } }, event, before, after);
    return emit.mock.calls;
  };

  it('announces a new link', () => {
    expect(emitted(live, null, link)).toEqual([[WHATSAPP_LINK_SET, { eventId: 'ev1' }]]);
    expect(emitted(live, 'https://chat.whatsapp.com/OldOldOldOld1', link)).toHaveLength(1);
  });

  it('stays quiet when the link is unchanged, cleared, untouched, or the event is over', () => {
    expect(emitted(live, link, link)).toHaveLength(0);
    expect(emitted(live, link, null)).toHaveLength(0);
    expect(emitted(live, link, undefined)).toHaveLength(0);
    expect(emitted(over, null, link)).toHaveLength(0);
  });
});
