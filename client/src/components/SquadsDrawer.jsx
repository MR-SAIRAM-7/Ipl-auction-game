import React, { useEffect, useState } from 'react';
import Drawer from './Drawer.jsx';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR, ROLE_SHORT, textOn } from '../lib/format.js';

export function SquadSheet({ team, settings }) {
  const spent = settings.purse - team.purse;
  const counts = team.squad.reduce((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <div className="crest lg" style={{ background: team.color, color: textOn(team.color) }}>{team.shortName}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 17 }}>{team.name}</h3>
          <div className="dim" style={{ fontSize: 12.5 }}>
            {(team.members?.length ? team.members.map((m) => m.name) : [team.ownerName]).join(', ')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontWeight: 600, fontSize: 17 }}>{formatINR(team.purse)}</div>
          <div className="dim" style={{ fontSize: 11.5 }}>left of {formatINR(settings.purse)}</div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'].map((role) => (
          <span className="pill" key={role}>
            {ROLE_SHORT[role]} <b>{counts[role] || 0}</b>
          </span>
        ))}
        <span className="pill">Overseas <b>{team.squad.filter((p) => p.overseas).length}</b></span>
        <span className="pill">Spent <b>{formatINR(spent)}</b></span>
      </div>

      {team.squad.length === 0 ? (
        <p className="dim" style={{ fontSize: 13 }}>No players bought yet.</p>
      ) : (
        <div className="squad-list">
          {[...team.squad]
            .sort((a, b) => b.price - a.price)
            .map((p) => (
              <div className="squad-row" key={p.id}>
                <span className="rl">{ROLE_SHORT[p.role]}</span>
                <span className="nm">
                  {p.name}
                  {p.overseas ? <span className="os-tag">OS</span> : null}
                </span>
                <span className="dim mono" style={{ fontSize: 11.5 }}>{p.rating}</span>
                <span className="pr mono">{formatINR(p.price)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function SquadsDrawer({ open, onClose, focusTeamId }) {
  const { room, me } = useGame();
  const [selected, setSelected] = useState(focusTeamId || me.teamId || room?.teams[0]?.id);

  useEffect(() => {
    if (focusTeamId) setSelected(focusTeamId);
  }, [focusTeamId]);

  if (!room) return null;
  const team = room.teams.find((t) => t.id === selected) || room.teams[0];

  return (
    <Drawer open={open} onClose={onClose} title="Squads">
      <div className="teams-strip" style={{ margin: '0 0 16px', padding: 0 }}>
        {room.teams.map((t) => (
          <button
            type="button"
            key={t.id}
            className="team-chip"
            style={{ minWidth: 104 }}
            data-me={t.id === selected}
            onClick={() => setSelected(t.id)}
          >
            <div className="row" style={{ gap: 6 }}>
              <span className="crest sm" style={{ background: t.color, color: textOn(t.color) }}>{t.shortName}</span>
              <span className="nm">{t.name}</span>
            </div>
            <div className="sq">{t.squad.length} players</div>
          </button>
        ))}
      </div>
      {team ? <SquadSheet team={team} settings={room.settings} /> : null}
    </Drawer>
  );
}
