# 🏏 Auction Arena — IPL Auction with Friends

A live, multiplayer IPL-style player auction. Create a room, share a 5-letter code, and bid
against your friends in real time while talking to them over built-in voice chat. Gemini
invents a brand new pool of players for every auction and, at the end, judges who actually
built the best squad.

Built as a MERN app: **MongoDB + Express + React + Node**, with Socket.IO for the live
auction and WebRTC for voice.

---

## What it does

| | |
|---|---|
| **Real players** | The pool is made of real cricketers — Kohli, Bumrah, Russell, Rashid Khan, de Villiers and 110 others — with their actual role, country, batting hand and bowling style. Gemini picks a fresh list each auction when a key is set; without one, a built-in roster of 115 is used. |
| **Live auction** | Server-authoritative clock, a proper 1-3 minute spell on the block for every player, IPL-style bid slabs, pass-to-speed-up, an unsold round at half base price, and SOLD/UNSOLD stamps. |
| **Franchises, not just players** | A franchise can seat up to 8 people - an owner, a coach, whoever else you drag in. They share one purse, any of them can raise the paddle, and every bid is attributed to whoever made it. Pick a franchise on the join screen or start your own. |
| **50 lakh rules** | Every team starts with a ₹50,00,000 purse and **no single bid can exceed ₹50 lakh**. Teams must hold back enough to fill a minimum squad, so nobody can blow everything on one signing. |
| **Voice chat** | WebRTC mesh so everyone can talk while they bid, with live speaking indicators and mute. Your franchise gets a **private huddle** by default and you can switch to the **room channel** to sledge everyone else. The call runs for the whole room - lobby, auction and results - and rebuilds itself after a dropout instead of going quietly silent. |
| **AI verdict** | At the end Gemini scores every squad across nine metrics, ranks the teams, picks each team's best XI and names the best and worst buys of the auction. |
| **Mobile first** | A quiet, minimal light interface — one-tap bidding, a fixed bid bar, big readable numbers, safe-area support. Works great on desktop too. |

Everything degrades gracefully: **no Gemini key and no MongoDB are required to play.**
Without a key, players come from the built-in roster and the verdict uses a local balance
model. Without Mongo, rooms live in memory for the session.

> **On the player data.** Names, roles, countries, batting hands and bowling styles are
> real. The **statistics are indicative** — rounded, career-shaped T20 numbers meant to make
> a player feel right at the auction table, not official records. Ratings and base prices are
> editorial: a scaled-down economy that fits a ₹50 lakh purse, not real auction prices.
> The roster lives in [`server/src/data/realPlayers.js`](server/src/data/realPlayers.js) —
> edit it to add players, drop the retired legends, or tune anyone's rating.

---

## Quick start

```bash
npm run install:all
```

Then create `server/.env` (copy `server/.env.example`) and run:

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API + sockets: <http://localhost:5000>

To run it as a single production server instead:

```bash
npm run build && npm start
```

That serves the built React app from <http://localhost:5000>.

Run the integration tests at any time:

```bash
npm test
```

They boot the real server on a spare port and drive it over HTTP and sockets - join
semantics, the auction clock, shared-franchise bidding, voice channel isolation,
dropouts and late arrivals, host controls, and that no player id ever reaches another
client. Takes about four minutes, most of it waiting out real 60 second lot clocks.

`npm run test:game` plays one complete auction end to end - nine people across three
franchises, every lot, the unsold round, the verdict and a restart - checking that no
purse ever drifts out of step with its squad. It takes about five minutes, so it is
kept out of `npm test`. `npm run test:all` runs both.

---

## Configuration

All of `server/.env` is optional. The app boots and plays without any of it.

| Variable | Default | What it does |
|---|---|---|
| `NODE_ENV` | `development` | `production` tightens CORS, adds HSTS and expects a built client. |
| `PORT` | `5000` | API + socket port. |
| `HOST` | `0.0.0.0` | Interface to bind. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins. |
| `RENDER_EXTERNAL_URL` / `PUBLIC_URL` | – | The app's own public URL. Trusted automatically, so a one-click deploy needs no CORS setup. Render sets the first for you. |
| `VITE_API_URL` | – | **Client build-time.** Only needed when the client is hosted apart from the server (e.g. Vercel). Set it to the server's origin. |
| `ALLOW_LAN_ORIGINS` | on in dev, off in prod | Lets private LAN addresses (`192.168.*`, `10.*`, `172.16–31.*`) call the API, so phones on your wifi can join. |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops in front of the app, so rate limiting sees the real client IP. |
| `MAX_ROOMS` / `MAX_TEAMS_PER_ROOM` / `MAX_MEMBERS_PER_TEAM` | `500` / `12` / `8` | Capacity ceilings. |
| `MONGODB_URI` | – | If set, rooms, squads and results are persisted and survive a restart. If unset or unreachable, rooms stay in memory. |
| `GEMINI_API_KEY` | – | Enables AI player generation, the final verdict and auctioneer commentary. Get one free at <https://aistudio.google.com/apikey>. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any Gemini model id. |
| `GEMINI_COMMENTARY` | `true` | Set to `false` to skip the one-line auctioneer commentary after each sale. |
| `METERED_APP_NAME` / `METERED_API_KEY` | – | Metered Open Relay TURN. **Required for voice on mobile data.** Free monthly allowance and no credit card, so start here. Credentials are fetched by the server. |
| `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` | – | Cloudflare Realtime TURN instead — a far larger free allowance, but signup asks for a card. |
| `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL` | – | Any static relay instead (coturn, Metered, Xirsys), comma-separated URLs. All three needed. `TURN_URL` is still accepted for a single entry. |

---

## Playing with friends on their phones

1. Find your machine's LAN IP (`ipconfig` on Windows, `ifconfig` on macOS/Linux).
2. Start the app and have everyone open `http://<your-ip>:5173` (dev) or `http://<your-ip>:5000` (built).
3. One person creates a room and shares the 5-letter code — the others tap **Join room**.

**Voice chat needs a secure context.** Browsers only hand out a microphone over HTTPS or on
`localhost`, so on a plain `http://192.168.x.x` address the app will tell you voice is
unavailable. Bidding still works perfectly. To get voice on phones, put the app behind a
tunnel or any HTTPS origin, e.g.:

```bash
npx cloudflared tunnel --url http://localhost:5000
```

Then share the `https://…` URL that prints out. On the open internet you will also want a
TURN server for the handful of networks where peer-to-peer audio cannot connect.

### Channels

Each franchise has its own huddle and there is one room-wide channel. The mesh only ever spans
a single channel, so a huddle is genuinely private - it is not a client-side mute. Spectators
have no table, so they always land in the room channel.

### Voice on mobile data

This is the one part of the app that cannot be fixed in the client, so it is worth
being precise about.

WebRTC sends audio peer to peer. STUN only tells each peer its own public address —
enough when at least one side is behind a permissive NAT, which is the usual case on
home wifi. **Mobile carriers use CGNAT, which is symmetric**: the port one peer sees is
not the port anyone else can reach. Two phones on mobile data therefore have no direct
path at all, and no amount of retrying will find one.

The fix is a **TURN server**, which relays the audio. The quickest way to get one is
Metered Open Relay — a free monthly allowance and no credit card at signup:

```bash
METERED_APP_NAME=...
METERED_API_KEY=...
```

Cloudflare Realtime has a much larger free allowance if you can get past a card check:

```bash
TURN_KEY_ID=...
TURN_KEY_API_TOKEN=...
```

Both issue short-lived credentials, so the server fetches them and passes them to the
client through `/api/config`, caching them until shortly before they expire. Nothing
long-lived reaches the browser.

Or give it any static relay — self-hosted `coturn`, Xirsys, or credentials copied from
a provider's dashboard:

```bash
TURN_URLS=turn:host:3478?transport=udp,turn:host:3478?transport=tcp,turns:host:443?transport=tcp
TURN_USERNAME=...
TURN_CREDENTIAL=...
```

List all three transports. The `turns:` entry on 443 looks like ordinary HTTPS, which is
what gets through hotel, office and campus firewalls that block everything else.

Where to get one:

- **Metered Open Relay** — the one to start with. 20 GB/month free and **no credit
  card** at signup, which the others cannot say. Set `METERED_APP_NAME` and
  `METERED_API_KEY`.
- **Cloudflare Realtime** — 1,000 GB/month free, then $0.05/GB, and
  `turn.cloudflare.com` serves udp 3478, tcp 3478/80 and TLS on 443, exactly the spread
  you want. Signup asks for a card. Set `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`.
- **Twilio / Xirsys** — hosted TURN, metered per GB, smaller free tiers.
- **Self-host `coturn`** on any VPS — cheapest at volume, but every provider worth
  using wants a card, so it is not the free option it looks like.

The server prints which mode it is in at boot (`Voice: STUN only` vs `STUN + TURN
relay`), and warns in production when TURN is missing. In the app, a peer that cannot be
reached is reported in the voice dock rather than silently failing, and people connected
through the relay get a marker on their avatar.

**Bidding, chat and the auction itself never need TURN** — they run over the server
socket, which is plain HTTPS. Only the peer-to-peer audio is affected.

### How the call holds up

- **Reconnects.** A dropout hands the browser a new socket id, which orphans every peer
  connection. The client notices, tears the mesh down and rebuilds it, rather than leaving
  you looking connected but silent.
- **Network blips.** A connection that drops to `failed` gets an ICE restart instead of
  being torn down for good.
- **Simultaneous joins.** Two people tapping the mic at the same moment used to be able to
  deadlock each other; perfect negotiation settles who backs down.
- **Autoplay.** If the browser blocks remote audio, the dock offers an **Enable sound**
  button instead of silently playing nothing.
- **Bandwidth.** Opus is capped at 24 kbps, 16 kbps when relayed, with DTX on, so a free
  TURN allowance stretches a long way. Speech at these rates is indistinguishable over a
  phone speaker.
- **Switching networks.** Moving between wifi and mobile data invalidates every gathered
  candidate. The app watches `online` and connection-change events and restarts ICE, so
  the call recovers instead of staying up but silent.
- **Phone locked or tab hidden.** Mobile browsers suspend audio; the app resumes it and
  re-checks its peers when the tab comes back.
- **Unreachable peers.** A connection that never completes is retried twice with an ICE
  restart, then reported plainly — naming TURN as the likely cause when none is set.

---

## Running it for real

### Running it entirely on free tiers

Every piece of this has a free option, and the app is built to degrade rather than
break when one is missing:

| Piece | Free option | Without it |
|---|---|---|
| Hosting | Render free web service | – |
| Database | MongoDB Atlas free tier (M0) | Rooms live in memory and end when the instance sleeps |
| Player pool | Built-in roster of 115 real cricketers | *(the roster **is** the free option — a Gemini key just varies the list)* |
| AI verdict | Built-in balance model | *(same — the local model always works)* |
| Voice relay | Metered Open Relay (20 GB/mo, no card) or Cloudflare Realtime (1,000 GB/mo) | Voice works on wifi, not on mobile data |

Only voice has a hard cost, because a relay carries real bandwidth. To keep it inside a
free allowance the app caps Opus at **24 kbps**, drops to **16 kbps** on relayed
connections, and turns on DTX so silence costs almost nothing. Measured on the wire that
is about **11 MB per person-hour** for a constantly-talking stream, and much less in a
real conversation where people take turns.

Metered Open Relay's 20 GB/month is the one to reach for first, because it is the only
option here that does not ask for a credit card - at the rates above that is a couple of
hundred hours of relayed auction. Cloudflare Realtime's 1,000 GB/month is far larger if
a card is not an obstacle. Free tiers move, so check current terms rather than trusting
a number written here.

### Render (recommended — one click, everything on one origin)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/MR-SAIRAM-7/Ipl-auction-game)

`render.yaml` is a Blueprint: point Render at this repo, and it builds the client,
installs the server and serves both from one origin. `autoDeploy` is on, so every push
to `main` ships.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`, and the server trusts its own public
URL automatically — **CORS needs no hand-editing for this setup**. Everything else is
optional: set `GEMINI_API_KEY` for an AI-picked pool and `MONGODB_URI` so rooms survive
the free plan going to sleep.

On the free plan the instance sleeps when idle and cold-starts in about a minute. An
auction in progress keeps it awake on its own, because the sockets ping every 25s.

### Vercel (client only — it cannot host the server)

Vercel runs serverless functions, with **no WebSocket server and no process that lives
between requests**. This app's auction clock and rooms live in server memory, so the
server cannot go there. The React client can:

1. Import the repo into Vercel. `vercel.json` already sets the build and the SPA
   rewrites, so there is nothing to configure.
2. Deploy the **server** to Render (above) or any Node host.
3. Set `VITE_API_URL` in Vercel to that server's origin, e.g.
   `https://your-app.onrender.com`. It is read at build time, so redeploy after adding it.
4. Set `CLIENT_ORIGIN` on the server to your Vercel URL, so it accepts the browser.

Skip all of this unless you specifically want the client on Vercel's CDN — the Render
deploy already serves it.

### Docker

```bash
docker compose up --build
```

Builds the client, installs production-only server dependencies and serves both from one
origin on port 5000, as a non-root user with a health check wired up.

### Anywhere else

Any host that runs Node 20+ and allows WebSockets:

```bash
npm run install:all
npm run build
NODE_ENV=production CLIENT_ORIGIN=https://your-domain node server/src/index.js
```

Three things worth getting right:

- **WebSockets must pass through.** A proxy that buffers or strips upgrades leaves
  everyone stuck on "Reconnecting".
- **Set `CLIENT_ORIGIN`** to the public origin, unless the host publishes
  `RENDER_EXTERNAL_URL` or you set `PUBLIC_URL`. In production, LAN origins are refused
  unless you opt back in with `ALLOW_LAN_ORIGINS=true`.
- **Set `MONGODB_URI`** if you want rooms to survive a restart.

### Continuous integration

`.github/workflows/ci.yml` builds the client and runs the integration suite on every
push and pull request to `main`, so a broken auction engine fails before it deploys. The
five-minute full-game test is left out of CI; run it locally with `npm run test:game`.

### What is protected

- Player ids are the only credential a seat has, so they never leave the server -
  clients see an opaque member id instead, and cannot impersonate each other.
- Bids, chat, joins and voice signalling are rate limited per socket; room creation is
  rate limited per IP; rooms, franchises and seats are all capped.
- `nosniff`, `SAMEORIGIN`, a restrictive `Permissions-Policy` and (in production) HSTS
  are set on every response, and stack traces are never returned to a client.

### One process only

Rooms and the auction clock live in memory, so **this runs as a single instance**.
Two replicas would each hold their own rooms and clocks. Scaling out would need a
Socket.IO adapter (Redis) and moving the clock into shared state - worth knowing
before you put it behind an autoscaler.

---

## Auction rules

- **Purse:** ₹50 lakh per team (host can lower it to 20/30/40 lakh in the lobby).
- **Bid cap:** ₹50 lakh on any single player, always enforced server-side.
- **Base prices:** ₹20,000 – ₹5,00,000, so a full squad genuinely fits inside the purse.
- **Bid slabs:** +₹10K under ₹1L, +₹25K under ₹5L, +₹50K under ₹10L, +₹1L under ₹25L, then +₹2.5L.
- **Reserve rule:** a team can never bid so much that it could no longer reach the minimum squad size.
- **Timer:** every player gets a real spell on the block. 1 min 30s per lot by default; the host can pick 1, 1:30, 2 or 3 minutes, and the server refuses anything under a minute.
- **Anti-snipe:** any bid tops the clock back up to at least 20 seconds, so a last-second bid never steals a lot.
- **Pass:** speeds a lot up — once every other team has passed, the clock drops to a 6 second "going, going" window instead of burning the rest of the minute. You can still jump back in during it, and doing so resets the clock properly.
- **Unsold round:** anything nobody wanted comes back once at half its base price.
- **Squads:** up to 15 players, minimum 11 for a complete side (both configurable).
- **Pool size matters.** Every franchise needs `minSquad` players from one shared pool, so
  a room of four teams needs at least 44 players in it - more than the default 40. The lobby
  does the arithmetic for you and warns the host when the pool is too small, because
  otherwise some teams simply finish short.
- **The reserve rule holds back the minimum base price** (₹20,000) per unfilled slot, not the
  going rate. A team that spends hard early can still end up unable to afford anyone real -
  that is the gamble, not a bug.
- **Sharing a franchise:** everyone at a table shares one purse and one squad. Any of them can
  bid, but they cannot outbid each other - once your franchise holds the top bid, the rest of
  the table is locked out until someone else raises. Only the owner can rename or recolour it.
- **Joining late:** a new franchise cannot appear once the auction has started (it would get a
  free purse), but a team-mate can take a seat at an existing table at any time.

---

## Project layout

```
ipl-auction/
├─ server/
│  └─ src/
│     ├─ index.js                 Express + Socket.IO bootstrap, serves the built client
│     ├─ config/db.js             Optional Mongo connection
│     ├─ models/Room.js           Mongoose schema for room snapshots
│     ├─ routes/rooms.js          REST: health, config, create/inspect a room
│     ├─ sockets/index.js         Join, bids, chat, host controls, WebRTC signalling
│     ├─ services/
│     │  ├─ auctionEngine.js      Authoritative clock, bid rules, lots, purses
│     │  ├─ gemini.js             Player pool, final verdict, commentary (+ fallbacks)
│     │  ├─ playerPool.js         Builds a pool from the real-player roster
│     ├─ data/realPlayers.js     115 real cricketers, the offline pool
│     │  └─ roomStore.js          In-memory rooms mirrored to MongoDB
│     └─ utils/money.js           Rupee formatting, bid slabs, the 50 lakh cap
└─ client/
   └─ src/
      ├─ context/GameProvider.jsx Socket wiring + all client game state
      ├─ context/VoiceProvider.jsx One voice session per room, held above the screens
      ├─ hooks/useVoice.js        WebRTC mesh, mic control, speaking levels
      ├─ hooks/useCountdown.js    Renders the server's clock
      ├─ pages/                   Home, Room
      ├─ components/              Lobby, AuctionFloor, PlayerLot, BidBar, VoiceDock, Results…
      ├─ components/Icon.jsx      The stroke-icon set the UI draws from
      ├─ components/FranchisePicker.jsx  Join an existing franchise, or start one
      └─ styles.css               Minimal light design system (single theme, no dark mode)
```

### Why the server owns the clock

Bids, timers and purses are computed only on the server and broadcast to clients. The client
never decides what a bid costs or when a lot closes, so a modified browser cannot invent
money or extend a timer. The UI mirrors the reserve rule purely to grey out buttons early.

---

## Notes

- Players are **real cricketers**; their stats are approximations, not official records. See
  the note near the top and the roster file if you want to change who turns up.
- Refreshing mid-auction is safe — your browser keeps a stable player id, so you rejoin your own team and purse.
- If everyone closes the tab, the auction pauses and resumes when someone comes back.
