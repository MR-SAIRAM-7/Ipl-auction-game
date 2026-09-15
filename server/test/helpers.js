import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, '../src/index.js');

export const PORT = Number(process.env.TEST_PORT) || 5099;
export const BASE = `http://127.0.0.1:${PORT}`;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Boots the real server as a child process and waits for it to answer. Black box on
 * purpose: these tests exercise the same HTTP and socket surface a browser uses.
 */
export async function startServer() {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      // Keep tests hermetic: no Mongo, no Gemini, no inherited origins.
      MONGODB_URI: '',
      GEMINI_API_KEY: '',
      CLIENT_ORIGIN: BASE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${logs.join('')}`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return { child, logs };
    } catch {
      /* not listening yet */
    }
    await wait(250);
  }
  child.kill();
  throw new Error(`server did not start in time:\n${logs.join('')}`);
}

export function stopServer(server) {
  if (server?.child && server.child.exitCode === null) server.child.kill();
}

export const connect = () =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket did not connect')), 10_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

/** Promise wrapper around an ack'd emit. */
export const ack = (socket, event, payload = {}, timeoutMs = 10_000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res || {});
    });
  });

export async function createRoom(hostId = 'host') {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostId }),
  });
  if (!res.ok) throw new Error(`create room failed: ${res.status}`);
  return res.json();
}

/** Collects named events off a socket so a test can assert on what arrived. */
export function recorder(socket, events) {
  const seen = [];
  events.forEach((name) => socket.on(name, (payload) => seen.push({ name, payload })));
  return {
    seen,
    mark: () => seen.length,
    async from(index, name, timeoutMs = 25_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const hit = seen.slice(index).find((e) => e.name === name);
        if (hit) return hit.payload;
        await wait(60);
      }
      return null;
    },
  };
}
