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
| **AI player pool** | Gemini generates a fresh set of fictional cricketers every auction — role, country, batting/bowling style, T20 stats, a scouting blurb and a base price — then the pool is shuffled so the order is different every time. |
| **Live auction** | Server-authoritative clock, a proper 1-3 minute spell on the block for every player, IPL-style bid slabs, pass-to-speed-up, an unsold round at half base price, and SOLD/UNSOLD stamps. |
| **Franchises, not just players** | A franchise can seat up to 8 people - an owner, a coach, whoever else you drag in. They share one purse, any of them can raise the paddle, and every bid is attributed to whoever made it. Pick a franchise on the join screen or start your own. |
| **50 lakh rules** | Every team starts with a ₹50,00,000 purse and **no single bid can exceed ₹50 lakh**. Teams must hold back enough to fill a minimum squad, so nobody can blow everything on one signing. |
| **Voice chat** | WebRTC mesh so everyone can talk while they bid, with live speaking indicators and mute. Your franchise gets a **private huddle** by default and you can switch to the **room channel** to sledge everyone else. The call runs for the whole room - lobby, auction and results - and rebuilds itself after a dropout instead of going quietly silent. |
| **AI verdict** | At the end Gemini scores every squad across nine metrics, ranks the teams, picks each team's best XI and names the best and worst buys of the auction. |
| **Mobile first** | A quiet, minimal light interface — one-tap bidding, a fixed bid bar, big readable numbers, safe-area support. Works great on desktop too. |

Everything degrades gracefully: **no Gemini key and no MongoDB are required to play.**
Without a key, players come from a built-in generator and the verdict uses a local balance
model. Without Mongo, rooms live in memory for the session.

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
| `ALLOW_LAN_ORIGINS` | on in dev, off in prod | Lets private LAN addresses (`192.168.*`, `10.*`, `172.16–31.*`) call the API, so phones on your wifi can join. |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops in front of the app, so rate limiting sees the real client IP. |
| `MAX_ROOMS` / `MAX_TEAMS_PER_ROOM` / `MAX_MEMBERS_PER_TEAM` | `500` / `12` / `8` | Capacity ceilings. |
| `MONGODB_URI` | – | If set, rooms, squads and results are persisted and survive a restart. If unset or unreachable, rooms stay in memory. |
| `GEMINI_API_KEY` | – | Enables AI player generation, the final verdict and auctioneer commentary. Get one free at <https://aistudio.google.com/apikey>. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any Gemini model id. |
| `GEMINI_COMMENTARY` | `true` | Set to `false` to skip the one-line auctioneer commentary after each sale. |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | – | Optional TURN server, needed for voice between friends behind strict NATs. |

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

---

## Running it for real

### Docker

```bash
docker compose up --build
```

That builds the client, installs production-only server dependencies and serves both
from one origin on port 5000, as a non-root user with a health check wired up. Pass
your keys through the environment (see `docker-compose.yml`), and set `CLIENT_ORIGIN`
to the public URL people will actually load.

### Anywhere else

Any host that runs Node 20+ and allows WebSockets works:

```bash
npm run install:all
npm run build
NODE_ENV=production CLIENT_ORIGIN=https://your-domain node server/src/index.js
```

Three things worth getting right:

- **WebSockets must pass through.** The auction is Socket.IO; a proxy that buffers or
  strips upgrades will leave everyone stuck on "Reconnecting".
- **Set `CLIENT_ORIGIN`** to the public origin. In production, LAN origins are refused
  unless you opt back in with `ALLOW_LAN_ORIGINS=true`.
- **Set `MONGODB_URI`** if you want rooms to survive a restart or a second instance.
  Without it rooms live in the process, so a deploy ends any auction in flight.

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
│     │  ├─ playerPool.js         Offline player generator
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

- Every generated player is **fictional**. The prompt explicitly forbids real cricketers' names.
- Refreshing mid-auction is safe — your browser keeps a stable player id, so you rejoin your own team and purse.
- If everyone closes the tab, the auction pauses and resumes when someone comes back.
