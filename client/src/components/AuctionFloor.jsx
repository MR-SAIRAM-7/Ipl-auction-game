import React from 'react';
import TeamsStrip from './TeamsStrip.jsx';
import PlayerLot from './PlayerLot.jsx';
import BidBar from './BidBar.jsx';
import HistoryFeed from './HistoryFeed.jsx';
import VoiceDock from './VoiceDock.jsx';
import { useGame } from '../context/GameProvider.jsx';

/**
 * What is left to come, by set rather than by name.
 *
 * Listing the next four players told you exactly what to save your purse for, which
 * is the opposite of an auction. A real one announces the SET - batters, then keepers,
 * then all-rounders, then bowlers - so you can plan without knowing who is next.
 */
function SetProgress() {
  const { room } = useGame();
  const sets = room?.sets || [];
  if (!sets.length) return null;

  /**
   * Set sizes never change once the pool is built, so progress is derived from the
   * lot index rather than read from the payload. The per-lot broadcast carries only
   * the lot, so trusting the counts that arrived with it left this frozen at zero
   * for the whole auction.
   */
  let consumed = (room.lotIndex ?? -1) + 1;
  const withProgress = sets.map((s) => {
    const done = Math.max(0, Math.min(s.total, consumed));
    consumed -= done;
    return { ...s, done };
  });

  return (
    <section className="card">
      <div className="section-title">Sets</div>
      <div className="set-list">
        {withProgress.map((s) => {
          const live = s.done > 0 && s.done < s.total;
          const done = s.done >= s.total;
          return (
            <div className={`set-row ${live ? 'live' : ''} ${done ? 'done' : ''}`} key={s.label}>
              <span className="nm">{s.label}</span>
              <span className="set-bar" aria-hidden="true">
                <span style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} />
              </span>
              <span className="dim mono" style={{ fontSize: 11.5 }}>
                {s.done}/{s.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function AuctionFloor({ onSelectTeam }) {
  const { room } = useGame();

  if (room?.status === 'generating') {
    return (
      <div className="overlay">
        <div>
          <div className="spinner" />
          <h3>Scouting the player pool</h3>
          <p className="muted" style={{ marginTop: 10, maxWidth: 340 }}>
            The AI is inventing {room.settings.poolSize} cricketers, complete with stats and base prices, just for this
            auction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="shell floor">
        <TeamsStrip onSelect={onSelectTeam} />

        <div className="floor-voice">
          <VoiceDock />
        </div>

        <div className="floor-main">
          <PlayerLot />
        </div>

        <div className="floor-side">
          <SetProgress />
          <HistoryFeed />
        </div>
      </main>
      <BidBar />
    </>
  );
}
