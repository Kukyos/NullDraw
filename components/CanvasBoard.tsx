import React, { useEffect, useRef, useCallback } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants';
import { ViewportTransform, ToolMode, BatchPixel } from '../types';
import { getRgbFromIndex } from '../utils/colors';

interface CanvasBoardProps {
  pixelsRef: React.MutableRefObject<Uint8Array | null>;
  selectedColor: number;
  onPlacePixel: (x: number, y: number, colorIndex: number) => void;
  onPlacePixelBatch: (pixels: BatchPixel[]) => void;
  onFill: (x: number, y: number, colorIndex: number) => void;
  onPickColor: (colorIndex: number) => void;
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onHover?: (coords: {x: number, y: number} | null) => void;
  tool: ToolMode;
  brushSize: number;
  canvasElRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  canvasVersion?: number;
}

export const CanvasBoard: React.FC<CanvasBoardProps> = ({ 
  pixelsRef, 
  selectedColor, 
  onPlacePixel,
  onPlacePixelBatch,
  onFill,
  onPickColor,
  viewport,
  setViewport,
  onHover,
  tool,
  brushSize,
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
  
  // Use refs for hover to avoid React re-renders on every mouse move
  const hoverPixelRef = useRef<{x: number, y: number} | null>(null);
  const hoverOverlayRef = useRef<HTMLDivElement>(null);

  // Batch buffer — collects pixels during a stroke, sent periodically
  const batchBuffer = useRef<BatchPixel[]>([]);
  const batchTimerRef = useRef<number | null>(null);

  const flushBatch = useCallback(() => {
    if (batchBuffer.current.length > 0) {
      onPlacePixelBatch(batchBuffer.current);
      batchBuffer.current = [];
    }
  }, [onPlacePixelBatch]);

  const startBatchTimer = useCallback(() => {
    if (batchTimerRef.current === null) {
      batchTimerRef.current = window.setInterval(flushBatch, 50);
    }
  }, [flushBatch]);

  const stopBatchTimer = useCallback(() => {
    if (batchTimerRef.current !== null) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    flushBatch();
  }, [flushBatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current !== null) clearInterval(batchTimerRef.current);
    };
  }, []);

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
      const [r, g, b] = getRgbFromIndex(pixels[i]);
      const pos = i * 4;
      data[pos] = r;
      data[pos + 1] = g;
      data[pos + 2] = b;
      data[pos + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [pixelsRef]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll, canvasVersion]);

  // Generate NxN brush stamp, clamped to canvas bounds
  const stampBrush = useCallback((cx: number, cy: number, colorIndex: number, size: number): BatchPixel[] => {
    const half = Math.floor(size / 2);
    const pixels: BatchPixel[] = [];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
          pixels.push({ x, y, colorIndex });
        }
      }
    }
    return pixels;
  }, []);

  // Apply pixels locally (optimistic) and add to batch buffer for sending
  const applyAndBuffer = useCallback((pixels: BatchPixel[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    for (const p of pixels) {
      if (pixelsRef.current) {
        pixelsRef.current[p.y * CANVAS_WIDTH + p.x] = p.colorIndex;
      }
      if (ctx) {
        const [r, g, b] = getRgbFromIndex(p.colorIndex);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }
    batchBuffer.current.push(...pixels);
  }, [pixelsRef]);

  // Bresenham's line, stamps brush at each point
  const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number, colorIndex: number, size: number) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const allPixels: BatchPixel[] = [];
    const placed = new Set<string>();

    while (true) {
      const stamp = stampBrush(x0, y0, colorIndex, size);
      for (const p of stamp) {
        const key = `${p.x},${p.y}`;
        if (!placed.has(key)) {
          placed.add(key);
          allPixels.push(p);
        }
      }

      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }

    applyAndBuffer(allPixels);
  }, [stampBrush, applyAndBuffer]);

  // Loosened viewport constraints — allow canvas to go almost fully off-screen
  const clampViewport = (prev: ViewportTransform, dx: number, dy: number): ViewportTransform => {
    let newX = prev.x + dx;
    let newY = prev.y + dy;

    const visualWidth = CANVAS_WIDTH * prev.scale;
    const visualHeight = CANVAS_HEIGHT * prev.scale;
    const sw = window.innerWidth;
    const sh = window.innerHeight;

    // Allow canvas to go 90% off-screen in any direction
    const marginX = sw * 0.9;
    const marginY = sh * 0.9;

    if (newX > sw - (sw - marginX)) newX = marginX;
    if (newX + visualWidth < sw - marginX) newX = (sw - marginX) - visualWidth;
    if (newY > sh - (sh - marginY)) newY = marginY;
    if (newY + visualHeight < sh - marginY) newY = (sh - marginY) - visualHeight;

    return { ...prev, x: newX, y: newY };
  };

  const getEventCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { clientX, clientY };
  };

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const gx = Math.floor((clientX - rect.left - viewport.x) / viewport.scale);
    const gy = Math.floor((clientY - rect.top - viewport.y) / viewport.scale);
    return { gx, gy };
  };

  const isInBounds = (gx: number, gy: number) =>
    gx >= 0 && gx < CANVAS_WIDTH && gy >= 0 && gy < CANVAS_HEIGHT;

  // Update hover overlay position directly via DOM (no React re-render)
  const updateHoverOverlay = useCallback((gx: number | null, gy: number | null) => {
    const el = hoverOverlayRef.current;
    if (!el) return;
    if (gx === null || gy === null) {
      el.style.display = 'none';
      hoverPixelRef.current = null;
      onHover?.(null);
      return;
    }
    const half = Math.floor(brushSize / 2);
    const left = gx - half;
    const top = gy - half;
    el.style.display = 'block';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${brushSize}px`;
    el.style.height = `${brushSize}px`;
    hoverPixelRef.current = { x: gx, y: gy };
    onHover?.({ x: gx, y: gy });
  }, [brushSize, onHover]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const { clientX, clientY } = getEventCoords(e);
    lastMousePos.current = { x: clientX, y: clientY };
    lastPixelPlaced.current = null;

    if (!containerRef.current) return;
    const { gx, gy } = screenToCanvas(clientX, clientY);

    if (!isInBounds(gx, gy)) return;

    const activeColor = tool === 'ERASE' ? 0 : selectedColor;

    if (tool === 'DRAW' || tool === 'ERASE') {
      startBatchTimer();
      const pixels = stampBrush(gx, gy, activeColor, brushSize);
      applyAndBuffer(pixels);
      lastPixelPlaced.current = { x: gx, y: gy };
    } else if (tool === 'FILL') {
      onFill(gx, gy, selectedColor);
    } else if (tool === 'EYEDROPPER') {
      if (pixelsRef.current) {
        const colorIndex = pixelsRef.current[gy * CANVAS_WIDTH + gx];
        onPickColor(colorIndex);
      }
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    const { clientX, clientY } = getEventCoords(e);
    if (!containerRef.current) return;

    const { gx, gy } = screenToCanvas(clientX, clientY);

    // Update hover
    if (isInBounds(gx, gy)) {
      const prev = hoverPixelRef.current;
      if (!prev || prev.x !== gx || prev.y !== gy) {
        updateHoverOverlay(gx, gy);
      }
    } else {
      if (hoverPixelRef.current) {
        updateHoverOverlay(null, null);
      }
    }

    // Dragging
    const isTouch = 'touches' in e;
    if (!isTouch && 'buttons' in e && (e as React.MouseEvent).buttons !== 1) return;
    if (!isDragging.current) return;

    if (tool === 'PAN') {
      const dx = clientX - lastMousePos.current.x;
      const dy = clientY - lastMousePos.current.y;
      setViewport(prev => clampViewport(prev, dx, dy));
      lastMousePos.current = { x: clientX, y: clientY };
    } else if (tool === 'DRAW' || tool === 'ERASE') {
      const activeColor = tool === 'ERASE' ? 0 : selectedColor;
      if (isInBounds(gx, gy)) {
        if (lastPixelPlaced.current) {
          drawLine(lastPixelPlaced.current.x, lastPixelPlaced.current.y, gx, gy, activeColor, brushSize);
        } else {
          const pixels = stampBrush(gx, gy, activeColor, brushSize);
          applyAndBuffer(pixels);
        }
        lastPixelPlaced.current = { x: gx, y: gy };
      }
    }
  };

  const handleEnd = () => {
    isDragging.current = false;
    lastPixelPlaced.current = null;
    stopBatchTimer();
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

    setViewport(() => {
      const v = { x: newX, y: newY, scale: newScale };
      return clampViewport(v, 0, 0);
    });
  };

  const getCursor = () => {
    switch (tool) {
      case 'PAN': return 'grab';
      case 'DRAW': case 'ERASE': return 'crosshair';
      case 'FILL': return 'crosshair';
      case 'EYEDROPPER': return 'crosshair';
      default: return 'default';
    }
  };

  const showHover = tool === 'DRAW' || tool === 'ERASE' || tool === 'FILL';

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden touch-none"
      style={{ cursor: getCursor() }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={() => { handleEnd(); updateHoverOverlay(null, null); }}
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

        {/* Hover Highlight — positioned via ref, not React state */}
        {showHover && (
          <div 
            ref={hoverOverlayRef}
            className="absolute pointer-events-none border border-black/50 bg-white/40"
            style={{
              display: 'none',
              boxShadow: '0 0 2px rgba(0,0,0,0.5)'
            }}
          />
        )}
      </div>
    </div>
  );
};