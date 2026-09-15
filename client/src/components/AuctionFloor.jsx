import React from 'react';
import TeamsStrip from './TeamsStrip.jsx';
import PlayerLot from './PlayerLot.jsx';
import BidBar from './BidBar.jsx';
import HistoryFeed from './HistoryFeed.jsx';
import VoiceDock from './VoiceDock.jsx';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR, ROLE_SHORT } from '../lib/format.js';

function UpNext() {
  const { room } = useGame();
  const from = (room?.lotIndex ?? -1) + 1;
  const upcoming = (room?.pool || []).slice(from, from + 4);
  if (!upcoming.length) return null;

  return (
    <section className="card">
      <div className="section-title">Coming up</div>
      <div className="squad-list">
        {upcoming.map((p) => (
          <div className="squad-row" key={p.id}>
            <span className="rl">{ROLE_SHORT[p.role]}</span>
            <span className="nm">{p.name}</span>
            <span className="dim mono" style={{ fontSize: 11.5 }}>{p.rating}</span>
            <span className="mono dim" style={{ fontSize: 12.5 }}>{formatINR(p.basePrice)}</span>
          </div>
        ))}
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
          <UpNext />
          <HistoryFeed />
        </div>
      </main>
      <BidBar />
    </>
  );
}
