import React, { useRef, useEffect, useState, useCallback } from 'react';
import iro from '@jaames/iro';
import { PALETTE } from '../constants';
import { getRgbFromIndex } from '../utils/colors';

interface ColorPaletteProps {
  selectedColor: number;
  onSelectColor: (id: number) => void;
}

// Find the nearest palette color to a given hex string
function nearestPaletteColor(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const [pr, pg, pb] = getRgbFromIndex(i);
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({ selectedColor, onSelectColor }) => {
  const pickerContainerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<iro.ColorPicker | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(PALETTE[selectedColor]?.hex || '#222222');
  const suppressRef = useRef(false);

  // Initialize iro picker
  useEffect(() => {
    if (!isOpen || !pickerContainerRef.current) return;
    if (pickerRef.current) return; // already initialized

    const picker = iro.ColorPicker(pickerContainerRef.current, {
      width: 180,
      color: PALETTE[selectedColor]?.hex || '#222222',
      borderWidth: 2,
      borderColor: '#444',
      layout: [
        { component: iro.ui.Wheel, options: {} },
      ],
    });

    picker.on('color:change', (color: any) => {
      if (suppressRef.current) return;
      const hex = color.hexString;
      setHexInput(hex);
      const nearest = nearestPaletteColor(hex);
      onSelectColor(nearest);
    });

    pickerRef.current = picker;

    return () => {
      // cleanup
      if (pickerContainerRef.current) {
        pickerContainerRef.current.innerHTML = '';
      }
      pickerRef.current = null;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync picker color when selectedColor changes externally (e.g., eyedropper)
  useEffect(() => {
    const hex = PALETTE[selectedColor]?.hex;
    if (hex) {
      setHexInput(hex);
      if (pickerRef.current) {
        suppressRef.current = true;
        pickerRef.current.color.hexString = hex;
        suppressRef.current = false;
      }
    }
  }, [selectedColor]);

  const handleHexSubmit = useCallback((value: string) => {
    let hex = value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const nearest = nearestPaletteColor(hex);
      onSelectColor(nearest);
      setHexInput(PALETTE[nearest].hex);
      if (pickerRef.current) {
        suppressRef.current = true;
        pickerRef.current.color.hexString = PALETTE[nearest].hex;
        suppressRef.current = false;
      }
    }
  }, [onSelectColor]);

  const currentHex = PALETTE[selectedColor]?.hex || '#FFFFFF';

  return (
    <div className="flex flex-col items-center pointer-events-auto relative">
      {/* Picker Popup */}
      {isOpen && (
        <div className="absolute bottom-full mb-3 bg-neutral-800/95 backdrop-blur border border-neutral-600 rounded-2xl shadow-2xl p-4 flex flex-col items-center gap-3 z-50">
          <div ref={pickerContainerRef} />
          
          {/* Hex Input */}
          <div className="flex items-center gap-2 w-full">
            <div className="w-8 h-8 rounded-md border-2 border-neutral-500 flex-shrink-0" style={{ backgroundColor: currentHex }} />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={(e) => handleHexSubmit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleHexSubmit((e.target as HTMLInputElement).value); }}
              className="bg-neutral-700 text-white text-sm font-mono px-2 py-1.5 rounded-lg border border-neutral-600 w-full focus:outline-none focus:border-blue-500"
              placeholder="#FFFFFF"
              maxLength={7}
            />
          </div>

          {/* Snapped-to indicator */}
          <div className="text-neutral-400 text-xs">
            Snaps to: <span className="text-white font-semibold">{PALETTE[selectedColor]?.name}</span>
          </div>
        </div>
      )}

      {/* Main Bar */}
      <div className="bg-neutral-800/90 backdrop-blur border border-neutral-700 p-2 rounded-xl shadow-xl flex items-center gap-2">
        {/* Toggle picker button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 flex-shrink-0 ${
            isOpen ? 'border-blue-500 shadow-lg shadow-blue-500/30' : 'border-neutral-500'
          }`}
          style={{ backgroundColor: currentHex }}
          title="Color Wheel"
        />

        {/* Quick-select swatches */}
        <div className="grid grid-cols-8 gap-1.5 sm:flex sm:flex-row sm:gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color.id}
              onClick={() => onSelectColor(color.id)}
              className={`w-7 h-7 rounded-md transition-transform hover:scale-110 focus:outline-none ${
                selectedColor === color.id ? 'ring-2 ring-white scale-110 shadow-lg z-10' : ''
              }`}
              style={{ backgroundColor: color.hex }}
              title={color.name}
              aria-label={`Select ${color.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};