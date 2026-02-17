import React from 'react';
import { PALETTE } from '../constants';

interface ColorPaletteProps {
  selectedColor: number;
  onSelectColor: (id: number) => void;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({ selectedColor, onSelectColor }) => {
  return (
    <div className="flex flex-col items-center pointer-events-auto">
      <div className="bg-neutral-800/90 backdrop-blur border border-neutral-700 p-2 rounded-xl shadow-xl">
        <div className="grid grid-cols-8 gap-2 sm:flex sm:flex-row">
          {PALETTE.map((color) => (
            <button
              key={color.id}
              onClick={() => onSelectColor(color.id)}
              className={`w-8 h-8 rounded-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-white/50 ${
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