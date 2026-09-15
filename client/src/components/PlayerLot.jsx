import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { formatClock, formatINR } from '../lib/format.js';

const URGENT_SEC = 10;

function Stats({ player }) {
  const s = player.stats || {};
  const bowls = player.role === 'Bowler' || player.role === 'All-rounder';
  const cells = bowls
    ? [
        ['Wkts', s.wickets],
        ['Econ', s.economy?.toFixed ? s.economy.toFixed(2) : s.economy],
        ['SR', s.strikeRate],
        ['Mat', s.matches],
      ]
    : [
        ['Avg', s.battingAverage],
        ['SR', s.strikeRate],
        ['Ct', s.catches],
        ['Mat', s.matches],
      ];
  return (
    <div className="stat-grid">
      {cells.map(([label, value]) => (
        <div className="stat" key={label}>
          <b className="mono">{value ?? '—'}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlayerLot() {
  const { room, myTeam, me } = useGame();
  const lot = room?.lot;
  const live = lot?.status === 'live' && !room.paused;
  const { ms, seconds } = useCountdown(lot?.endsAt, live);

  const [bump, setBump] = useState(false);
  const lastBid = useRef(null);

  useEffect(() => {
    if (!lot) return undefined;
    if (lastBid.current !== null && lot.currentBid !== lastBid.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 430);
      lastBid.current = lot.currentBid;
      return () => clearTimeout(t);
    }
    lastBid.current = lot.currentBid;
    return undefined;
  }, [lot?.currentBid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lot) {
    return (
      <section className="card lot-card" style={{ textAlign: 'center', padding: 40 }}>
        <div className="spinner" />
        <p className="muted">Bringing the next player to the block…</p>
      </section>
    );
  }

  const p = lot.player;
  // The server tells us how long the current window is, so the bar stays honest
  // whether the clock was topped up by a bid or cut short by a round of passes.
  const total = lot.windowMs || (room.settings.bidTimerSec || 90) * 1000;
  const pct = Math.max(0, Math.min(100, (ms / total) * 100));
  const urgent = live && seconds <= URGENT_SEC;
  const closingOnPasses = live && lot.clockReason === 'passes';
  // A team-mate's bid puts the whole table in front, so say who actually raised it.
  const myTeamLeads = Boolean(myTeam && lot.bidderTeamId === myTeam.id);
  const iBid = myTeamLeads && lot.byMemberId && lot.byMemberId === me.memberId;
  const leadLine = () => {
    if (iBid) return 'You are leading';
    if (myTeamLeads) return lot.byName ? `${lot.byName} has your table in front` : 'Your table is leading';
    return lot.byName ? `${lot.bidderTeamName} leads · ${lot.byName}` : `${lot.bidderTeamName} leads`;
  };
  const latest = room.commentary?.[room.commentary.length - 1];
  const showCommentary = latest && latest.playerId === p.id;

  return (
    <section className="card lot-card">
      {lot.status === 'sold' || lot.status === 'unsold' ? (
        <div className={`stamp ${lot.status}`}>
          <div>
            <b>{lot.status === 'sold' ? 'SOLD' : 'UNSOLD'}</b>
            {lot.status === 'sold' ? (
              <p>
                {lot.bidderTeamName} · {formatINR(lot.currentBid)}
              </p>
            ) : (
              <p>No takers at {formatINR(p.basePrice)}</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="lot-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="idx">
            Lot {Math.min(lot.index + 1, lot.total)} of {lot.total}
            {lot.round === 2 ? ' · unsold round' : ''}
          </div>
          <h2 className="player-name">{p.name}</h2>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="role-badge" data-role={p.role}>{p.role}</span>
            <span className="pill">{p.country}</span>
            {p.overseas ? <span className="pill">Overseas</span> : null}
            <span className="pill">{p.age} yrs</span>
          </div>
        </div>
        <div className="rating-ring" style={{ '--pct': p.rating }}>
          <div>
            <span className="mono">{p.rating}</span>
            <small>RATING</small>
          </div>
        </div>
      </div>

      <Stats player={p} />

      <div className="row wrap" style={{ gap: 8, justifyContent: 'space-between' }}>
        <div className="tag-row">
          {(p.tags || []).map((t) => (
            <span className="tag" key={t}>{t}</span>
          ))}
        </div>
        <span className="dim" style={{ fontSize: 12 }}>
          {p.battingStyle}{p.bowlingStyle && p.bowlingStyle !== 'None' ? ` · ${p.bowlingStyle}` : ''}
        </span>
      </div>

      {p.blurb ? <p className="blurb">{p.blurb}</p> : null}

      <div className="bid-state" data-leading={myTeamLeads ? 'me' : lot.bidderTeamId ? 'other' : 'none'}>
        <span className="label">{lot.bidderTeamId ? 'Current bid' : 'Base price'}</span>
        <div className={`bid-amount mono${bump ? ' bump' : ''}`}>{formatINR(lot.currentBid)}</div>

        {lot.bidderTeamId ? (
          <span className="lead-line" data-who={myTeamLeads ? 'me' : 'other'}>
            <i className="dot" />
            {leadLine()}
          </span>
        ) : (
          <span className="lead-line muted">No bids yet — opens at {formatINR(lot.currentBid)}</span>
        )}

        {live ? (
          <>
            <div className="timer-track" data-urgent={urgent}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <span className="timer-num mono" data-urgent={urgent}>
                {closingOnPasses
                  ? `No other bids — going in ${formatClock(seconds)}`
                  : `${formatClock(seconds)} left`}
              </span>
            </div>
          </>
        ) : (
          <p className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>
            {room.paused ? 'Paused — waiting for everyone to come back.' : 'Hammer down.'}
          </p>
        )}
      </div>

      {showCommentary ? <p className="commentary">{latest.text}</p> : null}
    </section>
  );
}
