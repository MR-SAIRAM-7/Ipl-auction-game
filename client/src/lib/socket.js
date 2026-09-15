import { io } from 'socket.io-client';
import { API_BASE } from './api.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      autoConnect: true,
    });

    // Socket.IO retries a dropped transport on its own, but a disconnect the server
    // initiated is treated as final - without this the app sits offline for good.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') socket.connect();
    });
  }
  return socket;
}

/** Promise wrapper around socket.emit with an ack, with a timeout so the UI never hangs. */
export function emitAck(event, payload, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const s = getSocket();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ error: 'The server did not respond. Check your connection.' });
      }
    }, timeoutMs);
    s.emit(event, payload, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res || {});
    });
  });
}
