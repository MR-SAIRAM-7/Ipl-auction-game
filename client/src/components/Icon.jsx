import React from 'react';

/**
 * A tiny stroke-icon set. Everything is drawn on a 24px grid with the same
 * 1.7 stroke weight so the UI keeps one visual voice instead of a pile of emoji.
 */
const PATHS = {
  users: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="7.5" r="3.2" />
      <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 4.7a3.2 3.2 0 0 1 0 5.7" />
    </>
  ),
  message: <path d="M20 12.5a6.5 6.5 0 0 1-6.5 6.5H8l-4 3v-9.5A6.5 6.5 0 0 1 10.5 6h3A6.5 6.5 0 0 1 20 12.5Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 5a3 3 0 0 0-6 0v5m0 2.4A3 3 0 0 0 15 11v-.4" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 10 5.5M18.5 11.5c0 .7-.1 1.4-.3 2M12 18v3" />
      <path d="M4 3l16 18" />
    </>
  ),
  headphones: <path d="M4 15v-2a8 8 0 0 1 16 0v2M4 14h2.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Zm16 0h-2.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-5Z" />,
  share: (
    <>
      <path d="M12 3v12M8 6.5 12 3l4 3.5" />
      <path d="M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9" />
      <path d="M20 4v5h-5M4 20v-5h5" />
    </>
  ),
  send: <path d="M4 12 20 4l-4 16-4.5-6.5L4 12Z" />,
};

export default function Icon({ name, size = 17, strokeWidth = 1.7, ...rest }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {body}
    </svg>
  );
}
