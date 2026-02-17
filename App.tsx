import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CanvasBoard } from './components/CanvasBoard';
import { ColorPalette } from './components/ColorPalette';
import { StatusOverlay } from './components/StatusOverlay';
import { useGameConnection } from './hooks/useGameConnection';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { PixelData, ViewportTransform, ToolMode, FloatingLabel } from './types';
import { getRgbFromIndex } from './utils/colors';

const App: React.FC = () => {
  // Initialize immediately for offline support
  const pixelsRef = useRef<Uint8Array | null>(new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT));
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  
  // State for UI
  const [selectedColor, setSelectedColor] = useState<number>(3); // Default black
  const [hoveredCoords, setHoveredCoords] = useState<{x: number, y: number} | null>(null);
  const [tool, setTool] = useState<ToolMode>('PAN');
  const [floatingLabels, setFloatingLabels] = useState<FloatingLabel[]>([]);
  
  // Viewport state (Zoom/Pan)
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 0, 
    y: 0,
    scale: 1,
  });

  // Calculate fit-to-screen on mount
  const fitToScreen = useCallback(() => {
    const padding = 20;
    const availableWidth = window.innerWidth - padding * 2;
    const availableHeight = window.innerHeight - padding * 2;
    
    const scaleX = availableWidth / CANVAS_WIDTH;
    const scaleY = availableHeight / CANVAS_HEIGHT;
    
    const scale = Math.min(scaleX, scaleY, 50); 
    
    const centeredX = (window.innerWidth - (CANVAS_WIDTH * scale)) / 2;
    const centeredY = (window.innerHeight - (CANVAS_HEIGHT * scale)) / 2;

    setViewport({
        x: centeredX,
        y: centeredY,
        scale: scale
    });
  }, []);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFloatingLabels(prev => prev.filter(l => now - l.timestamp < 2000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const [canvasVersion, setCanvasVersion] = useState(0);

  // Helper to draw a single pixel to the DOM canvas directly
  const drawPixelToCanvas = useCallback((x: number, y: number, colorIndex: number) => {
    const canvas = canvasElRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const [r, g, b] = getRgbFromIndex(colorIndex);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, []);

  const handlePixelUpdate = useCallback((pixel: PixelData) => {
    if (pixelsRef.current) {
      const idx = pixel.y * CANVAS_WIDTH + pixel.x;
      // Update memory
      pixelsRef.current[idx] = pixel.colorIndex;
      // Draw
      drawPixelToCanvas(pixel.x, pixel.y, pixel.colorIndex);

      if (pixel.username) {
        setFloatingLabels(prev => [
          ...prev, 
          { 
            id: Math.random().toString(),
            x: pixel.x, 
            y: pixel.y, 
            text: pixel.username!, 
            timestamp: Date.now() 
          }
        ]);
      }
    }
  }, [drawPixelToCanvas]);

  const handleFullUpdate = useCallback((buffer: Uint8Array) => {
    pixelsRef.current = buffer;
    setCanvasVersion(n => n + 1); // triggers CanvasBoard to redraw immediately
  }, []);

  const { isConnected, userCount, placePixel } = useGameConnection({
    onPixelUpdate: handlePixelUpdate,
    onFullUpdate: handleFullUpdate
  });

  const handlePlacePixel = useCallback((x: number, y: number, colorIndex: number) => {
      handlePixelUpdate({ x, y, colorIndex });
      placePixel(x, y, colorIndex);
  }, [handlePixelUpdate, placePixel]);

  const handleZoomIn = () => {
    setViewport(prev => {
        const scale = Math.min(100, prev.scale * 1.5);
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const x = cx - (cx - prev.x) * (scale / prev.scale);
        const y = cy - (cy - prev.y) * (scale / prev.scale);
        return { x, y, scale };
    });
  };

  const handleZoomOut = () => {
    setViewport(prev => {
        const scale = Math.max(0.1, prev.scale / 1.5);
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const x = cx - (cx - prev.x) * (scale / prev.scale);
        const y = cy - (cy - prev.y) * (scale / prev.scale);
        return { x, y, scale };
    });
  };

  return (
    <div className="relative w-screen h-screen bg-transparent overflow-hidden select-none">
      <CanvasBoard 
        pixelsRef={pixelsRef}
        selectedColor={selectedColor}
        onPlacePixel={handlePlacePixel}
        viewport={viewport}
        setViewport={setViewport}
        onHover={setHoveredCoords}
        tool={tool}
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
            )
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

export default App;