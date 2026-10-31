// Peak 4: the gates open and scanners check people in. Run after checkout.js
// on the same event, so there are tickets to scan. The scanner token comes from
// loadtest-seed --scanner=<a curator or crew of that event>.
//   STAGING_IP=… EVENT_ID=… [CHECKIN_TYPE_ID=…] [INTERNAL_KEY=…] k6 run checkin.js
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { API, base, auth, loadTokens } from './lib.js';

const scanner = loadTokens().scanner;

export const options = {
  ...base,
  scenarios: {
    gates: { executor: 'shared-iterations', vus: 10, iterations: Number(__ENV.SCANS || 500), maxDuration: '10m' },
  },
};

/** Every qrCode string anywhere in the roster response, whatever its shape. */
function qrCodes(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => qrCodes(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'qrCode' && typeof v === 'string') out.push(v);
      else qrCodes(v, out);
    }
  }
  return out;
}

export function setup() {
  if (!scanner) throw new Error('tokens.json has no scanner: rerun loadtest-seed with --scanner=<user id>');
  const roster = http.get(`${API}/checkin/event/${__ENV.EVENT_ID}/roster`, auth(scanner));
  const codes = qrCodes(roster.json());
  let type = __ENV.CHECKIN_TYPE_ID;
  if (!type) {
    const types = http.get(`${API}/checkin/event/${__ENV.EVENT_ID}/types`, auth(scanner)).json();
    type = (Array.isArray(types) ? types : types.data ?? [])[0]?.id;
  }
  if (!codes.length || !type) throw new Error(`roster gave ${codes.length} QR codes, check-in point ${type}`);
  return { codes, type };
}

export default function ({ codes, type }) {
  const qrCode = codes[exec.scenario.iterationInTest % codes.length];
  const res = http.post(`${API}/checkin/scan`, JSON.stringify({ qrCode, checkinTypeId: type }), auth(scanner));
  // A repeat scan of the same code is a valid "already checked in" answer.
  check(res, { scanned: (r) => r.status < 500 });
}
