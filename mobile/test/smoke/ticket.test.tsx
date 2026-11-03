import { expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import { fetchUpcomingTickets } from '../../src/lib/upcomingTickets';
import TicketDetailScreen from '../../src/screens/TicketDetailScreen';
import { mockApi } from './api';
import { mockNav } from './setup';

// The pass's QR as text, so the test can read what the door scanner would.
jest.mock('react-native-qrcode-svg', () => {
  const { Text } = require('react-native');
  return ({ value }: { value: string }) => <Text>{`QR ${value}`}</Text>;
});

const nextWeek = Date.now() + 7 * 86_400_000;

test('my ticket shows the event and the QR the door scans', async () => {
  mockApi({
    'GET /users/me/registrations': {
      data: [
        {
          id: 'reg1',
          status: 'REGISTERED',
          qrCode: 'UF-QR-123',
          ticketType: { name: 'General' },
          tickets: [{ ticketCode: 'TF-0042' }],
          event: {
            id: 'ev1',
            title: 'Tech Fest 2026',
            slug: 'tech-fest',
            status: 'PUBLISHED',
            startDateTime: new Date(nextWeek).toISOString(),
            endDateTime: new Date(nextWeek + 3_600_000).toISOString(),
            venueName: 'Main Hall',
          },
        },
      ],
    },
  });

  // The Tickets tab hands the screen this snapshot as its route param.
  const [ticket] = await fetchUpcomingTickets();
  mockNav.params = { id: 'reg1', ticket: JSON.stringify(ticket) };
  await render(
    <AuthProvider>
      <TicketDetailScreen />
    </AuthProvider>,
  );

  expect(await screen.findByText('Tech Fest 2026')).toBeTruthy();
  expect(screen.getByText('QR UF-QR-123')).toBeTruthy();
  expect(screen.getByText('TF-0042')).toBeTruthy();
});
