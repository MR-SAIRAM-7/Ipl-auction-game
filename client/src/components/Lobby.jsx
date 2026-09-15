import React, { useState } from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { formatDuration, formatINR, LAKH, textOn } from '../lib/format.js';
import Icon from './Icon.jsx';
import VoiceDock from './VoiceDock.jsx';

const PALETTE = [
  '#2f6fed', '#dd6b2b', '#d9a212', '#7c4dcc', '#cf3b33',
  '#c0407a', '#e07aa6', '#22508f', '#0f9488', '#5a6472',
];

/** Lot lengths the host can pick. The server refuses anything under a minute. */
const LOT_SECONDS = [60, 90, 120, 180];

function SettingRow({ label, hint, children }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint ? <span className="dim" style={{ fontSize: 11.5 }}>{hint}</span> : null}
    </div>
  );
}

export default function Lobby() {
  const { room, me, myTeam, start, updateSettings, updateTeam, serverConfig } = useGame();
  const [teamName, setTeamName] = useState(myTeam?.name || '');
  const [starting, setStarting] = useState(false);
  const s = room.settings;

  const isHost = me.isHost;
  const shareUrl = `${window.location.origin}/?code=${room.code}`;

  // Everyone needs minSquad players to field a legal side, and the pool is shared.
  // At the defaults a room of four franchises quietly cannot fill them all.
  const playersNeeded = room.teams.length * s.minSquad;
  const poolTooSmall = room.teams.length > 0 && s.poolSize < playersNeeded;

  const saveTeam = async () => {
    if (!teamName.trim() || teamName.trim() === myTeam?.name) return;
    await updateTeam({ name: teamName.trim() });
  };

  const handleStart = async () => {
    setStarting(true);
    await start();
    setStarting(false);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my IPL auction', text: `Room code ${room.code}`, url: shareUrl });
        return;
      } catch {
        /* user dismissed the sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="shell lobby">
      <section className="card invite full">
        <span className="label">Room code</span>
        <div className="big-code">{room.code}</div>
        <p className="muted" style={{ fontSize: 13.5 }}>Share this with your friends to let them in.</p>
        <button type="button" className="btn primary" style={{ marginTop: 16 }} onClick={share}>
          <Icon name="share" size={15} /> Share invite link
        </button>
      </section>

      <div className="full">
        <VoiceDock />
      </div>

      <section className="card">
        <div className="section-title">Teams in the room ({room.teams.length})</div>
        <div className="team-list">
          {room.teams.map((t) => (
            <div className="team-row" key={t.id}>
              <div className="crest" style={{ background: t.color, color: textOn(t.color) }}>{t.shortName}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tname" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  {t.id === me.teamId ? <span className="pill">You</span> : null}
                </div>
                <div className="member-chips">
                  {(t.members || []).map((m) => (
                    <span className="member-chip" key={m.id} data-away={!m.connected}>
                      <i />
                      {m.name}
                      {m.isOwner ? ' · owner' : ''}
                      {m.isHost ? ' · host' : ''}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`pill ${t.connected ? 'live' : 'off'}`}>
                <i className="dot" /> {t.connected ? 'ready' : 'away'}
              </span>
            </div>
          ))}
          {room.teams.length < 2 ? (
            <p className="dim" style={{ fontSize: 13, padding: '10px 0' }}>
              Waiting for more franchises to join…
            </p>
          ) : null}
        </div>

        {myTeam && me.isOwner ? (
          <div className="stack" style={{ marginTop: 18 }}>
            <div className="field">
              <label className="label" htmlFor="myTeam">Rename your franchise</label>
              <div className="row">
                <input
                  id="myTeam"
                  className="input"
                  value={teamName}
                  maxLength={22}
                  onChange={(e) => setTeamName(e.target.value)}
                  onBlur={saveTeam}
                />
                <button type="button" className="btn" onClick={saveTeam}>Save</button>
              </div>
            </div>
            <div className="field">
              <span className="label">Franchise colour</span>
              <div className="swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="swatch"
                    data-on={myTeam.color === c}
                    aria-label={`Use colour ${c}`}
                    onClick={() => updateTeam({ name: myTeam.name, color: c })}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : myTeam ? (
          <p className="dim" style={{ fontSize: 12.5, marginTop: 16 }}>
            You are at <b>{myTeam.name}</b> with {myTeam.members.length - 1} other
            {myTeam.members.length === 2 ? '' : 's'}. You share one purse and any of you can bid.
            Only the owner can rename or recolour the franchise.
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-title">Auction rules {isHost ? '' : '· host controls these'}</div>
        <div className="settings-grid">
          <SettingRow label="Purse per team" hint={`Currently ${formatINR(s.purse)}`}>
            <select
              className="select"
              value={s.purse}
              disabled={!isHost}
              onChange={(e) => updateSettings({ ...s, purse: Number(e.target.value) })}
            >
              {[20, 30, 40, 50].map((l) => (
                <option key={l} value={l * LAKH}>{l} lakh</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            label="Players in the pool"
            hint={`${room.teams.length} franchise${room.teams.length === 1 ? '' : 's'} × ${s.minSquad} minimum = ${playersNeeded} needed`}
          >
            <select
              className="select"
              value={s.poolSize}
              disabled={!isHost}
              onChange={(e) => updateSettings({ ...s, poolSize: Number(e.target.value) })}
            >
              {[20, 30, 40, 50, 60, 80].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="Time on the block" hint="Each bid tops the clock back up to 20s.">
            <select
              className="select"
              value={s.bidTimerSec}
              disabled={!isHost}
              onChange={(e) => updateSettings({ ...s, bidTimerSec: Number(e.target.value) })}
            >
              {LOT_SECONDS.map((n) => (
                <option key={n} value={n}>{formatDuration(n)} per player</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="Max squad size">
            <select
              className="select"
              value={s.squadSize}
              disabled={!isHost}
              onChange={(e) => {
                const squadSize = Number(e.target.value);
                updateSettings({ ...s, squadSize, minSquad: Math.min(s.minSquad, squadSize) });
              }}
            >
              {[11, 13, 15, 18].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </SettingRow>
        </div>

        {poolTooSmall ? (
          <p className="notice warn" style={{ marginTop: 14 }}>
            Only {s.poolSize} players for {room.teams.length} franchises — not enough for everyone to reach{' '}
            {s.minSquad}. {isHost ? `Raise the pool to at least ${playersNeeded}` : 'Ask the host to raise the pool'}, or
            lower the minimum squad, otherwise some teams finish short.
          </p>
        ) : null}

        <p className="dim" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
          Every bid is capped at {formatINR(serverConfig?.maxBid ?? 5000000)}. Each team must keep back enough money to
          reach {s.minSquad} players, so nobody can spend the whole purse on one signing.
        </p>
      </section>

      <section className="card full">
        {isHost ? (
          <>
            <button
              type="button"
              className="btn primary block"
              style={{ height: 52, fontSize: 16 }}
              onClick={handleStart}
              disabled={starting || !room.teams.length}
            >
              {starting ? 'Scouting players…' : 'Start the auction'}
            </button>
            <p className="dim" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 12 }}>
              {serverConfig?.gemini
                ? 'Gemini generates a brand new set of players the moment you start.'
                : 'Players come from the built-in generator (no Gemini key configured).'}
            </p>
          </>
        ) : (
          <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
            Waiting for{' '}
            <b>
              {room.teams.flatMap((t) => t.members || []).find((m) => m.isHost)?.name || 'the host'}
            </b>{' '}
            to start the auction…
          </p>
        )}
      </section>
    </main>
  );
}
