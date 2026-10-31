// Peak 3: registrations open and everyone takes a free ticket at once. Each
// seeded user registers once (one live ticket per user per ticket type).
// Use a FREE ticket type: a paid one calls Razorpay for every order.
//   STAGING_IP=… EVENT_ID=… TICKET_TYPE_ID=… [INTERNAL_KEY=…] k6 run checkout.js
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { API, base, auth, loadTokens } from './lib.js';

const users = new SharedArray('users', () => loadTokens().users);

export const options = {
  ...base,
  scenarios: {
    rush: { executor: 'shared-iterations', vus: 50, iterations: users.length, maxDuration: '10m' },
  },
};

export default function () {
  const user = users[exec.scenario.iterationInTest];
  const res = http.post(
    `${API}/events/${__ENV.EVENT_ID}/register/create-order`,
    JSON.stringify({ ticketTypeId: __ENV.TICKET_TYPE_ID, quantity: 1 }),
    auth(user.token),
  );
  check(res, { registered: (r) => (r.status === 200 || r.status === 201) && !!r.json('registrationId') });
}
