import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ack, connect, createRoom, startServer, stopServer } from './helpers.js';

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

describe('joining a room', () => {
  test('an explicit request for a new franchise beats a seat we already hold', async () => {
    const { code } = await createRoom('alice');
    const alice = await open();

    const first = await ack(alice, 'room:join', {
      code, playerId: 'alice', name: 'Alice', teamName: "Alice's XI", intent: 'new',
    });
    assert.ok(first.ok, first.error);

    // Same browser, invite link, "start a new franchise". This used to silently drop
    // you back into the existing table and rename whoever was sitting there.
    const second = await ack(alice, 'room:join', {
      code, playerId: 'alice', name: 'Bob', teamName: 'Bravo XI', intent: 'new',
    });
    assert.equal(second.code, 'ALREADY_SEATED');

    // The client answers that by becoming a separate person for this tab.
    const forked = await ack(alice, 'room:join', {
      code, playerId: 'alice-tab2', name: 'Bob', teamName: 'Bravo XI', intent: 'new',
    });
    assert.ok(forked.ok, forked.error);
    assert.notEqual(forked.teamId, first.teamId);

    const teams = forked.room.teams;
    assert.equal(teams.length, 2);
    assert.deepEqual(
      teams.map((t) => t.members.map((m) => m.name)).flat().sort(),
      ['Alice', 'Bob'],
    );
  });

  test('a reconnect returns to the original seat', async () => {
    const { code } = await createRoom('carol');
    const carol = await open();
    const first = await ack(carol, 'room:join', { code, playerId: 'carol', name: 'Carol', intent: 'new' });
    const again = await ack(carol, 'room:join', { code, playerId: 'carol', name: 'Carol', intent: 'auto' });
    assert.equal(again.teamId, first.teamId);
  });

  test('several people can share one franchise and its purse', async () => {
    const { code } = await createRoom('owner');
    const owner = await open();
    const coach = await open();

    const made = await ack(owner, 'room:join', {
      code, playerId: 'owner', name: 'Ava', teamName: 'Mumbai', intent: 'new',
    });
    const joined = await ack(coach, 'room:join', {
      code, playerId: 'coach', name: 'Ben', joinTeamId: made.teamId, intent: 'join',
    });

    assert.equal(joined.teamId, made.teamId);
    assert.equal(joined.isOwner, false);

    const team = joined.room.teams.find((t) => t.id === made.teamId);
    assert.equal(joined.room.teams.length, 1);
    assert.equal(team.members.length, 2);
    assert.equal(team.purse, joined.room.settings.purse);
  });

  test('you cannot hop to another table while seated', async () => {
    const { code } = await createRoom('a');
    const one = await open();
    const two = await open();
    const teamA = (await ack(one, 'room:join', { code, playerId: 'a', name: 'A', intent: 'new' })).teamId;
    const teamB = (await ack(two, 'room:join', { code, playerId: 'b', name: 'B', intent: 'new' })).teamId;

    const hop = await ack(one, 'room:join', { code, playerId: 'a', name: 'A', joinTeamId: teamB, intent: 'join' });
    assert.equal(hop.code, 'ALREADY_SEATED');
    assert.notEqual(teamA, teamB);
  });

  test('a table seats several people, and a browser that already holds a seat can add another', async () => {
    const { code } = await createRoom('host');
    const one = await open();
    const two = await open();
    const three = await open();

    const first = (await ack(one, 'room:join', {
      code, playerId: 'browser-A', name: 'Alice', teamName: "Alice's XI", intent: 'new',
    })).teamId;

    // A second tab of the SAME browser forks an identity and starts its own franchise.
    const second = (await ack(two, 'room:join', {
      code, playerId: 'browser-A-tab2', name: 'Bob', teamName: 'Bravo XI', intent: 'new',
    })).teamId;

    // A third tab of that browser is still seated at the first franchise, so asking to
    // join the second is refused - the client answers by forking again.
    const blocked = await ack(three, 'room:join', {
      code, playerId: 'browser-A', name: 'Cara', joinTeamId: second, intent: 'join',
    });
    assert.equal(blocked.code, 'ALREADY_SEATED');

    const forked = await ack(three, 'room:join', {
      code, playerId: 'browser-A-tab3', name: 'Cara', joinTeamId: second, intent: 'join',
    });
    assert.ok(forked.ok, forked.error);
    assert.equal(forked.teamId, second);

    // And anyone on a different device joins that table directly.
    const other = await open();
    const direct = await ack(other, 'room:join', {
      code, playerId: 'another-device', name: 'Dev', joinTeamId: second, intent: 'join',
    });
    assert.equal(direct.teamId, second);

    const table = direct.room.teams.find((t) => t.id === second);
    assert.deepEqual(table.members.map((m) => m.name), ['Bob', 'Cara', 'Dev']);
    assert.notEqual(first, second);
  });

  test('a table is capped and says so', async () => {
    const { code } = await createRoom('host');
    const owner = await open();
    const team = (await ack(owner, 'room:join', {
      code, playerId: 'p0', name: 'P0', teamName: 'Crowded', intent: 'new',
    })).teamId;

    // Fill the remaining seats (8 per table including the owner).
    for (let i = 1; i < 8; i += 1) {
      const s = await open();
      const res = await ack(s, 'room:join', { code, playerId: `p${i}`, name: `P${i}`, joinTeamId: team, intent: 'join' });
      assert.ok(res.ok, `seat ${i} should fit: ${res.error}`);
    }

    const overflow = await open();
    const res = await ack(overflow, 'room:join', {
      code, playerId: 'p8', name: 'P8', joinTeamId: team, intent: 'join',
    });
    assert.match(res.error || '', /already has 8 people/);
  });

  test('only the franchise owner can rename it', async () => {
    const { code } = await createRoom('owner');
    const owner = await open();
    const coach = await open();
    const made = await ack(owner, 'room:join', {
      code, playerId: 'owner', name: 'Ava', teamName: 'Mumbai', intent: 'new',
    });
    await ack(coach, 'room:join', { code, playerId: 'coach', name: 'Ben', joinTeamId: made.teamId, intent: 'join' });

    assert.ok((await ack(coach, 'room:update-team', { name: 'Hijacked' })).error);
    assert.ok((await ack(owner, 'room:update-team', { name: 'Mumbai Mavericks' })).ok);
  });
});

describe('what the server tells clients', () => {
  test('player ids never reach other clients', async () => {
    const { code } = await createRoom('secretive');
    const socket = await open();
    const res = await ack(socket, 'room:join', {
      code, playerId: 'super-secret-id', name: 'Ava', intent: 'new',
    });

    const blob = JSON.stringify(res.room);
    assert.ok(!blob.includes('super-secret-id'), 'a raw player id leaked into room state');
    assert.ok(!blob.includes('playerId'), 'room state exposes a playerId field');
    assert.ok(!blob.includes('ownerId'), 'room state exposes an ownerId field');
    assert.ok(!blob.includes('hostId'), 'room state exposes a hostId field');

    const members = res.room.teams.flatMap((t) => t.members);
    assert.ok(members.every((m) => m.id?.startsWith('m_')), 'members need an opaque id');
    assert.equal(members.filter((m) => m.isHost).length, 1);
  });

  test('peek reports an existing seat without leaking ids', async () => {
    const { code } = await createRoom('peeker');
    const socket = await open();
    const made = await ack(socket, 'room:join', { code, playerId: 'peeker', name: 'Ava', intent: 'new' });

    const peek = await ack(socket, 'room:peek', { code, playerId: 'peeker' });
    assert.equal(peek.seatedTeamId, made.teamId);
    assert.ok(!JSON.stringify(peek.teams).includes('playerId'));

    const stranger = await ack(socket, 'room:peek', { code, playerId: 'nobody' });
    assert.equal(stranger.seatedTeamId, null);
  });
});

describe('http surface', () => {
  test('health and config answer', async () => {
    const health = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(health.ok, true);

    const config = await (await fetch(`${BASE}/api/config`)).json();
    assert.equal(typeof config.maxBid, 'number');
    assert.ok(Array.isArray(config.iceServers));
  });

  test('unknown api routes return json, not the app shell', async () => {
    const res = await fetch(`${BASE}/api/definitely-not-a-route`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
  });

  test('security headers are set', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('room creation is rate limited', async () => {
    const results = [];
    for (let i = 0; i < 24; i += 1) {
      results.push((await fetch(`${BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'flood' }),
      })).status);
    }
    assert.ok(results.includes(429), `expected a 429 somewhere in ${results.join(',')}`);
  });
});
