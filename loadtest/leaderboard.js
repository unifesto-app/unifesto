// Peak 5: a live quiz or hackathon with everyone watching the leaderboard.
// Each VU holds a Socket.IO connection to /leaderboard (raw Engine.IO v4 frames;
// k6 has no Socket.IO client) and polls the quiz list it would refetch on a
// change ping.
//   STAGING_IP=… EVENT_ID=… [INTERNAL_KEY=…] k6 run leaderboard.js
// Watch for subscribe errors: the HTTP throttler may also apply to socket
// messages, in one shared bucket.
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { API, base, auth, loadTokens } from './lib.js';

const users = new SharedArray('users', () => loadTokens().users);
const EVENT = __ENV.EVENT_ID;

export const options = {
  ...base,
  stages: [
    { duration: '1m', target: 100 },
    { duration: '3m', target: 500 },
    { duration: '1m', target: 0 },
  ],
};

export default function () {
  const token = users[exec.vu.idInTest % users.length].token;
  const url = `${API.replace('https', 'wss')}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, {}, (socket) => {
    socket.on('message', (m) => {
      if (m.startsWith('0')) socket.send(`40/leaderboard,${JSON.stringify({ token })}`);
      else if (m.startsWith('40/leaderboard')) {
        socket.send(`42/leaderboard,${JSON.stringify(['engagement:subscribe', { eventId: EVENT }])}`);
      } else if (m === '2') socket.send('3'); // Engine.IO ping → pong
    });
    // What the app refetches when it gets an engagement:changed ping.
    socket.setInterval(() => {
      check(http.get(`${API}/events/${EVENT}/quizzes`, auth(token)), { 'quizzes 200': (r) => r.status === 200 });
    }, 5000);
    socket.setTimeout(() => socket.close(), 60000);
  });
  check(res, { 'socket opened': (r) => r && r.status === 101 });
  sleep(1);
}
