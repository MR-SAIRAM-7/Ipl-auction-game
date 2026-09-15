import React from 'react';
import { useGame } from '../context/GameProvider.jsx';

export default function Toasts() {
  const { toasts } = useGame();
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-type={t.type}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
