import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ack, connect, createRoom, recorder, startServer, stopServer, wait } from './helpers.js';

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

const AUCTION_EVENTS = ['auction:lot', 'auction:bid', 'auction:clock', 'auction:closed', 'auction:finished'];

/** Room with two franchises, a short pool and the shortest legal clock. */
async function startAuction({ lotSeconds = 60, poolSize = 20 } = {}) {
  const { code } = await createRoom('host');
  const host = await open();
  const rival = await open();

  const a = await ack(host, 'room:join', { code, playerId: 'host', name: 'Ava', teamName: 'Mumbai', intent: 'new' });
  const b = await ack(rival, 'room:join', { code, playerId: 'rival', name: 'Cee', teamName: 'Delhi', intent: 'new' });

  await ack(host, 'room:settings', {
    purse: 5_000_000, squadSize: 15, minSquad: 11, bidTimerSec: lotSeconds, poolSize,
  });

  const rec = recorder(host, AUCTION_EVENTS);
  const mark = rec.mark();
  await ack(host, 'auction:start');
  const lot = await rec.from(mark, 'auction:lot', 30_000);
  assert.ok(lot, 'no lot opened');

  return { code, host, rival, hostTeam: a.teamId, rivalTeam: b.teamId, rec, lot };
}

describe('the auction clock', () => {
  test('a lot runs for the full configured window', async () => {
    const { lot } = await startAuction({ lotSeconds: 60 });
    assert.equal(lot.windowMs, 60_000);
    assert.ok(lot.endsAt - Date.now() > 55_000);
  });

  test('the clock cannot be set below a minute or above three', async () => {
    const { code } = await createRoom('host');
    const host = await open();
    await ack(host, 'room:join', { code, playerId: 'host', name: 'Ava', intent: 'new' });

    const tooShort = await ack(host, 'room:settings', { bidTimerSec: 5 });
    assert.equal(tooShort.settings.bidTimerSec, 60);

    const tooLong = await ack(host, 'room:settings', { bidTimerSec: 9999 });
    assert.equal(tooLong.settings.bidTimerSec, 180);
  });

  test('a late bid tops the clock back up instead of sniping the lot', async () => {
    const { rival, rec, lot } = await startAuction({ lotSeconds: 60 });

    // Let it run down well past the 20s anti-snipe floor.
    await wait(Math.max(0, lot.endsAt - Date.now() - 6000));
    const before = lot.endsAt - Date.now();
    assert.ok(before < 10_000, `expected the clock to be nearly out, had ${before}ms`);

    const mark = rec.mark();
    assert.ok((await ack(rival, 'auction:bid', { amount: lot.nextBid })).ok);
    const bid = await rec.from(mark, 'auction:bid', 6000);

    assert.equal(bid.windowMs, 20_000);
    assert.ok(bid.endsAt - Date.now() > 17_000);
  });

  test('once everyone passes the hammer comes down early', async () => {
    const { host, rival, rec, lot } = await startAuction({ lotSeconds: 60 });

    const mark = rec.mark();
    await ack(rival, 'auction:bid', { amount: lot.nextBid });
    await ack(host, 'auction:pass');

    const clock = await rec.from(mark, 'auction:clock', 8000);
    assert.ok(clock, 'passes did not shorten the clock');
    assert.equal(clock.reason, 'passes');
    assert.ok(clock.endsAt - Date.now() <= 6500);

    const closed = await rec.from(mark, 'auction:closed', 15_000);
    assert.equal(closed.sale.status, 'sold');
  });
});

describe('bidding for a shared franchise', () => {
  test('any member can bid, and the bid is attributed to them', async () => {
    const { code } = await createRoom('owner');
    const owner = await open();
    const coach = await open();
    const rival = await open();

    const team = (await ack(owner, 'room:join', {
      code, playerId: 'owner', name: 'Ava', teamName: 'Mumbai', intent: 'new',
    })).teamId;
    await ack(coach, 'room:join', { code, playerId: 'coach', name: 'Ben', joinTeamId: team, intent: 'join' });
    await ack(rival, 'room:join', { code, playerId: 'rival', name: 'Cee', teamName: 'Delhi', intent: 'new' });

    await ack(owner, 'room:settings', {
      purse: 5_000_000, squadSize: 15, minSquad: 11, bidTimerSec: 60, poolSize: 20,
    });

    const rec = recorder(owner, AUCTION_EVENTS);
    let mark = rec.mark();
    await ack(owner, 'auction:start');
    const lot = await rec.from(mark, 'auction:lot', 30_000);

    mark = rec.mark();
    assert.ok((await ack(coach, 'auction:bid', { amount: lot.nextBid })).ok);
    const bid = await rec.from(mark, 'auction:bid', 6000);
    assert.equal(bid.byName, 'Ben');
    assert.equal(bid.teamId, team);

    // Team-mates must not bid against each other.
    const selfRaise = await ack(owner, 'auction:bid', { amount: bid.nextBid });
    assert.ok(selfRaise.error);

    mark = rec.mark();
    await ack(owner, 'auction:skip');
    const closed = await rec.from(mark, 'auction:closed', 15_000);
    assert.equal(closed.sale.teamId, team);
    assert.equal(
      closed.teams.find((t) => t.id === team).purse,
      5_000_000 - closed.sale.price,
      'the shared purse should be debited exactly once',
    );
  });
});

describe('voice channels', () => {
  test('a franchise huddle is isolated from the room channel', async () => {
    const { code } = await createRoom('owner');
    const ava = await open();
    const ben = await open();
    const cee = await open();

    const mumbai = (await ack(ava, 'room:join', {
      code, playerId: 'ava', name: 'Ava', teamName: 'Mumbai', intent: 'new',
    })).teamId;
    await ack(ben, 'room:join', { code, playerId: 'ben', name: 'Ben', joinTeamId: mumbai, intent: 'join' });
    await ack(cee, 'room:join', { code, playerId: 'cee', name: 'Cee', teamName: 'Delhi', intent: 'new' });

    await ack(ava, 'voice:join', { channel: 'team' });
    const benVoice = await ack(ben, 'voice:join', { channel: 'team' });
    const ceeVoice = await ack(cee, 'voice:join', { channel: 'team' });

    assert.deepEqual(benVoice.peers.map((p) => p.name), ['Ava']);
    assert.deepEqual(ceeVoice.peers, [], 'Delhi should not hear the Mumbai huddle');

    // Stepping out to the room channel drops the huddle and meets the other franchise.
    const moved = await ack(ava, 'voice:channel', { channel: 'room' });
    assert.equal(moved.channel, 'room');
    assert.deepEqual(moved.peers, []);

    const ceeMoved = await ack(cee, 'voice:channel', { channel: 'room' });
    assert.deepEqual(ceeMoved.peers.map((p) => p.name), ['Ava']);

    const back = await ack(ava, 'voice:channel', { channel: 'team' });
    assert.deepEqual(back.peers.map((p) => p.name), ['Ben']);
  });

  test('the voice roster carries no player ids', async () => {
    const { code } = await createRoom('owner');
    const socket = await open();
    await ack(socket, 'room:join', { code, playerId: 'very-secret', name: 'Ava', intent: 'new' });

    const roster = await new Promise((resolve) => {
      socket.once('voice:roster', resolve);
      socket.emit('voice:join', { channel: 'team' });
    });
    const blob = JSON.stringify(roster);
    assert.ok(!blob.includes('very-secret'));
    assert.ok(!blob.includes('playerId'));
  });
});
