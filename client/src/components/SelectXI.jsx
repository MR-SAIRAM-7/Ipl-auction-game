import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context/GameProvider.jsx';
import { formatINR, ROLE_SHORT } from '../lib/format.js';
import { announce, sfx } from '../lib/audio.js';
import { useCountdown } from '../hooks/useCountdown.js';

/**
 * Naming the side, after the auction and before the verdict.
 *
 * The server is the referee here - it re-validates whatever is submitted and will
 * auto-pick for anyone who runs out of time. This screen exists to make the same
 * rules legible while you are choosing, so you find out the overseas cap is blocking
 * you now rather than when the submission bounces.
 */

const ORDER = ['Batter', 'Wicket-keeper', 'All-rounder', 'Bowler'];

/** Mirrors the server's validator, so the checklist matches what submission enforces. */
function checkSelection({ squad, xiIds, captainId, keeperId, impactId, format }) {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const xi = xiIds.map((id) => byId.get(id)).filter(Boolean);
  const rules = [];

  rules.push({
    label: `${format.xiSize} players`,
    got: `${xi.length}/${format.xiSize}`,
    ok: xi.length === format.xiSize,
  });

  for (const [role, want] of Object.entries(format.shape || {})) {
    if (!want.min) continue;
    const count = xi.filter((p) => p.role === role).length;
    rules.push({
      label: `${want.min}+ ${role === 'Wicket-keeper' ? 'keeper' : role.toLowerCase()}${want.min > 1 ? 's' : ''}`,
      got: String(count),
      ok: count >= want.min,
    });
  }

  const options = xi.filter((p) => p.role === 'Bowler' || p.role === 'All-rounder').length;
  rules.push({
    label: `${format.minBowlingOptions}+ bowling options`,
    got: String(options),
    ok: options >= format.minBowlingOptions,
  });

  if (format.maxOverseasInXI != null) {
    const overseas = xi.filter((p) => p.overseas).length;
    rules.push({
      label: `Max ${format.maxOverseasInXI} overseas`,
      got: String(overseas),
      ok: overseas <= format.maxOverseasInXI,
    });
  }

  rules.push({ label: 'Captain named', got: captainId ? 'yes' : 'no', ok: Boolean(captainId) && xiIds.includes(captainId) });
  const keeper = byId.get(keeperId);
  rules.push({
    label: 'Keeper named',
    got: keeper ? keeper.name.split(' ').slice(-1)[0] : 'no',
    ok: Boolean(keeper) && keeper.role === 'Wicket-keeper' && xiIds.includes(keeperId),
  });
  if (format.impactPlayer) {
    rules.push({
      label: 'Impact player',
      got: impactId ? 'named' : 'no',
      ok: Boolean(impactId) && !xiIds.includes(impactId),
    });
  }

  return { rules, ok: rules.every((r) => r.ok), xi };
}

export default function SelectXI() {
  const { room, myTeam, submitXI, serverConfig, pushToast } = useGame();
  const [xiIds, setXiIds] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [keeperId, setKeeperId] = useState(null);
  const [impactId, setImpactId] = useState(null);
  const [sent, setSent] = useState(false);

  const format = useMemo(() => {
    const id = room?.settings?.format || 'ipl';
    return (serverConfig?.formats || []).find((f) => f.id === id) || {
      id,
      name: 'IPL',
      xiSize: 11,
      shape: {},
      minBowlingOptions: 5,
      impactPlayer: false,
      maxOverseasInXI: null,
    };
  }, [room?.settings?.format, serverConfig]);

  const squad = myTeam?.squad || [];
  const { seconds: left } = useCountdown(room?.selectionEndsAt, Boolean(room?.selectionEndsAt));

  // Default the keeper, since there is usually only one and it is never a surprise.
  useEffect(() => {
    if (keeperId) return;
    const k = squad.find((p) => p.role === 'Wicket-keeper');
    if (k) setKeeperId(k.id);
  }, [squad, keeperId]);

  useEffect(() => {
    announce('Auction complete. Name your playing eleven.');
  }, []);

  const { rules, ok, xi } = checkSelection({ squad, xiIds, captainId, keeperId, impactId, format });

  const toggle = (p) => {
    setXiIds((prev) => {
      if (prev.includes(p.id)) {
        if (captainId === p.id) setCaptainId(null);
        if (keeperId === p.id) setKeeperId(null);
        return prev.filter((id) => id !== p.id);
      }
      if (prev.length >= format.xiSize) {
        pushToast('error', `That is already ${format.xiSize}. Drop someone first.`);
        return prev;
      }
      if (impactId === p.id) setImpactId(null);
      return [...prev, p.id];
    });
  };

  const submit = async () => {
    const res = await submitXI({ xiIds, captainId, keeperId, impactId });
    if (!res.error) {
      sfx.sold();
      setSent(true);
      announce('Side submitted.');
    }
  };

  if (!myTeam) {
    return (
      <div className="overlay">
        <div>
          <h3>The auction is over</h3>
          <p className="muted" style={{ marginTop: 10, maxWidth: 380 }}>
            The franchises are naming their sides. The verdict follows once everyone has picked.
          </p>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="overlay">
        <div>
          <div className="spinner" />
          <h3>Side submitted</h3>
          <p className="muted" style={{ marginTop: 10, maxWidth: 380 }}>
            Waiting for the other franchises. The verdict comes as soon as everyone has named an XI.
          </p>
          <div className="xi-waiting">
            {(room?.teams || [])
              .filter((t) => (t.squad || []).length)
              .map((t) => (
                <span key={t.id} className={`xi-rule ${t.xiSubmitted ? 'ok' : ''}`}>
                  {t.xiSubmitted ? '✓' : '•'} {t.name}
                </span>
              ))}
          </div>
        </div>
      </div>
    );
  }

  const grouped = ORDER.map((role) => ({ role, players: squad.filter((p) => p.role === role) })).filter(
    (g) => g.players.length,
  );

  return (
    <main className="shell xi-shell">
      <header className="xi-head">
        <div>
          <div className="section-title">Name your {format.name} XI</div>
          <h2 style={{ margin: '4px 0 0' }}>{myTeam.name}</h2>
        </div>
        <div className={`xi-clock ${left > 0 && left <= 30 ? 'urgent' : ''}`}>
          {`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
          <span>left to pick</span>
        </div>
      </header>

      <section className="card xi-rules">
        {rules.map((r) => (
          <span key={r.label} className={`xi-rule ${r.ok ? 'ok' : 'bad'}`}>
            {r.ok ? '✓' : '•'} {r.label} <b>{r.got}</b>
          </span>
        ))}
      </section>

      <div className="xi-pick-grid">
        <section className="card">
          <div className="section-title">Your squad — tap to pick</div>
          {grouped.map((g) => (
            <div key={g.role}>
              <div className="xi-group">{g.role}s</div>
              {g.players.map((p) => {
                const picked = xiIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(p)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(p)}
                    className={`squad-row xi-row ${picked ? 'picked' : ''} ${impactId === p.id ? 'impact' : ''}`}
                  >
                    <span className="rl">{ROLE_SHORT[p.role]}</span>
                    <span className="nm">
                      {p.name}
                      {p.overseas && <span className="xi-badge">OS</span>}
                      {captainId === p.id && <span className="xi-badge c">C</span>}
                      {keeperId === p.id && <span className="xi-badge wk">WK</span>}
                      {impactId === p.id && <span className="xi-badge imp">IMPACT</span>}
                    </span>
                    <span className="dim mono" style={{ fontSize: 11.5 }}>
                      {p.profile?.formatFit ?? p.rating}
                    </span>
                    <span className="mono dim" style={{ fontSize: 12.5 }}>{formatINR(p.price ?? 0)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </section>

        <section className="card">
          <div className="section-title">Roles</div>

          <label className="xi-label" htmlFor="xi-captain">Captain</label>
          <select id="xi-captain" value={captainId || ''} onChange={(e) => setCaptainId(e.target.value || null)}>
            <option value="">Pick a captain…</option>
            {xi.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="xi-label" htmlFor="xi-keeper">Wicket-keeper</label>
          <select id="xi-keeper" value={keeperId || ''} onChange={(e) => setKeeperId(e.target.value || null)}>
            <option value="">Pick a keeper…</option>
            {xi.filter((p) => p.role === 'Wicket-keeper').map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {format.impactPlayer && (
            <>
              <label className="xi-label" htmlFor="xi-impact">Impact player</label>
              <select id="xi-impact" value={impactId || ''} onChange={(e) => setImpactId(e.target.value || null)}>
                <option value="">Pick from the bench…</option>
                {squad.filter((p) => !xiIds.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.role}</option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                The impact player comes from outside your XI and can replace anyone mid-match.
              </p>
            </>
          )}

          <button type="button" className="btn primary block" disabled={!ok} onClick={submit} style={{ marginTop: 18 }}>
            {ok ? 'Submit this side' : 'Not a legal side yet'}
          </button>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            If the clock runs out, the best legal side your squad can field is picked for you.
          </p>
        </section>
      </div>
    </main>
  );
}
