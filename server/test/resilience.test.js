import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ack, connect, createRoom, startServer, stopServer, wait } from './helpers.js';

/** What a real game does to you: people drop, arrive late, and the host intervenes. */

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

const RULES = { purse: 5_000_000, squadSize: 15, minSquad: 11, bidTimerSec: 60, poolSize: 20 };

/** Two franchises, auction under way, first lot live. */
async function liveAuction() {
  const { code } = await createRoom('Sairam');
  const host = await open();
  const rival = await open();

  const hyd = (await ack(host, 'room:join', {
    code, playerId: 'Sairam', name: 'Sairam', teamName: 'Hyderabad', intent: 'new',
  })).teamId;
  await ack(rival, 'room:join', { code, playerId: 'Saiteja', name: 'Saiteja', teamName: 'Chennai', intent: 'new' });
  await ack(host, 'room:settings', RULES);

  const lots = [];
  host.on('auction:lot', (l) => lots.push(l));
  await ack(host, 'auction:start');
  for (let i = 0; i < 80 && !lots.length; i += 1) await wait(500);
  assert.ok(lots.length, 'no lot opened');

  return { code, host, rival, hyd, lots };
}

describe('when people come and go', () => {
  test('one member dropping does not take the franchise with them', async () => {
    const { code } = await createRoom('Sairam');
    const sairam = await open();
    const manoj = await open();

    const hyd = (await ack(sairam, 'room:join', {
      code, playerId: 'Sairam', name: 'Sairam', teamName: 'Hyderabad', intent: 'new',
    })).teamId;
    await ack(manoj, 'room:join', { code, playerId: 'Manoj', name: 'Manoj', joinTeamId: hyd, intent: 'join' });

    manoj.close();
    await wait(800);

    const state = (await ack(sairam, 'room:state')).room;
    const team = state.teams.find((t) => t.id === hyd);
    assert.ok(team, 'the franchise folded when one member left');
    assert.equal(team.connected, true, 'the table is still occupied');
    assert.equal(team.members.find((m) => m.name === 'Manoj').connected, false);
    assert.equal(team.members.find((m) => m.name === 'Sairam').connected, true);
  });

  test('a refresh mid-auction returns you to your seat and purse', async () => {
    const { code, host, hyd } = await liveAuction();

    const bid = await ack(host, 'auction:bid', {});
    assert.ok(bid.ok, bid.error);

    const before = (await ack(host, 'room:state')).room.teams.find((t) => t.id === hyd);
    host.close();
    await wait(800);

    const again = await open();
    const back = await ack(again, 'room:join', { code, playerId: 'Sairam', name: 'Sairam', intent: 'auto' });
    assert.equal(back.teamId, hyd);
    assert.equal(back.room.status, 'auction');
    assert.equal(back.room.teams.find((t) => t.id === hyd).purse, before.purse);
  });

  test('the room resumes after everyone has left and someone returns', async () => {
    const { code, host, rival } = await liveAuction();

    host.close();
    rival.close();
    await wait(1200);

    const returning = await open();
    const back = await ack(returning, 'room:join', { code, playerId: 'Sairam', name: 'Sairam', intent: 'auto' });
    assert.ok(back.ok, back.error);
    assert.equal(back.room.status, 'auction');
    assert.equal(back.room.paused, false, 'the room stayed paused after someone came back');
  });
});

describe('late arrivals', () => {
  test('a new franchise cannot appear mid-auction, but a team-mate can', async () => {
    const { code, host, hyd } = await liveAuction();

    const latecomer = await open();
    const asNew = await ack(latecomer, 'room:join', {
      code, playerId: 'Ravi', name: 'Ravi', teamName: 'Late XI', intent: 'new',
    });
    assert.equal(asNew.spectator, true, 'a mid-auction franchise would get a free purse');
    assert.ok((await ack(latecomer, 'auction:bid', {})).error, 'a spectator must not bid');
    assert.equal((await ack(latecomer, 'voice:join', { channel: 'team' })).channel, 'room');

    const mate = await open();
    const seated = await ack(mate, 'room:join', {
      code, playerId: 'Ravi2', name: 'Ravi', joinTeamId: hyd, intent: 'join',
    });
    assert.equal(seated.teamId, hyd, seated.error);

    const bid = await ack(mate, 'auction:bid', {});
    assert.ok(bid.ok || /highest bid/.test(bid.error || ''), bid.error);
    await ack(host, 'auction:finish');
  });
});

describe('host controls', () => {
  test('only the host can skip a lot or end the auction', async () => {
    const { host, rival } = await liveAuction();

    const closed = [];
    host.on('auction:closed', (p) => closed.push(p));

    assert.ok((await ack(rival, 'auction:skip')).error);
    assert.ok((await ack(host, 'auction:skip')).ok);
    await wait(1500);
    assert.equal(closed.length, 1, 'skipping should close the lot');

    assert.ok((await ack(rival, 'auction:finish')).error);

    const done = new Promise((r) => host.once('auction:finished', r));
    await ack(host, 'auction:finish');
    const finished = await Promise.race([done, wait(150_000).then(() => null)]);
    assert.ok(finished, 'ending early produced no verdict');
    assert.ok(Array.isArray(finished.result.rankings));
  });
});
