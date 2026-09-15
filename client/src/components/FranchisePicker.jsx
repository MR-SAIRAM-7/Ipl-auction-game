import React, { useEffect, useRef, useState } from 'react';
import { emitAck } from '../lib/socket.js';
import { textOn } from '../lib/format.js';

export const NEW_FRANCHISE = 'new';
const POLL_MS = 4000;

/**
 * Lets someone joining a room either take a seat at a franchise that is already
 * there - sharing its purse, like an owner and their coach at the same table -
 * or start one of their own.
 *
 * It also reports whether this browser already holds a seat, so returning to a room
 * you are already in offers "rejoin" rather than quietly handing you a second one.
 */
export default function FranchisePicker({ code, playerId, selected, onSelect, onSeatChange }) {
  const [state, setState] = useState({ loading: false, room: null, error: null });
  const seatRef = useRef(null);

  useEffect(() => {
    if (!code || code.length < 4) {
      setState({ loading: false, room: null, error: null });
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const load = async (showSpinner) => {
      if (showSpinner) setState((s) => ({ ...s, loading: true, error: null }));
      const res = await emitAck('room:peek', { code, playerId });
      if (cancelled) return;

      if (res.error) {
        setState({ loading: false, room: null, error: res.error });
      } else {
        setState({ loading: false, room: res, error: null });
        if (seatRef.current !== res.seatedTeamId) {
          seatRef.current = res.seatedTeamId;
          onSeatChange?.(res.seatedTeamId, res.seatedTeamName);
        }
      }
      timer = setTimeout(() => load(false), POLL_MS);
    };

    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [code, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) return <p className="dim" style={{ fontSize: 12.5 }}>Looking up room {code}…</p>;
  if (state.error) return <p style={{ fontSize: 12.5, color: 'var(--neg)' }}>{state.error}</p>;
  if (!state.room) return null;

  const { teams, status, seatedTeamId } = state.room;
  const live = status !== 'lobby';

  return (
    <div className="field">
      <span className="label">Join a franchise</span>

      <div className="franchise-list">
        {teams.map((t) => {
          const mine = t.id === seatedTeamId;
          const full = t.full && !mine;
          return (
            <button
              type="button"
              key={t.id}
              className="franchise-option"
              data-on={selected === t.id}
              disabled={full}
              onClick={() => onSelect(t.id)}
            >
              <span className="crest sm" style={{ background: t.color, color: textOn(t.color) }}>{t.shortName}</span>
              <span className="fo-body">
                <span className="fo-name">
                  {t.name}
                  {mine ? <span className="fo-tag">your seat</span> : null}
                </span>
                <span className="fo-members">
                  {full
                    ? 'This table is full'
                    : `${t.members.map((m) => m.name).join(', ')}${t.squadCount ? ` · ${t.squadCount} bought` : ''}`}
                </span>
              </span>
              <span className="fo-mark" aria-hidden="true" />
            </button>
          );
        })}

        <button
          type="button"
          className="franchise-option"
          data-on={selected === NEW_FRANCHISE}
          onClick={() => onSelect(NEW_FRANCHISE)}
          disabled={live}
        >
          <span className="crest sm fo-plus">+</span>
          <span className="fo-body">
            <span className="fo-name">{seatedTeamId ? 'Start a second franchise' : 'Start a new franchise'}</span>
            <span className="fo-members">
              {live
                ? 'The auction has started — you can only join an existing table now'
                : seatedTeamId
                  ? 'Sits you down as a separate person in this tab'
                  : 'Your own purse and squad'}
            </span>
          </span>
          <span className="fo-mark" aria-hidden="true" />
        </button>
      </div>

      <span className="dim" style={{ fontSize: 11.5 }}>
        {seatedTeamId
          ? 'You already hold a seat here — pick it to rejoin, or pick another franchise to sit down as a second person in this tab.'
          : 'Everyone at a franchise shares one purse and can bid for it. Up to 8 per table.'}
      </span>
    </div>
  );
}
