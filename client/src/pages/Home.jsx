import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '../context/GameProvider.jsx';
import { createRoom } from '../lib/api.js';
import { formatINR } from '../lib/format.js';
import FranchisePicker, { NEW_FRANCHISE } from '../components/FranchisePicker.jsx';

const FEATURES = [
  { title: 'A fresh pool every auction', body: 'Gemini invents the players, their stats and their base prices before each round.' },
  { title: 'Talk while you bid', body: 'Built-in voice chat, so the sledging happens live rather than in a group chat.' },
  { title: 'An AI verdict at the end', body: 'Nine metrics, a best XI and a ruling on who actually built the better squad.' },
  { title: 'Built for phones', body: 'One-tap bidding and big, readable numbers on any device on your wifi.' },
];

export default function Home() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { identity, join, connected, serverConfig, pushToast } = useGame();

  const [tab, setTab] = useState(params.get('code') ? 'join' : 'create');
  const [name, setName] = useState(identity.name || '');
  const [teamName, setTeamName] = useState(identity.teamName || '');
  const [code, setCode] = useState((params.get('code') || '').toUpperCase());
  const [pick, setPick] = useState(NEW_FRANCHISE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (identity.name && !name) setName(identity.name);
  }, [identity.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const enter = async (roomCode, joinTeamId) => {
    const takingSeat = joinTeamId && joinTeamId !== NEW_FRANCHISE;
    const res = await join({
      code: roomCode,
      name: name.trim(),
      teamName: teamName.trim(),
      joinTeamId: takingSeat ? joinTeamId : undefined,
      intent: takingSeat ? 'join' : 'new',
    });
    if (res.error) {
      pushToast('error', res.error);
      return false;
    }
    navigate(`/room/${roomCode.toUpperCase()}`);
    return true;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return pushToast('error', 'Enter your name first.');
    setBusy(true);
    try {
      const { code: newCode } = await createRoom({ hostId: identity.playerId });
      await enter(newCode, NEW_FRANCHISE);
    } catch (err) {
      pushToast('error', err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!name.trim()) return pushToast('error', 'Enter your name first.');
    if (code.trim().length < 4) return pushToast('error', 'That room code looks too short.');
    setBusy(true);
    try {
      await enter(code.trim().toUpperCase(), pick);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const disabled = busy || !connected;

  return (
    <main className="shell home">
      <div className="hero">
        <span className="badge">Auction Arena</span>
        <h1>Build your IPL squad</h1>
        <p>
          Create a room, share the code, and bid against your friends in real time.{' '}
          {formatINR(serverConfig?.defaultPurse ?? 5000000)} purse each,{' '}
          {formatINR(serverConfig?.maxBid ?? 5000000)} cap per player.
        </p>
      </div>

      <section className="card home-card">
        <div className="tabs">
          <button type="button" data-active={tab === 'create'} onClick={() => setTab('create')}>
            Create room
          </button>
          <button type="button" data-active={tab === 'join'} onClick={() => setTab('join')}>
            Join room
          </button>
        </div>

        <form className="stack" onSubmit={tab === 'create' ? handleCreate : handleJoin}>
          <div className="field">
            <label className="label" htmlFor="yourName">Your name</label>
            <input
              id="yourName"
              className="input"
              value={name}
              maxLength={20}
              placeholder="Rohit"
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {tab === 'join' ? (
            <div className="field">
              <label className="label" htmlFor="roomCode">Room code</label>
              <input
                id="roomCode"
                className="input code-input"
                value={code}
                maxLength={6}
                placeholder="ABCDE"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck="false"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </div>
          ) : null}

          {tab === 'join' ? (
            <FranchisePicker
              code={code}
              playerId={identity.playerId}
              selected={pick}
              onSelect={setPick}
              onSeatChange={(seatId) => setPick((cur) => (cur === NEW_FRANCHISE && seatId ? seatId : cur))}
            />
          ) : null}

          {tab === 'create' || pick === NEW_FRANCHISE ? (
            <div className="field">
              <label className="label" htmlFor="teamName">Franchise name <span className="dim">(optional)</span></label>
              <input
                id="teamName"
                className="input"
                value={teamName}
                maxLength={22}
                placeholder="Nagpur Ninjas"
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
          ) : null}

          <button className="btn primary block" type="submit" disabled={disabled}>
            {busy
              ? 'Just a sec…'
              : tab === 'create'
                ? 'Create the room'
                : pick && pick !== NEW_FRANCHISE
                  ? 'Join this franchise'
                  : 'Join the auction'}
          </button>

          {!connected ? (
            <p className="dim" style={{ fontSize: 12.5, textAlign: 'center' }}>Connecting to the server…</p>
          ) : null}
        </form>
      </section>

      <div className="features">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <h4>{f.title}</h4>
            <p>{f.body}</p>
          </div>
        ))}
      </div>

      {serverConfig && !serverConfig.gemini ? (
        <p className="dim" style={{ fontSize: 12, marginTop: 18 }}>
          No Gemini key detected — players and the final verdict come from the built-in offline generator.
        </p>
      ) : null}
    </main>
  );
}
