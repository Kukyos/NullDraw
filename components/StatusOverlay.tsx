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
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
}

const ToolButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active, onClick, label, icon }) => (
  <button 
    onClick={onClick}
    className={`px-3 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
      active 
        ? 'bg-blue-600 text-white shadow-lg' 
        : 'text-neutral-400 hover:text-white hover:bg-white/10'
    }`}
    title={label}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

export const StatusOverlay: React.FC<StatusOverlayProps> = ({ 
  userCount, 
  cooldownExpiry, 
  isConnected, 
  hoveredCoords,
  currentTool,
  onSetTool,
  onZoomIn,
  onZoomOut,
  onRecenter,
  brushSize,
  onBrushSizeChange
}) => {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownExpiry - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(timer);
  }, [cooldownExpiry]);

  const showBrushSize = currentTool === 'DRAW' || currentTool === 'ERASE';
  const maxBrush = currentTool === 'ERASE' ? 10 : 5;
  const quickButtons = currentTool === 'ERASE' ? [1, 2, 3, 5, 7, 10] : [1, 2, 3, 4, 5];

  return (
    <div className="pointer-events-none w-full h-full flex flex-col justify-between p-4 relative z-50">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex flex-col gap-2">
            <div className="bg-neutral-900/90 backdrop-blur text-white px-4 py-2 rounded-lg border border-neutral-700 shadow-xl flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight">NullDraw</h1>
                {!isConnected && <span className="text-xs text-red-500 font-mono">(Offline)</span>}
            </div>
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

      {/* Bottom Controls */}
      <div className="flex items-end justify-between pointer-events-auto w-full">
        
        <div className="flex flex-col gap-2">
          {/* Tool Switcher */}
          <div className="bg-neutral-900/90 backdrop-blur p-1.5 rounded-xl border border-neutral-700 shadow-xl flex gap-1 flex-wrap">
              <ToolButton active={currentTool === 'PAN'} onClick={() => onSetTool('PAN')} label="PAN"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>}
              />
              <ToolButton active={currentTool === 'DRAW'} onClick={() => onSetTool('DRAW')} label="DRAW"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
              />
              <ToolButton active={currentTool === 'ERASE'} onClick={() => onSetTool('ERASE')} label="ERASE"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
              />
              <ToolButton active={currentTool === 'FILL'} onClick={() => onSetTool('FILL')} label="FILL"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
              />
              <ToolButton active={currentTool === 'EYEDROPPER'} onClick={() => onSetTool('EYEDROPPER')} label="PICK"
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>}
              />
          </div>

          {/* Brush Size (only for draw/erase) */}
          {showBrushSize && (
            <div className="bg-neutral-900/90 backdrop-blur p-2 rounded-xl border border-neutral-700 shadow-xl flex items-center gap-2">
              <span className="text-neutral-400 text-xs font-mono w-12">Size {brushSize}</span>
              <input
                type="range"
                min={1}
                max={maxBrush}
                value={Math.min(brushSize, maxBrush)}
                onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <div className="flex gap-1">
                {quickButtons.map(s => (
                  <button
                    key={s}
                    onClick={() => onBrushSizeChange(s)}
                    className={`w-6 h-6 rounded text-xs font-bold transition-all ${
                      brushSize === s ? 'bg-blue-600 text-white' : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Zoom Controls */}
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