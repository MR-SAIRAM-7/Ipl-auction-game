import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameProvider.jsx';
import TopBar from '../components/TopBar.jsx';
import Lobby from '../components/Lobby.jsx';
import AuctionFloor from '../components/AuctionFloor.jsx';
import Results from '../components/Results.jsx';
import SquadsDrawer from '../components/SquadsDrawer.jsx';
import ChatDrawer from '../components/ChatDrawer.jsx';
import { VoiceProvider } from '../context/VoiceProvider.jsx';
import FranchisePicker, { NEW_FRANCHISE } from '../components/FranchisePicker.jsx';

function JoinGate({ code }) {
  const navigate = useNavigate();
  const { identity, join, connected, pushToast } = useGame();
  const [name, setName] = useState(identity.name || '');
  const [teamName, setTeamName] = useState(identity.teamName || '');
  const [pick, setPick] = useState(NEW_FRANCHISE);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return pushToast('error', 'Enter your name first.');
    setBusy(true);
    const takingSeat = pick && pick !== NEW_FRANCHISE;
    const res = await join({
      code,
      name: name.trim(),
      teamName: teamName.trim(),
      joinTeamId: takingSeat ? pick : undefined,
      intent: takingSeat ? 'join' : 'new',
    });
    setBusy(false);
    if (res.error) {
      // Recoverable - the franchise may have folded while this screen was open.
      // Stay put so they can pick again rather than bouncing them home.
      pushToast('error', res.error);
      setPick(NEW_FRANCHISE);
      setReloadKey((k) => k + 1);
    }
    return undefined;
  };

  return (
    <main className="shell home">
      <div className="hero">
        <span className="badge">Room {code}</span>
        <h1>Join the auction</h1>
        <p>Take a seat at a franchise already in the room, or start your own.</p>
      </div>
      <form className="card home-card stack" onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="gateName">Your name</label>
          <input id="gateName" className="input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        </div>

        <FranchisePicker
          key={reloadKey}
          code={code}
          playerId={identity.playerId}
          selected={pick}
          onSelect={setPick}
          onSeatChange={(seatId) => setPick((cur) => (cur === NEW_FRANCHISE && seatId ? seatId : cur))}
        />

        {pick === NEW_FRANCHISE ? (
          <div className="field">
            <label className="label" htmlFor="gateTeam">Franchise name <span className="dim">(optional)</span></label>
            <input
              id="gateTeam"
              className="input"
              value={teamName}
              maxLength={22}
              placeholder="Nagpur Ninjas"
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
        ) : null}

        <button className="btn primary block" type="submit" disabled={busy || !connected}>
          {busy ? 'Joining…' : pick && pick !== NEW_FRANCHISE ? 'Join this franchise' : `Join room ${code}`}
        </button>
        <button type="button" className="btn ghost block" onClick={() => navigate('/')}>Back</button>
      </form>
    </main>
  );
}

export default function Room() {
  const { code: rawCode } = useParams();
  const code = (rawCode || '').toUpperCase();
  const { room } = useGame();

  const [squadsOpen, setSquadsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusTeam, setFocusTeam] = useState(null);
  const [unread, setUnread] = useState(false);
  const seenChat = useRef(0);

  useEffect(() => {
    const count = room?.chat?.length || 0;
    if (chatOpen) {
      seenChat.current = count;
      setUnread(false);
    } else if (count > seenChat.current) {
      setUnread(true);
    }
  }, [room?.chat?.length, chatOpen]);

  if (!room || room.code !== code) return <JoinGate code={code} />;

  const openSquads = (teamId) => {
    setFocusTeam(teamId || null);
    setSquadsOpen(true);
  };

  return (
    // The voice session lives here, above the screens, so a call is not hung up
    // every time the room moves between the lobby, the auction and the results.
    <VoiceProvider>
      <TopBar
        onOpenSquads={() => openSquads(null)}
        onOpenChat={() => setChatOpen(true)}
        unreadChat={unread}
      />

      {room.status === 'lobby' ? <Lobby /> : null}
      {room.status === 'generating' || room.status === 'auction' ? (
        <AuctionFloor onSelectTeam={openSquads} />
      ) : null}
      {room.status === 'finished' ? <Results /> : null}

      <SquadsDrawer open={squadsOpen} onClose={() => setSquadsOpen(false)} focusTeamId={focusTeam} />
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </VoiceProvider>
  );
}
