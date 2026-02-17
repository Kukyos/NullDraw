import React, { useEffect, useState } from 'react';
import { ToolMode } from '../types';

interface StatusOverlayProps {
  userCount: number;
  cooldownExpiry: number;
  isConnected: boolean;
  hoveredCoords: { x: number, y: number } | null;
  currentTool: ToolMode;
  onSetTool: (tool: ToolMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

export const StatusOverlay: React.FC<StatusOverlayProps> = ({ 
  userCount, 
  cooldownExpiry, 
  isConnected, 
  hoveredCoords,
  currentTool,
  onSetTool,
  onZoomIn,
  onZoomOut,
  onRecenter
}) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownExpiry - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(timer);
  }, [cooldownExpiry]);

  return (
    <div className="pointer-events-none w-full h-full flex flex-col justify-between p-4 relative z-50">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col gap-2">
            <div className="bg-neutral-900/90 backdrop-blur text-white px-4 py-2 rounded-lg border border-neutral-700 shadow-xl flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight">PixelPlacer</h1>
                {!isConnected && <span className="text-xs text-red-500 font-mono">(Offline)</span>}
            </div>
            {/* Coordinates Display */}
            <div className="bg-neutral-900/90 backdrop-blur text-neutral-300 px-3 py-1.5 rounded-lg border border-neutral-700 shadow-xl text-sm font-mono self-start min-w-[100px]">
                {hoveredCoords ? (
                    <span>X:{hoveredCoords.x} Y:{hoveredCoords.y}</span>
                ) : (
                    <span className="text-neutral-500">X:-- Y:--</span>
                )}
            </div>
        </div>
        
        <div className="flex gap-2">
           <div className="bg-neutral-900/90 backdrop-blur text-neutral-300 px-3 py-2 rounded-lg border border-neutral-700 shadow-xl text-sm font-mono flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            {userCount} Online
          </div>
        </div>
      </div>

      {/* Center Cooldown */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {timeLeft > 0 && (
              <div className="bg-red-500/90 backdrop-blur text-white px-8 py-4 rounded-2xl shadow-2xl text-3xl font-black animate-pulse border-4 border-red-600/50 flex flex-col items-center">
                  <span className="text-xs uppercase tracking-widest opacity-80 mb-1">Cooldown</span>
                  {timeLeft}s
              </div>
          )}
      </div>

      {/* Bottom Controls Container */}
      <div className="flex items-end justify-between pointer-events-auto w-full max-w-4xl mx-auto">
        
        {/* Mode Switcher (Left/Center) */}
        <div className="bg-neutral-900/90 backdrop-blur p-1.5 rounded-xl border border-neutral-700 shadow-xl flex gap-1">
            <button 
                onClick={() => onSetTool('PAN')}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                    currentTool === 'PAN' 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                PAN
            </button>
            <button 
                onClick={() => onSetTool('DRAW')}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                    currentTool === 'DRAW' 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                DRAW
            </button>
        </div>

        {/* Zoom Controls (Right) */}
        <div className="flex flex-col gap-2">
            <button onClick={onZoomIn} className="w-10 h-10 bg-neutral-800 text-white rounded-lg border border-neutral-600 shadow-lg hover:bg-neutral-700 active:scale-95 flex items-center justify-center font-bold text-xl" title="Zoom In">+</button>
            <button onClick={onZoomOut} className="w-10 h-10 bg-neutral-800 text-white rounded-lg border border-neutral-600 shadow-lg hover:bg-neutral-700 active:scale-95 flex items-center justify-center font-bold text-xl" title="Zoom Out">-</button>
            <button onClick={onRecenter} className="w-10 h-10 bg-neutral-800 text-white rounded-lg border border-neutral-600 shadow-lg hover:bg-neutral-700 active:scale-95 flex items-center justify-center" title="Fit to Screen">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
        </div>
      </div>

    </div>
  );
};