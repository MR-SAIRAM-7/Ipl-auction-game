import React, { useEffect } from 'react';
import Icon from './Icon.jsx';

export default function Drawer({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="spread" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16 }}>{title}</h3>
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer}
      </div>
    </>
  );
}
