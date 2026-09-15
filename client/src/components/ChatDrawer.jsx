import React, { useEffect, useRef, useState } from 'react';
import Drawer from './Drawer.jsx';
import { useGame } from '../context/GameProvider.jsx';

const QUICK = ['Bidding war', 'Way overpaid', 'Bargain', 'Leave him', 'He is mine', 'gg'];

export default function ChatDrawer({ open, onClose }) {
  const { room, sendChat } = useGame();
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, room?.chat?.length]);

  const submit = (e) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    sendChat(value);
    setText('');
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Room chat"
      footer={
        <form onSubmit={submit} className="stack" style={{ paddingTop: 12, gap: 10 }}>
          <div className="quick-bids">
            {QUICK.map((q) => (
              <button key={q} type="button" className="btn sm ghost" onClick={() => sendChat(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="row">
            <input
              className="input"
              value={text}
              maxLength={200}
              placeholder="Say something…"
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn primary" type="submit">Send</button>
          </div>
        </form>
      }
    >
      <div className="chat-log" style={{ minHeight: 180 }}>
        {(room?.chat || []).length === 0 ? (
          <p className="dim" style={{ fontSize: 13 }}>No messages yet.</p>
        ) : (
          (room?.chat || []).map((m) => (
            <div className="chat-msg" key={m.id}>
              <b>{m.name}</b>
              {m.teamName ? <span className="dim" style={{ marginRight: 7 }}>{m.teamName}</span> : null}
              <span className="muted">{m.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </Drawer>
  );
}
