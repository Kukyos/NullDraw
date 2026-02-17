import { PALETTE } from '../constants';

const hexToRgbCache = new Map<string, [number, number, number]>();

export const getRgbFromIndex = (index: number): [number, number, number] => {
  const safeIndex = Math.max(0, Math.min(index, PALETTE.length - 1));
  const hex = PALETTE[safeIndex].hex;
  
  if (hexToRgbCache.has(hex)) {
    return hexToRgbCache.get(hex)!;
  }

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [255, 255, 255];

  const rgb: [number, number, number] = [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ];
  
  hexToRgbCache.set(hex, rgb);
  return rgb;
};