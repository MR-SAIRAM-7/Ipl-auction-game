import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR } from '../lib/format.js';
import Icon from './Icon.jsx';
import { isMuted, isSpeechOn, setMuted, setSpeech, sfx, stopSpeaking } from '../lib/audio.js';

export default function TopBar({ onOpenSquads, onOpenChat, unreadChat }) {
  const navigate = useNavigate();
  const { room, myTeam, connected, leave } = useGame();
  const [copied, setCopied] = useState(false);
  // Mirrors of the audio module's own state, so the buttons re-render when tapped.
  const [muted, setMutedState] = useState(isMuted());
  const [speech, setSpeechState] = useState(isSpeechOn());

  if (!room) return null;

  const copy = async () => {
    const url = `${window.location.origin}/?code=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked - the code is on screen anyway */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const exit = () => {
    leave();
    navigate('/');
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button type="button" className="room-code" onClick={copy} title="Copy the invite link">
          {room.code}
          <small>{copied ? 'link copied' : 'tap to share'}</small>
        </button>

        {room.status === 'auction' ? (
          <span className="pill live">
            <i className="dot pulse" /> <span className="lbl">Live</span>
          </span>
        ) : null}
        {room.paused ? <span className="pill warn"><span className="lbl">Paused</span></span> : null}
        {!connected ? <span className="pill off"><span className="lbl">Offline</span></span> : null}

        {myTeam ? (
          <div className="purse-chip">
            <span className="amt mono">{formatINR(myTeam.purse)}</span>
            <span className="cap">{myTeam.squad.length}/{room.settings.squadSize} picked</span>
          </div>
        ) : (
          <span className="pill" style={{ marginLeft: 'auto' }}>Spectating</span>
        )}

        <button
          type="button"
          className={`btn ghost icon ${muted ? 'off' : ''}`}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setMutedState(next);
            if (!next) sfx.lot();
          }}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          title={muted ? 'Sound off' : 'Sound on'}
        >
          {muted ? '🔇' : '🔊'}
        </button>

        <button
          type="button"
          className={`btn ghost icon ${speech ? '' : 'off'}`}
          disabled={muted}
          onClick={() => {
            const next = !speech;
            setSpeech(next);
            setSpeechState(next);
            if (!next) stopSpeaking();
          }}
          aria-label={speech ? 'Turn the announcer off' : 'Turn the announcer on'}
          title={speech ? 'Announcer on' : 'Announcer off'}
        >
          🎙
        </button>

        <button type="button" className="btn ghost icon" onClick={onOpenSquads} aria-label="Squads" title="Squads">
          <Icon name="users" />
        </button>
        <button type="button" className="btn ghost icon" onClick={onOpenChat} aria-label="Chat" title="Chat">
          <Icon name="message" />
          {unreadChat ? <span className="unread-dot" /> : null}
        </button>
        <button type="button" className="btn ghost icon" onClick={exit} aria-label="Leave room" title="Leave">
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}
