import React from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { useVoiceSession } from '../context/VoiceProvider.jsx';
import { textOn } from '../lib/format.js';
import Icon from './Icon.jsx';

const SPEAKING_THRESHOLD = 0.08;

export default function VoiceDock() {
  const { voiceRoster, myTeam } = useGame();
  const voice = useVoiceSession();
  if (!voice) return null;

  // Mirror the server's grouping: a huddle is your table, the room channel is everyone in it.
  const inMyChannel = voiceRoster.filter((p) =>
    voice.channel === 'team' ? p.channel === 'team' && p.teamId === myTeam?.id : p.channel === 'room',
  );
  const others = inMyChannel.filter((p) => p.socketId !== voice.selfId);
  const elsewhere = voiceRoster.length - inMyChannel.length;

  const micIcon = () => {
    if (!voice.joined) return 'headphones';
    return voice.muted ? 'micOff' : 'mic';
  };

  const idle = () => {
    if (voice.connecting) return 'Asking for your microphone…';
    if (voiceRoster.length) return `${voiceRoster.length} already talking — tap to join`;
    return myTeam ? 'Talk to your table while you bid' : 'Talk to the room while you bid';
  };

  const summary = () => {
    const here =
      others.length === 0
        ? voice.channel === 'team'
          ? 'Only you at this table'
          : 'Only you in the room channel'
        : `${inMyChannel.length} ${voice.channel === 'team' ? 'at your table' : 'in the room channel'}`;
    const away = elsewhere ? ` · ${elsewhere} on the other channel` : '';
    return `${here}${away}${voice.muted ? ' · muted' : ''}`;
  };

  return (
    <section className="voice-dock">
      <button
        type="button"
        className="mic-btn"
        data-on={voice.joined && !voice.muted}
        data-muted={voice.joined && voice.muted}
        onClick={voice.joined ? voice.toggleMute : () => voice.join()}
        disabled={voice.connecting}
        aria-label={voice.joined ? (voice.muted ? 'Unmute' : 'Mute') : 'Join voice chat'}
        title={voice.joined ? (voice.muted ? 'Unmute' : 'Mute') : 'Join voice chat'}
      >
        <Icon name={micIcon()} size={18} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {voice.error ? (
          <p style={{ fontSize: 12, color: 'var(--neg)', lineHeight: 1.4 }}>{voice.error}</p>
        ) : voice.joined ? (
          <>
            <div className="voice-people">
              <div
                className="voice-av"
                data-speaking={!voice.muted && (voice.levels.me || 0) > SPEAKING_THRESHOLD}
                style={{ background: 'var(--text)' }}
                title="You"
              >
                YOU
                {voice.muted ? <span className="mic-off" /> : null}
              </div>
              {others.map((p) => (
                <div
                  key={p.socketId}
                  className="voice-av"
                  data-speaking={!p.muted && (voice.levels[p.socketId] || 0) > SPEAKING_THRESHOLD}
                  style={{ background: p.color, color: textOn(p.color) }}
                  title={`${p.teamName && voice.channel === 'room' ? `${p.name} · ${p.teamName}` : p.name}${
                    voice.routes[p.socketId] === 'relay' ? ' · relayed' : ''
                  }`}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                  {p.muted ? <span className="mic-off" /> : null}
                  {voice.routes[p.socketId] === 'relay' ? <span className="relayed" title="Relayed via TURN" /> : null}
                </div>
              ))}
            </div>
            <p className="dim" style={{ fontSize: 11, marginTop: 4 }}>{summary()}</p>
            {voice.reachability ? (
              <p style={{ fontSize: 11, marginTop: 3, color: 'var(--warn)', lineHeight: 1.4 }}>
                {voice.reachability}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 550 }}>Voice chat</div>
            <p className="dim" style={{ fontSize: 12 }}>{idle()}</p>
          </>
        )}
      </div>

      {myTeam ? (
        <div className="channel-switch" role="group" aria-label="Voice channel">
          <button
            type="button"
            data-on={voice.channel === 'team'}
            onClick={() => voice.switchChannel('team')}
            title="Only your franchise hears this"
          >
            Table
          </button>
          <button
            type="button"
            data-on={voice.channel === 'room'}
            onClick={() => voice.switchChannel('room')}
            title="Everyone in the room hears this"
          >
            Everyone
          </button>
        </div>
      ) : null}

      {voice.needsUnlock ? (
        <button type="button" className="btn sm primary" onClick={voice.unlockAudio}>
          Enable sound
        </button>
      ) : null}

      {voice.joined ? (
        <button type="button" className="btn sm ghost" onClick={voice.leave}>Leave</button>
      ) : null}
    </section>
  );
}
