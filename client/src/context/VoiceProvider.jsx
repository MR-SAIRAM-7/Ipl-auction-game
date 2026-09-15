import React, { createContext, useContext } from 'react';
import { useVoice } from '../hooks/useVoice.js';
import { useGame } from './GameProvider.jsx';

const VoiceContext = createContext(null);
export const useVoiceSession = () => useContext(VoiceContext);

/**
 * Holds the one voice session for a room.
 *
 * This has to live above the screens, not inside them. The dock used to own the
 * session from inside the auction floor, so every status change - lobby to
 * generating to auction to finished - unmounted it and quietly hung up on
 * everyone. Mounted here it survives all of that; the dock is just a view of it.
 */
export function VoiceProvider({ children }) {
  const { serverConfig } = useGame();
  const voice = useVoice({ iceServers: serverConfig?.iceServers });
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}
