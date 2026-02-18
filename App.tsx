import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CanvasBoard } from './components/CanvasBoard';
import { ColorPalette } from './components/ColorPalette';
import { StatusOverlay } from './components/StatusOverlay';
import { useGameConnection } from './hooks/useGameConnection';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { PixelData, ViewportTransform, ToolMode, FloatingLabel, BatchPixel } from './types';
import { getRgbFromIndex } from './utils/colors';

// ---- Lobby Screen ----
const LobbyScreen: React.FC<{ onJoin: (name: string) => void }> = ({ onJoin }) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      onJoin(trimmed.slice(0, 20));
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[100]">
      <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 max-w-sm w-full mx-4">
        <h1 className="text-white font-black text-3xl tracking-tight">NullDraw</h1>
        <p className="text-neutral-400 text-sm text-center">Enter a name to join the canvas</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name..."
          maxLength={20}
          className="w-full bg-neutral-800 text-white text-lg px-4 py-3 rounded-xl border border-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 placeholder-neutral-500"
        />
        <button
          type="submit"
          disabled={name.trim().length === 0}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg"
        >
          Join Canvas
        </button>
      </form>
    </div>
  );
};

// ---- Main App ----
const GameScreen: React.FC<{ username: string }> = ({ username }) => {
  const pixelsRef = useRef<Uint8Array | null>(new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT));
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  
  const [selectedColor, setSelectedColor] = useState<number>(3);
  const [hoveredCoords, setHoveredCoords] = useState<{x: number, y: number} | null>(null);
  const [tool, setTool] = useState<ToolMode>('PAN');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [floatingLabels, setFloatingLabels] = useState<FloatingLabel[]>([]);
  
  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, scale: 1 });

  const fitToScreen = useCallback(() => {
    const padding = 20;
    const availableWidth = window.innerWidth - padding * 2;
    const availableHeight = window.innerHeight - padding * 2;
    const scaleX = availableWidth / CANVAS_WIDTH;
    const scaleY = availableHeight / CANVAS_HEIGHT;
    const scale = Math.min(scaleX, scaleY, 50);
    const centeredX = (window.innerWidth - (CANVAS_WIDTH * scale)) / 2;
    const centeredY = (window.innerHeight - (CANVAS_HEIGHT * scale)) / 2;
    setViewport({ x: centeredX, y: centeredY, scale });
  }, []);

  useEffect(() => { fitToScreen(); }, [fitToScreen]);

  // Floating label cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloatingLabels(prev => {
        const filtered = prev.filter(l => now - l.timestamp < 2000);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const [canvasVersion, setCanvasVersion] = useState(0);

  // Batched rendering: queue incoming pixels, flush via rAF
  const pendingPixelsRef = useRef<PixelData[]>([]);
  const rafRef = useRef<number | null>(null);

  const flushPendingPixels = useCallback(() => {
    rafRef.current = null;
    const pending = pendingPixelsRef.current;
    if (pending.length === 0) return;
    pendingPixelsRef.current = [];

    const canvas = canvasElRef.current;
    const ctx = canvas?.getContext('2d');

    // Track which usernames we've already shown a label for this batch
    const labeledUsers = new Set<string>();

    for (const p of pending) {
      if (pixelsRef.current) {
        pixelsRef.current[p.y * CANVAS_WIDTH + p.x] = p.colorIndex;
      }
      if (ctx) {
        const [r, g, b] = getRgbFromIndex(p.colorIndex);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
      // Only show one floating label per username per batch
      if (p.username && !labeledUsers.has(p.username)) {
        labeledUsers.add(p.username);
        setFloatingLabels(prev => [
          ...prev,
          { id: Math.random().toString(), x: p.x, y: p.y, text: p.username!, timestamp: Date.now() }
        ]);
      }
    }
  }, []);

  const queuePixelRender = useCallback((pixel: PixelData) => {
    pendingPixelsRef.current.push(pixel);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPendingPixels);
    }
  }, [flushPendingPixels]);

  const handlePixelUpdate = useCallback((pixel: PixelData) => {
    queuePixelRender(pixel);
  }, [queuePixelRender]);

  const handleBatchUpdate = useCallback((pixels: PixelData[]) => {
    for (const p of pixels) {
      pendingPixelsRef.current.push(p);
    }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPendingPixels);
    }
  }, [flushPendingPixels]);

  const handleFullUpdate = useCallback((buffer: Uint8Array) => {
    pixelsRef.current = buffer;
    setCanvasVersion(n => n + 1);
  }, []);

  const { isConnected, userCount, placePixel, placePixelBatch, sendFill } = useGameConnection({
    onPixelUpdate: handlePixelUpdate,
    onBatchUpdate: handleBatchUpdate,
    onFullUpdate: handleFullUpdate,
    username
  });

  // Single pixel place (used for legacy single-pixel mode — CanvasBoard now uses batch)
  const handlePlacePixel = useCallback((x: number, y: number, colorIndex: number) => {
    if (pixelsRef.current) {
      pixelsRef.current[y * CANVAS_WIDTH + x] = colorIndex;
    }
    const canvas = canvasElRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      const [r, g, b] = getRgbFromIndex(colorIndex);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
    placePixel(x, y, colorIndex);
  }, [placePixel]);

  const handlePlacePixelBatch = useCallback((pixels: BatchPixel[]) => {
    // Already applied optimistically in CanvasBoard, just send to server
    placePixelBatch(pixels);
  }, [placePixelBatch]);

  const handleFill = useCallback((x: number, y: number, colorIndex: number) => {
    sendFill(x, y, colorIndex);
  }, [sendFill]);

  // Eyedropper: pick color and switch back to draw
  const handlePickColor = useCallback((colorIndex: number) => {
    setSelectedColor(colorIndex);
    setTool('DRAW');
  }, []);

  const handleZoomIn = () => {
    setViewport(prev => {
      const scale = Math.min(100, prev.scale * 1.5);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return { x: cx - (cx - prev.x) * (scale / prev.scale), y: cy - (cy - prev.y) * (scale / prev.scale), scale };
    });
  };

  const handleZoomOut = () => {
    setViewport(prev => {
      const scale = Math.max(0.1, prev.scale / 1.5);
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      return { x: cx - (cx - prev.x) * (scale / prev.scale), y: cy - (cy - prev.y) * (scale / prev.scale), scale };
    });
  };

  return (
    <div className="relative w-screen h-screen bg-transparent overflow-hidden select-none">
      <CanvasBoard 
        pixelsRef={pixelsRef}
        selectedColor={selectedColor}
        onPlacePixel={handlePlacePixel}
        onPlacePixelBatch={handlePlacePixelBatch}
        onFill={handleFill}
        onPickColor={handlePickColor}
        viewport={viewport}
        setViewport={setViewport}
        onHover={setHoveredCoords}
        tool={tool}
        brushSize={brushSize}
        canvasElRef={canvasElRef}
        canvasVersion={canvasVersion}
      />

      {/* Floating Labels */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {floatingLabels.map(label => {
          const screenX = viewport.x + label.x * viewport.scale;
          const screenY = viewport.y + label.y * viewport.scale;
          if (screenX < -50 || screenY < -50 || screenX > window.innerWidth || screenY > window.innerHeight) return null;
          return (
            <div 
              key={label.id}
              className="absolute bg-blue-600/90 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm pointer-events-none whitespace-nowrap z-40 transition-opacity duration-500"
              style={{
                left: screenX,
                top: screenY - 24,
                opacity: Math.max(0, 1 - (Date.now() - label.timestamp) / 2000),
                transform: 'translateX(-50%)'
              }}
            >
              {label.text}
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 pointer-events-none flex flex-col">
        <StatusOverlay 
          userCount={userCount} 
          cooldownExpiry={0}
          isConnected={isConnected}
          hoveredCoords={hoveredCoords}
          currentTool={tool}
          onSetTool={setTool}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRecenter={fitToScreen}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
        />
        
        <div className="mt-auto mb-20 w-full flex justify-center pointer-events-auto">
          <ColorPalette 
            selectedColor={selectedColor} 
            onSelectColor={setSelectedColor} 
          />
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [username, setUsername] = useState<string | null>(null);

  if (!username) {
    return <LobbyScreen onJoin={setUsername} />;
  }

  return <GameScreen username={username} />;
};

export default App;