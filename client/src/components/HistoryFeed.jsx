import React from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR, ROLE_SHORT, textOn } from '../lib/format.js';

export default function HistoryFeed() {
  const { room } = useGame();
  const history = [...(room?.history || [])].reverse();

  return (
    <section className="card">
      <div className="section-title">Under the hammer</div>
      {history.length === 0 ? (
        <p className="dim" style={{ fontSize: 13 }}>Nothing sold yet. The first lot is coming up.</p>
      ) : (
        <div className="feed">
          {history.map((h, i) => (
            <div className="feed-row" key={`${h.player.id}-${i}`} data-status={h.status}>
              <span className="rl">{ROLE_SHORT[h.player.role] || '—'}</span>
              <span className="nm">{h.player.name}</span>
              {h.status === 'sold' ? (
                <>
                  <span
                    className="crest sm"
                    style={{
                      background: h.color || '#5a6472',
                      color: textOn(h.color || '#5a6472'),
                      width: 20,
                      height: 20,
                      fontSize: 8.5,
                    }}
                    title={h.teamName}
                  >
                    {(h.teamName || '').slice(0, 3).toUpperCase()}
                  </span>
                  <span className="pr mono">{formatINR(h.price)}</span>
                </>
              ) : (
                <span className="pr">unsold</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
