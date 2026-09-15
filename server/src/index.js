import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import { connectDB } from './config/db.js';
import apiRoutes, { turnConfigured } from './routes/rooms.js';
import { registerSockets } from './sockets/index.js';
import { sweepIdleRooms } from './services/roomStore.js';
import { geminiEnabled } from './services/gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

/**
 * LAN origins are what let friends join from their phones over wifi. That is the
 * whole point in development and a hole in production, where the app should only
 * answer the origins it was actually deployed on - so it is opt-in there.
 */
const allowLan = process.env.ALLOW_LAN_ORIGINS
  ? process.env.ALLOW_LAN_ORIGINS !== 'false'
  : !isProd;

/**
 * Hosts that publish the app's own public URL are trusted automatically, so a
 * one-click deploy works without anyone hand-editing CLIENT_ORIGIN first. Render
 * sets RENDER_EXTERNAL_URL; PUBLIC_URL is the generic escape hatch.
 */
const selfOrigins = [process.env.RENDER_EXTERNAL_URL, process.env.PUBLIC_URL]
  .filter(Boolean)
  .map((url) => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const origins = [
  ...new Set([
    ...(process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...selfOrigins,
  ]),
];

const LAN_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

const corsOptions = {
  origin(origin, cb) {
    // No Origin header means same-origin or a direct call (curl, health checks).
    if (!origin) return cb(null, true);
    if (origins.includes('*') || origins.includes(origin)) return cb(null, true);
    if (allowLan && LAN_ORIGIN.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
};

const app = express();
// Rate limiting keys off req.ip, which is only meaningful behind a proxy with this set.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), payment=()');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));
app.use('/api', apiRoutes);

// Anything unmatched under /api is a client error, not the SPA shell.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client when it exists, so `npm run build && npm start` is a single origin.
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClient = fs.existsSync(path.join(clientDist, 'index.html'));

if (hasClient) {
  app.use(
    express.static(clientDist, {
      // Vite fingerprints assets, so they can be cached hard; the shell never can.
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Last resort: never leak a stack trace to a client.
app.use((err, _req, res, _next) => {
  console.error('[http] unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOptions.origin, credentials: true, methods: ['GET', 'POST'] },
  pingTimeout: 25_000,
  maxHttpBufferSize: 1e6,
});

registerSockets(io);
setInterval(() => sweepIdleRooms(), 30 * 60 * 1000).unref();

await connectDB();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log(`  IPL Auction server listening on http://localhost:${PORT}`);
  console.log(`  Mode:    ${isProd ? 'production' : 'development'}`);
  console.log(`  Client:  ${hasClient ? 'serving built client from client/dist' : 'not built (run npm run build)'}`);
  console.log(`  Gemini:  ${geminiEnabled() ? 'enabled' : 'disabled (using local roster)'}`);
  console.log(`  Voice:   ${turnConfigured() ? 'STUN + TURN relay' : 'STUN only - will not connect on mobile data'}`);
  console.log(`  Origins: ${origins.join(', ')}${allowLan ? ' (+ LAN)' : ''}`);
  if (isProd && !hasClient) {
    console.warn('  WARNING: production start with no built client - run "npm run build" first.');
  }
  if (isProd && origins.includes('*')) {
    console.warn('  WARNING: CLIENT_ORIGIN is "*", which allows any site to call this API.');
  }
  if (isProd && !turnConfigured()) {
    console.warn('  NOTE: no TURN server set. Voice works on wifi but will fail between');
    console.warn('        people on mobile data (carrier NAT has no direct path).');
  }
  console.log('');
});

/* A crash mid-auction loses every in-memory room, so log loudly and stay up. */
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down...`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
