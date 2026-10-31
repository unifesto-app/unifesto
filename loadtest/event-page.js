// Peak 1: an event goes viral and people open its page. Anonymous.
//   STAGING_IP=… EVENT_SLUG=… [INTERNAL_KEY=…] k6 run event-page.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, WEB, base, json } from './lib.js';

const SLUG = __ENV.EVENT_SLUG;

export const options = {
  ...base,
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 300 },
    { duration: '1m', target: 0 },
  ],
};

export default function () {
  // The page's own server render (it calls GET /events/:slug and /config/plan-fees).
  check(http.get(`${WEB}/event/${SLUG}`), { 'page 200': (r) => r.status === 200 });
  // The same event straight from the API, as the app fetches it.
  check(http.get(`${API}/events/${SLUG}`, json), { 'api 200': (r) => r.status === 200 });
  sleep(1);
}
