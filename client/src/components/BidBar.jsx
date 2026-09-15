import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR, textOn } from '../lib/format.js';

const MIN_BASE = 20000;

/** Mirrors the server's reserve rule so the UI can disable a bid before it is rejected. */
export function maxAffordable(room, team) {
  if (!room || !team) return 0;
  const slotsAfterThis = Math.max(0, room.settings.minSquad - team.squad.length - 1);
  return Math.max(0, Math.min(team.purse - slotsAfterThis * MIN_BASE, room.settings.maxBid));
}

export default function BidBar() {
  const { room, myTeam, me, bid, pass, skipLot, finish } = useGame();
  const [busy, setBusy] = useState(false);
  const barRef = useRef(null);
  const lot = room?.lot;

  const budget = useMemo(() => maxAffordable(room, myTeam), [room, myTeam]);

  // The bar grows and shrinks with the jump row and the host controls, so publish its
  // height and let the floor reserve exactly that much room rather than guessing.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const publish = () =>
      document.documentElement.style.setProperty('--bidbar-h', `${Math.round(el.offsetHeight)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--bidbar-h');
    };
  }, []);

  if (!room) return null;

  const live = lot?.status === 'live' && !room.paused;
  const squadFull = myTeam ? myTeam.squad.length >= room.settings.squadSize : true;
  const leading = myTeam && lot?.bidderTeamId === myTeam.id;
  const nextBid = lot?.nextBid ?? 0;
  const increment = lot?.increment ?? 10000;
  const canAfford = budget >= nextBid;
  const hasPassed = myTeam && lot?.passed?.includes(myTeam.id);

  const disabled = !live || !myTeam || squadFull || leading || !canAfford || busy;

  const jumps = [nextBid + increment * 2, nextBid + increment * 4]
    .map((v) => Math.min(v, room.settings.maxBid))
    .filter((v) => v > nextBid && v <= budget);

  const doBid = async (amount) => {
    setBusy(true);
    if (navigator.vibrate) navigator.vibrate(10);
    await bid(amount);
    setBusy(false);
  };

  const reason = () => {
    if (!myTeam) return 'Spectating';
    if (squadFull) return 'Your squad is full';
    if (leading) {
      const by = lot?.byMemberId && lot.byMemberId !== me.memberId ? lot.byName : null;
      return by ? `${by} holds the top bid` : 'You hold the top bid';
    }
    if (!canAfford && live) return `Your limit is ${formatINR(budget)}`;
    if (!live) return room.paused ? 'Auction paused' : 'Waiting for the next lot';
    return null;
  };

  return (
    <div className="bidbar" ref={barRef}>
      <div className="bidbar-inner">
        {jumps.length && live && myTeam && !leading && !squadFull ? (
          <div className="quick-bids">
            <span className="label" style={{ paddingRight: 2 }}>Jump to</span>
            {jumps.map((amount) => (
              <button key={amount} type="button" className="btn sm" disabled={busy} onClick={() => doBid(amount)}>
                {formatINR(amount)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="bid-actions">
          <button
            type="button"
            className="btn btn-bid"
            onClick={pass}
            disabled={!live || !myTeam || leading || hasPassed}
          >
            {hasPassed ? 'Passed' : 'Pass'}
            <small>{hasPassed ? 'your table is out' : 'skip this player'}</small>
          </button>

          <button type="button" className="btn btn-bid primary" onClick={() => doBid(nextBid)} disabled={disabled}>
            {live && nextBid ? `Bid ${formatINR(nextBid)}` : 'Bid'}
            <small>{reason() || `+${formatINR(increment)} slab`}</small>
          </button>
        </div>

        <div className="mybar">
          {myTeam ? (
            <>
              <span
                className="crest sm"
                style={{ background: myTeam.color, color: textOn(myTeam.color), width: 18, height: 18, fontSize: 8 }}
              >
                {myTeam.shortName}
              </span>
              <span>Purse <b className="mono">{formatINR(myTeam.purse)}</b></span>
              <span>Max bid <b className="mono">{formatINR(budget)}</b></span>
            </>
          ) : (
            <span>Spectator mode</span>
          )}
          {me.isHost ? (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" className="btn sm ghost" onClick={skipLot} disabled={!live}>Skip lot</button>
              <button type="button" className="btn sm danger" onClick={finish}>End auction</button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
