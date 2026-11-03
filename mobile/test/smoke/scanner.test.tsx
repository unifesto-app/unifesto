import { expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import CheckinScannerScreen from '../../src/screens/CheckinScannerScreen';
import { mockApi } from './api';

// The camera: granted, and the test reads a QR through the scan callback it was given.
let mockScan: ((e: { data: string }) => void) | undefined;
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockScan = props.onBarcodeScanned;
    return null;
  },
}));
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, token: 'marker' }) }));
jest.mock('../../src/context/SpaceAccessContext', () => ({ useSpaceAccess: () => ({ checkinEvents: [] }) }));

test('the door scanner checks a scanned ticket in at the point', async () => {
  const { calls } = mockApi({
    'GET /checkin/my-events': {
      events: [{ id: 'ev1', title: 'Tech Fest 2026', slug: 'tech-fest', checkinTypes: [{ id: 'gate', name: 'Main gate' }] }],
    },
    'GET /checkin/event/ev1/stats': { total: 10, checkedIn: 3, remaining: 7, cancelled: 0, checkInRate: 30 },
    'POST /checkin/scan': {
      success: true,
      alreadyCheckedIn: false,
      checkedInAt: '2026-11-10T10:00:00.000Z',
      attendee: { id: 'u2', fullName: 'Asha Rao', username: 'asha', avatarUrl: null },
      ticketType: 'General',
    },
  });

  await render(<CheckinScannerScreen eventId="ev1" />);

  expect(await screen.findByText('Main gate')).toBeTruthy();
  await act(async () => mockScan?.({ data: 'UF-QR-123' }));

  expect(await screen.findByText('Asha Rao')).toBeTruthy();
  expect(calls.find((c) => c.path === '/checkin/scan')?.body).toEqual({
    qrCode: 'UF-QR-123',
    checkinTypeId: 'gate',
    groupAware: true,
  });
});
