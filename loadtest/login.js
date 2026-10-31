// Peak 2: sign-in rush when registrations open. Uses the App Review sign-in
// (test-user@unifesto.app, fixed code, no OTP is sent; README section 2 turns
// it on), so it measures the verify path: user lookup, session row, tokens.
// Every VU is the same user, so INTERNAL_KEY is needed to get past the
// per-user limit.
//   STAGING_IP=… INTERNAL_KEY=… k6 run login.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, base, json } from './lib.js';

export const options = {
  ...base,
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
};

export default function () {
  const res = http.post(
    `${API}/auth/email/verify`,
    JSON.stringify({ email: 'test-user@unifesto.app', otp: '098765' }),
    json,
  );
  check(res, { 'signed in': (r) => r.status === 200 && !!r.json('accessToken') });
  sleep(1);
}
