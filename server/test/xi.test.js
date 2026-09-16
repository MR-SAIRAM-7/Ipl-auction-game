import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ack, connect, createRoom, startServer, stopServer, wait } from './helpers.js';

/**
 * The half of the game that happens after the hammer falls: naming a side, having the
 * server refuse an illegal one, and being judged on the XI you picked rather than
 * everything you happened to buy.
 */

let server;
const sockets = [];

before(async () => {
  server = await startServer();
});

after(() => {
  sockets.forEach((s) => s.close());
  stopServer(server);
});

const open = async () => {
  const s = await connect();
  sockets.push(s);
  return s;
};

const state = async (socket) => (await ack(socket, 'room:state')).room;

/**
 * Runs an auction to the point where one franchise owns a squad, then ends it.
 * Buying is done by bidding and having the rival pass, which brings the hammer down
 * in a few seconds rather than waiting out a full lot.
 */
async function auctionWithSquads(format = 'ipl', want = 12) {
  const { code } = await createRoom('Sairam');
  const host = await open();
  const rival = await open();

  const mine = (await ack(host, 'room:join', {
    code, playerId: 'Sairam', name: 'Sairam', teamName: 'Hyderabad', intent: 'new',
  })).teamId;
  await ack(rival, 'room:join', { code, playerId: 'Saiteja', name: 'Saiteja', teamName: 'Chennai', intent: 'new' });
  await ack(host, 'room:settings', {
    format, purse: 5_000_000, squadSize: 15, minSquad: 11, bidTimerSec: 60, poolSize: 30,
  });

  let selecting = null;
  host.on('auction:selecting', (p) => { selecting = p; });
  let finished = null;
  host.on('auction:finished', (p) => { finished = p; });

  // Counting closes rather than sleeping between them: the hammer falls a few seconds
  // after the last rival passes, and waiting a fixed 7s for each of a dozen lots made
  // this file take minutes on its own.
  let closes = 0;
  host.on('auction:closed', () => { closes += 1; });
  const nextClose = async (from, timeoutMs = 20_000) => {
    const until = Date.now() + timeoutMs;
    while (closes === from && Date.now() < until) await wait(150);
    return closes > from;
  };

  await ack(host, 'auction:start');

  // Take lots until the squad is deep enough to field a side. Bounded by the clock
  // rather than an iteration count: most passes round this loop are spent waiting out
  // the few seconds between lots, and counting those as attempts gave up far too early.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const room = await state(host);
    if (room.status !== 'auction') break;
    const team = room.teams.find((t) => t.id === mine);
    if ((team?.squad?.length ?? 0) >= want) break;
    if (!room.lot || room.lot.status !== 'live') { await wait(200); continue; }
    const before = closes;
    const bid = await ack(host, 'auction:bid', {});
    if (bid.ok) await ack(rival, 'auction:pass');
    await nextClose(before);
  }

  return { code, host, rival, mine, closes: () => closes, nextClose, selecting: () => selecting, finished: () => finished };
}

describe('naming a playing XI', () => {
  test('a selection window opens, and the server refuses a side that breaks the format', async () => {
    const { host, mine, selecting } = await auctionWithSquads('ipl', 11);

    const before = await state(host);
    const bought = before.teams.find((t) => t.id === mine).squad;
    assert.ok(bought.length >= 11, `needed a squad to pick from, got ${bought.length}`);

    await ack(host, 'auction:finish');
    for (let i = 0; i < 40 && !selecting(); i += 1) await wait(250);
    assert.ok(selecting(), 'no selection window opened');

    const room = await state(host);
    assert.equal(room.status, 'selecting');
    assert.ok(room.selectionEndsAt > Date.now(), 'selection window has no deadline');

    const squad = room.teams.find((t) => t.id === mine).squad;
    const ids = squad.map((p) => p.id);

    const short = await ack(host, 'auction:xi', { xiIds: ids.slice(0, 5), captainId: ids[0], keeperId: ids[0] });
    assert.ok(short.error, 'a five-man XI was accepted');

    const noCaptain = await ack(host, 'auction:xi', { xiIds: ids.slice(0, 11), captainId: null, keeperId: null });
    assert.ok(noCaptain.error, 'an XI with no captain was accepted');

    const outsider = await ack(host, 'auction:xi', {
      xiIds: [...ids.slice(0, 10), 'not-a-real-player'],
      captainId: ids[0],
      keeperId: squad.find((p) => p.role === 'Wicket-keeper')?.id,
    });
    assert.ok(outsider.error, 'a player from outside the squad was accepted');
  });

  test('the verdict judges the XI, and picks one for anybody who never submitted', async () => {
    const { host, rival, mine, closes, nextClose, selecting, finished } = await auctionWithSquads('ipl', 11);

    // Give the rival a squad too, so both sides are judged on something.
    const rivalDeadline = Date.now() + 70_000;
    while (Date.now() < rivalDeadline) {
      const room = await state(host);
      if (room.status !== 'auction') break;
      const them = room.teams.find((t) => t.id !== mine);
      if ((them?.squad?.length ?? 0) >= 5) break;
      if (!room.lot || room.lot.status !== 'live') { await wait(200); continue; }
      const before = closes();
      const bid = await ack(rival, 'auction:bid', {});
      if (bid.ok) await ack(host, 'auction:pass');
      await nextClose(before);
    }

    await ack(host, 'auction:finish');
    for (let i = 0; i < 40 && !selecting(); i += 1) await wait(250);

    const room = await state(host);
    if (room.status === 'selecting') {
      const squad = room.teams.find((t) => t.id === mine).squad;
      const keeper = squad.find((p) => p.role === 'Wicket-keeper');
      const bowlers = squad.filter((p) => p.role === 'Bowler' || p.role === 'All-rounder');
      const rest = squad.filter((p) => p !== keeper && !bowlers.includes(p));
      const xi = [keeper, ...bowlers.slice(0, 5), ...rest].filter(Boolean).slice(0, 11);
      // Only assert on the outcome if a legal side was actually available.
      await ack(host, 'auction:xi', {
        xiIds: xi.map((p) => p.id),
        captainId: xi[0]?.id,
        keeperId: keeper?.id,
        impactId: squad.find((p) => !xi.includes(p))?.id,
      });
    }

    for (let i = 0; i < 200 && !finished(); i += 1) await wait(1000);
    const result = finished()?.result;
    assert.ok(result, 'no verdict arrived');
    assert.ok(Array.isArray(result.rankings) && result.rankings.length, 'verdict had no rankings');

    // Every side is judged on an XI, whether it named one or not.
    for (const rank of result.rankings) {
      assert.ok(rank.xi, `${rank.teamName} was judged without an XI`);
      if (!rank.xi.players.length) continue; // a team that bought nobody has no side
      assert.ok(rank.xi.captain, `${rank.teamName} had no captain`);
      for (const p of rank.xi.players) {
        assert.equal(typeof p.legacy, 'number', 'a player reached the verdict with no pedigree score');
        assert.equal(typeof p.formatFit, 'number', 'a player reached the verdict with no format fit');
      }
    }
    assert.ok(result.metricKeys?.length, 'verdict carried no metric keys');
  });
});

describe('formats', () => {
  test('each format brings its own metrics, squad size and XI rules', async () => {
    const seen = {};
    for (const format of ['ipl', 'odi', 'test']) {
      const { code } = await createRoom(`host-${format}`);
      const sock = await open();
      await ack(sock, 'room:join', { code, playerId: `p-${format}`, name: 'H', teamName: 'T', intent: 'new' });
      const res = await ack(sock, 'room:settings', { format });
      assert.equal(res.settings.format, format, `${format} did not stick`);
      seen[format] = res.settings;
    }
    // A Test squad is deeper than a T20 one, which is the whole point of the setting.
    assert.ok(seen.test.squadSize >= seen.ipl.squadSize, 'a Test squad should not be smaller than a T20 one');

    const cfg = await fetch(`${(await import('./helpers.js')).BASE}/api/config`).then((r) => r.json());
    assert.equal(cfg.formats.length, 3, 'config did not advertise all three formats');
    const ipl = cfg.formats.find((f) => f.id === 'ipl');
    assert.equal(ipl.impactPlayer, true, 'the IPL should have an impact player');
    assert.equal(ipl.maxOverseasInXI, 4, 'the IPL should cap overseas players at four');
    assert.equal(cfg.formats.find((f) => f.id === 'test').impactPlayer, false, 'a Test has no impact player');
  });
});
