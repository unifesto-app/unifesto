import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import SegmentedTabs from '../ui/SegmentedTabs';
import type { TicketTab } from '../../hooks/useMyTickets';

export const TICKET_TABS: { key: TicketTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'waitlist', label: 'Waitlist' },
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
