import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ack, connect, createRoom, startServer, stopServer, wait } from './helpers.js';

/**
 * One complete auction, played end to end by nine people across three franchises.
 * Slow by design - this is the test that would have caught a purse drifting out of
 * step with a squad, or a franchise vanishing from the final table.
 */

const SQUADS = [
  { team: 'Hyderabad', people: ['Sairam', 'Manoj', 'Ravi'] },
  { team: 'Chennai', people: ['Saiteja', 'Subhash', 'Keerthan'] },
  { team: 'Bangalore', people: ['Bala', 'Vishnu', 'Rohit'] },
];

const PURSE = 5_000_000;
const SQUAD_CAP = 15;

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

describe('a complete game with three franchises of three', () => {
  test('plays from lobby to verdict without breaking a rule', async () => {
    const { code } = await createRoom('Sairam');

    /* ---- everyone takes their seat ---- */
    const players = new Map();
    const franchises = new Map();

    for (const { team, people } of SQUADS) {
      for (const [i, person] of people.entries()) {
        const socket = await open();
        const res = await ack(socket, 'room:join', i === 0
          ? { code, playerId: person, name: person, teamName: team, intent: 'new' }
          : { code, playerId: person, name: person, joinTeamId: franchises.get(team), intent: 'join' });
        assert.ok(res.ok, `${person} could not join ${team}: ${res.error}`);
        if (i === 0) franchises.set(team, res.teamId);
        players.set(person, { socket, team, name: person });
      }
    }

    const host = players.get('Sairam');
    const anyOf = (team) => {
      const list = [...players.values()].filter((p) => p.team === team);
      return list[Math.floor(Math.random() * list.length)];
    };

    /* ---- the lobby ---- */
    const lobby = (await ack(host.socket, 'room:state')).room;
    assert.equal(lobby.teams.length, 3);
    assert.ok(lobby.teams.every((t) => t.members.length === 3), 'every table should seat three');
    assert.equal(lobby.teams.flatMap((t) => t.members).filter((m) => m.isHost).length, 1);
    assert.ok(!JSON.stringify(lobby).includes('playerId'), 'room state must not carry credentials');

    // Roles are enforced.
    assert.ok((await ack(players.get('Manoj').socket, 'room:update-team', { name: 'Hacked' })).error);
    assert.ok((await ack(players.get('Saiteja').socket, 'room:settings', { poolSize: 60 })).error);

    const settings = await ack(host.socket, 'room:settings', {
      purse: PURSE, squadSize: SQUAD_CAP, minSquad: 11, bidTimerSec: 60, poolSize: 24,
    });
    assert.ok(settings.ok, settings.error);

    /* ---- each franchise huddles privately ---- */
    for (const p of players.values()) await ack(p.socket, 'voice:join', { channel: 'team' });
    await wait(300);
    for (const { team, people } of SQUADS) {
      const last = await ack(players.get(people[2]).socket, 'voice:channel', { channel: 'team' });
      const heard = (last.peers || []).map((x) => x.name).sort();
      assert.deepEqual(heard, people.slice(0, 2).sort(), `${team} huddle leaked or lost people`);
    }
    for (const p of players.values()) p.socket.emit('voice:leave');

    /* ---- chat is attributed to the person and their franchise ---- */
    const chat = [];
    host.socket.on('chat:new', (m) => chat.push(m));
    players.get('Vishnu').socket.emit('chat:send', { text: 'Bangalore going big' });
    await wait(400);
    assert.equal(chat[0]?.name, 'Vishnu');
    assert.equal(chat[0]?.teamName, 'Bangalore');

    /* ---- play it ---- */
    const events = [];
    host.socket.on('auction:lot', (lot) => events.push({ t: 'lot', lot }));
    host.socket.on('auction:closed', (p) => events.push({ t: 'closed', p }));
    host.socket.on('auction:finished', (p) => events.push({ t: 'finished', p }));

    const from = async (i, t, ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = events.slice(i).find((e) => e.t === t);
        if (hit) return hit;
        await wait(50);
      }
      return null;
    };

    let cursor = events.length;
    await ack(host.socket, 'auction:start');

    const sales = [];
    const ruleErrors = [];
    const squadCounts = new Map(SQUADS.map(({ team }) => [team, 0]));
    let finished = null;
    let guard = 0;

    while (!finished && guard < 120) {
      guard += 1;
      const lotEvent = await from(cursor, 'lot', 45_000);
      if (!lotEvent) break;
      cursor = events.indexOf(lotEvent) + 1;
      const lot = lotEvent.lot;

      const ceilings = new Map(SQUADS.map(({ team }) => [
        team,
        Math.round((lot.player.rating / 100) * 900_000 * (0.4 + Math.random() * 1.2)),
      ]));

      const closeMark = events.length;
      let current = lot.currentBid;
      let leader = null;

      for (let round = 0; round < 12; round += 1) {
        let raised = false;
        for (const { team } of SQUADS) {
          if (team === leader || current > ceilings.get(team) || squadCounts.get(team) >= SQUAD_CAP) continue;
          const res = await ack(anyOf(team).socket, 'auction:bid', {});
          if (res.ok) {
            current = res.amount;
            leader = team;
            raised = true;
          } else if (!/highest bid|purse|capped|full|Slow down/i.test(res.error || '')) {
            ruleErrors.push(`${team}: ${res.error}`);
          }
          if (current >= PURSE) break;
        }
        if (!raised) break;
      }

      for (const { team } of SQUADS) {
        if (team === leader) continue;
        const res = await ack(anyOf(team).socket, 'auction:pass', {});
        if (res.error && !/own bid|No live lot/i.test(res.error)) ruleErrors.push(`pass ${team}: ${res.error}`);
      }

      const closed = await from(closeMark, 'closed', 45_000);
      assert.ok(closed, 'a lot never closed');
      cursor = Math.max(cursor, events.indexOf(closed) + 1);
      sales.push(closed.p.sale);
      for (const t of closed.p.teams) {
        const name = [...franchises.entries()].find(([, id]) => id === t.id)?.[0];
        if (name) squadCounts.set(name, t.squadCount);
      }
      finished = await from(cursor, 'finished', 100);
    }

    if (!finished) finished = await from(cursor, 'finished', 150_000);
    assert.ok(finished, 'the auction never reached a verdict');
    assert.deepEqual(ruleErrors, [], 'the server rejected a bid it should have allowed');
    assert.ok(sales.length > 0);

    /* ---- the books must balance ---- */
    const { result, teams } = finished.p;
    assert.equal(result.rankings.length, 3, 'every franchise belongs in the standings');
    assert.deepEqual(result.rankings.map((r) => r.rank), [1, 2, 3]);
    assert.ok(result.winnerTeamId);

    for (const t of teams) {
      const spent = PURSE - t.purse;
      const sum = t.squad.reduce((n, p) => n + p.price, 0);
      assert.equal(spent, sum, `${t.name}: purse and squad disagree`);
      assert.ok(t.purse >= 0, `${t.name} went into the red`);
      assert.ok(t.squad.length <= SQUAD_CAP, `${t.name} exceeded the squad cap`);
      assert.ok(t.squad.every((p) => p.price <= PURSE), `${t.name} paid over the bid cap`);
    }

    const bought = teams.flatMap((t) => t.squad.map((p) => p.id));
    assert.equal(new Set(bought).size, bought.length, 'a player was sold twice');
    assert.equal(bought.length, sales.filter((s) => s.status === 'sold').length);
    assert.ok(sales.filter((s) => s.status === 'sold').every((s) => s.byName), 'sales must record the bidder');

    /* ---- and it goes round again ---- */
    assert.ok((await ack(players.get('Bala').socket, 'auction:reset')).error, 'only the host restarts');
    assert.ok((await ack(host.socket, 'auction:reset')).ok);
    await wait(700);

    const restarted = (await ack(host.socket, 'room:state')).room;
    assert.equal(restarted.status, 'lobby');
    assert.equal(restarted.teams.length, 3);
    assert.ok(restarted.teams.every((t) => t.members.length === 3), 'everyone should keep their seat');
    assert.ok(restarted.teams.every((t) => t.purse === restarted.settings.purse));
    assert.ok(restarted.teams.every((t) => t.squad.length === 0));
  });

  test('a franchise that signs nobody still appears in the standings', async () => {
    const { code } = await createRoom('Sairam');
    const a = await open();
    const b = await open();
    const c = await open();

    await ack(a, 'room:join', { code, playerId: 'Sairam', name: 'Sairam', teamName: 'Hyderabad', intent: 'new' });
    await ack(b, 'room:join', { code, playerId: 'Saiteja', name: 'Saiteja', teamName: 'Chennai', intent: 'new' });
    await ack(c, 'room:join', { code, playerId: 'Bala', name: 'Bala', teamName: 'Bangalore', intent: 'new' });
    await ack(a, 'room:settings', {
      purse: PURSE, squadSize: SQUAD_CAP, minSquad: 11, bidTimerSec: 60, poolSize: 20,
    });

    const lots = [];
    a.on('auction:lot', (l) => lots.push(l));
    await ack(a, 'auction:start');
    for (let i = 0; i < 80 && !lots.length; i += 1) await wait(500);
    assert.ok(lots.length, 'no lot opened');

    // Only Hyderabad buys anyone.
    await ack(a, 'auction:bid', {});
    const done = new Promise((r) => a.once('auction:finished', r));
    await ack(a, 'auction:skip');
    await wait(1500);
    await ack(a, 'auction:finish');

    const finished = await Promise.race([done, wait(150_000).then(() => null)]);
    assert.ok(finished, 'no verdict');

    const ranked = finished.result.rankings;
    assert.equal(ranked.length, 3, 'empty-handed franchises were dropped from the table');
    assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
    assert.equal(ranked[0].teamName, 'Hyderabad');
    assert.ok(ranked.slice(1).every((r) => r.overallScore === 0));
    assert.match(ranked[1].verdict, /did not sign/);
  });
});
