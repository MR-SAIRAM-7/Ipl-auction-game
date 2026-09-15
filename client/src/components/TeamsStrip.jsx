import React from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { formatShort, textOn } from '../lib/format.js';

export default function TeamsStrip({ onSelect }) {
  const { room, me } = useGame();
  if (!room) return null;
  const leaderId = room.lot?.bidderTeamId;

  return (
    <div className="teams-strip">
      {room.teams.map((t) => {
        const pct = Math.max(0, Math.min(100, (t.purse / room.settings.purse) * 100));
        return (
          <button
            type="button"
            key={t.id}
            className="team-chip"
            data-me={t.id === me.teamId}
            data-leading={t.id === leaderId}
            onClick={() => onSelect?.(t.id)}
          >
            <div className="row" style={{ gap: 7 }}>
              <span className="crest sm" style={{ background: t.color, color: textOn(t.color) }}>{t.shortName}</span>
              <span className="nm">{t.name}</span>
            </div>
            <div className="pu mono">{formatShort(t.purse)}</div>
            <div className="sq">
              {t.squad.length}/{room.settings.squadSize} players
              {t.id === leaderId ? ' · leading' : ''}
              {!t.connected ? ' · away' : ''}
            </div>
            <div className="bar"><i style={{ width: `${pct}%`, background: t.color }} /></div>
          </button>
        );
      })}
    </div>
  );
}
