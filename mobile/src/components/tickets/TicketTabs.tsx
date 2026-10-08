import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import SegmentedTabs from '../ui/SegmentedTabs';
import type { TicketTab } from '../../hooks/useMyTickets';

// Same order as ALL_TABS: the pager page index is the segment index.
export const TICKET_TABS: { key: TicketTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function TicketTabs({
  value,
  onChange,
  position,
}: {
  value: TicketTab;
  onChange: (t: TicketTab) => void;
  position?: SharedValue<number>;
}) {
  return <SegmentedTabs tabs={TICKET_TABS} value={value} onChange={onChange} position={position} />;
}
