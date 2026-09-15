import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import Toasts from './components/Toasts.jsx';
import { useGame } from './context/GameProvider.jsx';

export default function App() {
  const { connected, room } = useGame();

  return (
    <div className="app">
      <Toasts />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!connected && room ? (
        <div className="offline-banner">Reconnecting to the auction…</div>
      ) : null}
    </div>
  );
}
