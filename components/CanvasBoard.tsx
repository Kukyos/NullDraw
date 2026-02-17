import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { ViewportTransform, ToolMode } from '../types';
import { getRgbFromIndex } from '../utils/colors';

interface CanvasBoardProps {
  pixelsRef: React.MutableRefObject<Uint8Array | null>;
  selectedColor: number;
  onPlacePixel: (x: number, y: number, colorIndex: number) => void;
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onHover?: (coords: {x: number, y: number} | null) => void;
  tool: ToolMode;
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  canvasVersion?: number;
}

export const CanvasBoard: React.FC<CanvasBoardProps> = ({ 
  pixelsRef, 
  selectedColor, 
  onPlacePixel,
  viewport,
  setViewport,
  onHover,
  tool,
  canvasElRef,
  canvasVersion
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external ref with internal ref
  useEffect(() => {
    if (canvasElRef) {
      canvasElRef.current = canvasRef.current;
    }
  });
  
  // Interaction state
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastPixelPlaced = useRef<{x: number, y: number} | null>(null);
  const [hoverPixel, setHoverPixel] = useState<{x: number, y: number} | null>(null);

  // Redraw function
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelsRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixels = pixelsRef.current;
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imageData.data;

    for (let i = 0; i < pixels.length; i++) {
      const colorIndex = pixels[i];
      const [r, g, b] = getRgbFromIndex(colorIndex);
      const pos = i * 4;
      data[pos] = r;
      data[pos + 1] = g;
      data[pos + 2] = b;
      data[pos + 3] = 255; // Alpha
    }

    ctx.putImageData(imageData, 0, 0);
  }, [pixelsRef]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll, canvasVersion]);

  // Bresenham's Line Algorithm
  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        onPlacePixel(x0, y0, selectedColor);

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
  };

  // Viewport Constraints
  const clampViewport = (prev: ViewportTransform, dx: number, dy: number): ViewportTransform => {
      let newX = prev.x + dx;
      let newY = prev.y + dy;

      const visualWidth = CANVAS_WIDTH * prev.scale;
      const visualHeight = CANVAS_HEIGHT * prev.scale;
      
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      // Ensure some part of the canvas is always visible
      const margin = 50;

      if (newX > screenWidth - margin) newX = screenWidth - margin;
      if (newX + visualWidth < margin) newX = margin - visualWidth;
      if (newY > screenHeight - margin) newY = screenHeight - margin;
      if (newY + visualHeight < margin) newY = margin - visualHeight;

      return { ...prev, x: newX, y: newY };
  };

  const getEventCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { clientX, clientY };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const { clientX, clientY } = getEventCoords(e);
    lastMousePos.current = { x: clientX, y: clientY };
    lastPixelPlaced.current = null;

    if (tool === 'DRAW') {
        const rect = containerRef.current!.getBoundingClientRect();
        const gx = Math.floor((clientX - rect.left - viewport.x) / viewport.scale);
        const gy = Math.floor((clientY - rect.top - viewport.y) / viewport.scale);
        
        if (gx >= 0 && gx < CANVAS_WIDTH && gy >= 0 && gy < CANVAS_HEIGHT) {
            onPlacePixel(gx, gy, selectedColor);
            lastPixelPlaced.current = { x: gx, y: gy };
        }
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getEventCoords(e);

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // Calculate Grid Hover
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    
    const gx = Math.floor((mouseX - viewport.x) / viewport.scale);
    const gy = Math.floor((mouseY - viewport.y) / viewport.scale);

    // Update hover
    if (gx >= 0 && gx < CANVAS_WIDTH && gy >= 0 && gy < CANVAS_HEIGHT) {
      if (!hoverPixel || hoverPixel.x !== gx || hoverPixel.y !== gy) {
        setHoverPixel({ x: gx, y: gy });
        onHover?.({ x: gx, y: gy });
      }
    } else {
      if (hoverPixel) {
        setHoverPixel(null);
        onHover?.(null);
      }
    }

    // Dragging Logic
    const isTouch = 'touches' in e;
    if (!isTouch && 'buttons' in e && (e as React.MouseEvent).buttons !== 1) return;
    if (!isDragging.current) return;

    if (tool === 'PAN') {
      const dx = clientX - lastMousePos.current.x;
      const dy = clientY - lastMousePos.current.y;
      setViewport(prev => clampViewport(prev, dx, dy));
      lastMousePos.current = { x: clientX, y: clientY };
    } 
    else if (tool === 'DRAW') {
        if (gx >= 0 && gx < CANVAS_WIDTH && gy >= 0 && gy < CANVAS_HEIGHT) {
            if (lastPixelPlaced.current) {
                drawLine(lastPixelPlaced.current.x, lastPixelPlaced.current.y, gx, gy);
            } else {
                onPlacePixel(gx, gy, selectedColor);
            }
            lastPixelPlaced.current = { x: gx, y: gy };
        }
    }
  };

  const handleEnd = () => {
      isDragging.current = false;
      lastPixelPlaced.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleAmount = -e.deltaY * 0.001;
    const newScale = Math.max(0.1, Math.min(100, viewport.scale * (1 + scaleAmount)));
    
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - viewport.x) * (newScale / viewport.scale);
    const newY = mouseY - (mouseY - viewport.y) * (newScale / viewport.scale);

    setViewport(prev => {
        const v = { x: newX, y: newY, scale: newScale };
        return clampViewport(v, 0, 0); 
    });
  };

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden touch-none ${tool === 'PAN' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={() => { handleEnd(); setHoverPixel(null); onHover?.(null); }}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onWheel={handleWheel}
    >
      <div
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          willChange: 'transform'
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block bg-white shadow-2xl"
          style={{
            // Crisp pixel rendering
            imageRendering: 'pixelated',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.2), 0 20px 50px rgba(0,0,0,0.5)'
          }}
        />
        
        {/* Grid Overlay for high zoom */}
        {viewport.scale > 8 && (
            <div 
              className="absolute inset-0 pointer-events-none" 
              style={{
                  backgroundSize: '1px 1px',
                  backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)'
              }} 
            />
        )}

        {/* Hover Highlight */}
        {tool === 'DRAW' && hoverPixel && (
          <div 
            className="absolute pointer-events-none border border-black/50 bg-white/40"
            style={{
              left: hoverPixel.x,
              top: hoverPixel.y,
              width: 1,
              height: 1,
              boxShadow: '0 0 2px rgba(0,0,0,0.5)'
            }}
          />
        )}
      </div>
    </div>
  );
};