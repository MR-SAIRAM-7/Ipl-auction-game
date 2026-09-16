import React, { useState } from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { SquadSheet } from './SquadsDrawer.jsx';
import { formatINR, metricLabel, textOn } from '../lib/format.js';
import Icon from './Icon.jsx';
import VoiceDock from './VoiceDock.jsx';

function Metrics({ metrics, labels }) {
  const entries = Object.entries(metrics || {});
  if (!entries.length) return null;
  return (
    <div className="metrics">
      {entries.map(([key, value]) => {
        const v = Math.max(0, Math.min(100, Number(value) || 0));
        return (
          <div className="metric" key={key}>
            <span className="dim">{labels?.[key] || metricLabel(key)}</span>
            <span className="mtrack"><i style={{ width: `${v}%` }} /></span>
            <span className="mval mono">{Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RankCard({ entry, team, settings, defaultOpen, result }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="card rank-card" data-rank={entry.rank}>
      <div className="row" style={{ gap: 10 }}>
        <span className="rank-badge">{entry.rank}</span>
        <span
          className="crest"
          style={{ background: team?.color || '#5a6472', color: textOn(team?.color || '#5a6472') }}
        >
          {team?.shortName || '—'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15.5 }}>{entry.teamName}</h3>
          <div className="dim" style={{ fontSize: 12.5 }}>
            {team ? `${team.squad.length} players · ${formatINR(settings.purse - team.purse)} spent` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="score-big mono">{Math.round(entry.overallScore)}</div>
          <small className="dim" style={{ fontSize: 10.5 }}>/ 100</small>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>{entry.verdict}</p>

      <div className="chips" style={{ marginTop: 12 }}>
        {(entry.strengths || []).map((s, i) => <span className="chip-good" key={`s${i}`}>{s}</span>)}
        {(entry.weaknesses || []).map((w, i) => <span className="chip-bad" key={`w${i}`}>{w}</span>)}
      </div>

      <button type="button" className="btn sm ghost block" style={{ marginTop: 14 }} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide breakdown' : 'Metrics, best XI and squad'}
      </button>

      {open ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <Metrics metrics={entry.metrics} labels={result?.metricLabels} />

          {entry.xi?.players?.length ? (
            <div>
              <div className="section-title" style={{ marginTop: 6 }}>
                The XI they picked{entry.xi.auto ? ' · auto-selected' : ''}
              </div>
              <div className="xi-grid">
                {entry.xi.players.map((p, i) => (
                  <div className="xi-item" key={p.id || `${p.name}-${i}`}>
                    <i>{i + 1}</i>
                    <span className="xi-item-name">
                      {p.name}
                      {p.isCaptain && <b className="xi-badge c">C</b>}
                      {p.isKeeper && <b className="xi-badge wk">WK</b>}
                      {p.overseas && <b className="xi-badge">OS</b>}
                    </span>
                    <em className="mono" title="Pedigree / current form / format fit">
                      {p.legacy}·{p.primeForm}·{p.formatFit}
                    </em>
                  </div>
                ))}
              </div>
              <div className="xi-legend dim">
                Each player reads <b>pedigree · form · {result?.formatName || 'format'} fit</b>, out of 100.
                {entry.xi.impact ? ` Impact player: ${entry.xi.impact}.` : ''}
              </div>
              {entry.xiVerdict ? <p className="muted" style={{ marginTop: 10 }}>{entry.xiVerdict}</p> : null}
            </div>
          ) : null}

          {team ? (
            <div>
              <div className="section-title" style={{ marginTop: 6 }}>Full squad</div>
              <SquadSheet team={team} settings={settings} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function Results() {
  const { room, me, evaluating, reset } = useGame();
  const result = room?.result;

  if (evaluating || !result) {
    return (
      <div className="overlay">
        <div>
          <div className="spinner" />
          <h3>Judging the squads</h3>
          <p className="muted" style={{ marginTop: 10, maxWidth: 340 }}>
            Weighing every XI on the criteria that matter in this format - pedigree, current form and the
            raw record, then the shape of the side as a unit.
          </p>
        </div>
      </div>
    );
  }

  const rankings = result.rankings || [];
  const winner = rankings.find((r) => r.teamId === result.winnerTeamId) || rankings[0];
  const winnerTeam = room.teams.find((t) => t.id === winner?.teamId);

  return (
    <main className="shell results">
      <section className="card winner-card full">
        <span className="label">{result.formatName ? `${result.formatName} champion` : 'Auction champion'}</span>
        <h2>{winner?.teamName || 'No winner'}</h2>
        {result.headline ? <p className="headline">{result.headline}</p> : null}
        {winnerTeam ? (
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <span className="pill">Score <b>{Math.round(winner.overallScore)}/100</b></span>
            <span className="pill">{winnerTeam.squad.length} players</span>
            <span className="pill">{formatINR(room.settings.purse - winnerTeam.purse)} spent</span>
          </div>
        ) : null}
        {result.keyMatchup ? <p className="muted" style={{ marginTop: 14 }}>{result.keyMatchup}</p> : null}
        <p className="dim" style={{ fontSize: 11.5, marginTop: 14 }}>
          {result.source === 'gemini' ? 'Judged by Gemini' : 'Judged by the built-in balance model'}
          {result.formatName ? ` · scored on ${result.formatName} criteria` : ''}
        </p>
      </section>

      <div className="full">
        <VoiceDock />
      </div>

      {result.summary ? (
        <section className="card full">
          <div className="section-title">The analyst&apos;s take</div>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>{result.summary}</p>
        </section>
      ) : null}

      <section className="card">
        <div className="section-title">Best buy</div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{result.bestBuy?.playerName}</div>
        <div className="dim" style={{ fontSize: 12.5 }}>{result.bestBuy?.teamName}</div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{result.bestBuy?.reason}</p>
      </section>

      <section className="card">
        <div className="section-title">Worst buy</div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{result.worstBuy?.playerName}</div>
        <div className="dim" style={{ fontSize: 12.5 }}>{result.worstBuy?.teamName}</div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{result.worstBuy?.reason}</p>
      </section>

      <div className="full stack">
        <div className="section-title">Final standings</div>
        {rankings.map((entry, i) => (
          <RankCard
            key={entry.teamId}
            entry={entry}
            team={room.teams.find((t) => t.id === entry.teamId)}
            settings={room.settings}
            result={result}
            defaultOpen={i === 0}
          />
        ))}
      </div>

      {me.isHost ? (
        <section className="card full">
          <button type="button" className="btn primary block" onClick={reset}>
            <Icon name="refresh" size={15} /> Run another auction with the same teams
          </button>
        </section>
      ) : (
        <p className="dim full" style={{ textAlign: 'center', fontSize: 13 }}>
          The host can start a fresh auction with the same teams.
        </p>
      )}
    </main>
  );
}
