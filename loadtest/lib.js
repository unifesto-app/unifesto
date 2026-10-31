// Shared by every scenario. D5: load tests never touch production.
//
// The staging host serves the same hostnames as production (its Caddy routes by
// name), so every request goes to production's names but is pinned to
// STAGING_IP through k6's `hosts` map: nothing is ever resolved through public
// DNS (which leads to Cloudflare and production). The run refuses to start
// without STAGING_IP. Since J18 (#488) production's origin also refuses any TLS
// connection that doesn't come through Cloudflare, so a mistyped IP can't put
// load on it either.
export const STAGING_IP = __ENV.STAGING_IP || '';
export const API = 'https://api.unifesto.app';
export const WEB = 'https://www.unifesto.app';

if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(STAGING_IP)) {
  throw new Error('Set STAGING_IP=<staging server IPv4>. Load tests run only against a staging copy (D5, loadtest/README.md).');
}

/** Spread into every scenario's `options`. */
export const base = {
  hosts: { 'api.unifesto.app': STAGING_IP, 'www.unifesto.app': STAGING_IP, 'unifesto.app': STAGING_IP },
  // Staging serves the Cloudflare origin certificate, which only Cloudflare trusts.
  insecureSkipTLSVerify: true,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

// One load generator is one IP, so the per-IP limit (300/min per route) would
// cap the test long before the server does. INTERNAL_KEY = staging's
// INTERNAL_API_KEY makes the throttler skip these requests, as it does for the
// website's own server calls. Leave it unset to test the limits themselves.
const internal = __ENV.INTERNAL_KEY ? { 'x-internal-key': __ENV.INTERNAL_KEY } : {};

export const json = { headers: { 'Content-Type': 'application/json', ...internal } };

export const auth = (token) => ({
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...internal },
});

/** Tokens from backend/scripts/loadtest-seed.ts (tokens.json next to these scripts). */
export const loadTokens = () => JSON.parse(open('./tokens.json'));
