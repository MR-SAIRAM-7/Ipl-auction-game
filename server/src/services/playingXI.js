/**
 * Picking and validating a playing XI once the auction is over.
 *
 * Buying a squad is only half the game: a side that spent everything on batters has
 * to leave someone out, and in the IPL an overseas cap of four means the best eleven
 * on paper is often illegal. This module is the referee for that, and it runs on the
 * server so a client cannot submit a side that breaks the format's rules.
 *
 * The same validator is used to auto-pick, so a team that never submits still gets a
 * legal side judged at the end rather than being dropped from the standings.
 */
import { getFormat } from '../data/formats.js';
import { formatFit } from './playerModel.js';

const fit = (p, formatId) => p.profile?.formatFit ?? formatFit(p, formatId);

/**
 * Checks a proposed XI against the format. Returns every problem at once rather than
 * the first, so the client can show a checklist instead of one error at a time.
 */
export function validateXI({ squad, xiIds, captainId, keeperId, impactId, formatId }) {
  const format = getFormat(formatId);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const ids = [...new Set(xiIds || [])];
  const xi = ids.map((id) => byId.get(id)).filter(Boolean);
  const errors = [];

  if (xi.length !== format.xiSize) {
    errors.push(`Pick exactly ${format.xiSize} players (you have ${xi.length}).`);
  }
  if (ids.length !== xi.length) {
    errors.push('Some of those players are not in your squad.');
  }

  for (const [role, want] of Object.entries(format.shape)) {
    const count = xi.filter((p) => p.role === role).length;
    if (count < want.min) {
      const label = role === 'Wicket-keeper' ? 'wicket-keeper' : `${role.toLowerCase()}`;
      errors.push(`You need at least ${want.min} ${label}${want.min > 1 ? 's' : ''} (you have ${count}).`);
    }
  }

  const options = xi.filter((p) => p.role === 'Bowler' || p.role === 'All-rounder').length;
  if (options < format.minBowlingOptions) {
    errors.push(`You need ${format.minBowlingOptions} bowling options to get through the innings (you have ${options}).`);
  }

  if (format.maxOverseasInXI != null) {
    const overseas = xi.filter((p) => p.overseas).length;
    if (overseas > format.maxOverseasInXI) {
      errors.push(`Only ${format.maxOverseasInXI} overseas players are allowed in the XI (you have ${overseas}).`);
    }
  }

  if (!captainId || !ids.includes(captainId)) {
    errors.push('Name a captain from inside your XI.');
  }
  if (!keeperId || !ids.includes(keeperId)) {
    errors.push('Name a wicket-keeper from inside your XI.');
  } else {
    const keeper = byId.get(keeperId);
    if (keeper && keeper.role !== 'Wicket-keeper') {
      errors.push(`${keeper.name} is not a wicket-keeper.`);
    }
  }

  if (format.impactPlayer) {
    if (!impactId) {
      errors.push('Nominate an impact player from your bench.');
    } else if (ids.includes(impactId)) {
      errors.push('The impact player has to come from outside the XI.');
    } else if (!byId.has(impactId)) {
      errors.push('That impact player is not in your squad.');
    }
  }

  return { ok: errors.length === 0, errors, xi };
}

/**
 * Builds the best legal XI a squad can field, used when a team runs out of time or
 * never submits. Greedy by format fit, but it fills the mandatory slots first so the
 * result is always legal rather than merely the eleven best names.
 */
export function autoPickXI(squad, formatId) {
  const format = getFormat(formatId);
  const pool = [...squad].sort((a, b) => fit(b, formatId) - fit(a, formatId));
  const chosen = [];
  const taken = new Set();

  const overseasCap = format.maxOverseasInXI;
  const overseasCount = () => chosen.filter((p) => p.overseas).length;
  const canTake = (p) => !taken.has(p.id) && (overseasCap == null || !p.overseas || overseasCount() < overseasCap);

  const take = (p) => {
    if (!p) return false;
    chosen.push(p);
    taken.add(p.id);
    return true;
  };

  // 1. Mandatory role minimums, best first.
  for (const [role, want] of Object.entries(format.shape)) {
    for (let i = 0; i < want.min; i += 1) {
      take(pool.find((p) => p.role === role && canTake(p)));
    }
  }

  // 2. Enough bowling to get through the innings.
  while (
    chosen.filter((p) => p.role === 'Bowler' || p.role === 'All-rounder').length < format.minBowlingOptions &&
    chosen.length < format.xiSize
  ) {
    const next = pool.find((p) => (p.role === 'Bowler' || p.role === 'All-rounder') && canTake(p));
    if (!next) break;
    take(next);
  }

  // 3. Fill the rest with whoever is best and still legal.
  for (const p of pool) {
    if (chosen.length >= format.xiSize) break;
    if (canTake(p)) take(p);
  }

  // 4. If the overseas cap left us short, the squad simply cannot field a legal side;
  //    take the best of the rest so the team is still judged on something.
  for (const p of pool) {
    if (chosen.length >= format.xiSize) break;
    if (!taken.has(p.id)) take(p);
  }

  const keeper = chosen.find((p) => p.role === 'Wicket-keeper');
  const captain =
    chosen.find((p) => (p.tags || []).includes('Captain')) ||
    chosen.slice().sort((a, b) => fit(b, formatId) - fit(a, formatId))[0];
  const impact = format.impactPlayer ? pool.find((p) => !taken.has(p.id)) : null;

  return {
    xiIds: chosen.map((p) => p.id),
    captainId: captain?.id ?? null,
    keeperId: keeper?.id ?? null,
    impactId: impact?.id ?? null,
    auto: true,
  };
}

/** Resolves a team's stored selection into actual player objects for scoring. */
export function resolveXI(team, formatId) {
  const squad = team.squad || [];
  const sel = team.xi && team.xi.xiIds?.length ? team.xi : autoPickXI(squad, formatId);
  const byId = new Map(squad.map((p) => [p.id, p]));
  return {
    ...sel,
    players: (sel.xiIds || []).map((id) => byId.get(id)).filter(Boolean),
    captain: byId.get(sel.captainId) || null,
    keeper: byId.get(sel.keeperId) || null,
    impact: byId.get(sel.impactId) || null,
  };
}
