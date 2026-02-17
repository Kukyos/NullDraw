import { PaletteColor } from './types';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const COOLDOWN_SECONDS = 0;

// PartyKit connection host — set VITE_PARTYKIT_HOST env var in production
export const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST as string || 'localhost:1999';

// Standard 16-color palette (r/place style)
export const PALETTE: PaletteColor[] = [
  { id: 0, hex: '#FFFFFF', name: 'White' },
  { id: 1, hex: '#E4E4E4', name: 'Light Gray' },
  { id: 2, hex: '#888888', name: 'Dark Gray' },
  { id: 3, hex: '#222222', name: 'Black' },
  { id: 4, hex: '#FFA7D1', name: 'Pink' },
  { id: 5, hex: '#E50000', name: 'Red' },
  { id: 6, hex: '#E59500', name: 'Orange' },
  { id: 7, hex: '#A06A42', name: 'Brown' },
  { id: 8, hex: '#E5D900', name: 'Yellow' },
  { id: 9, hex: '#94E044', name: 'Light Green' },
  { id: 10, hex: '#02BE01', name: 'Green' },
  { id: 11, hex: '#00D3DD', name: 'Aqua' },
  { id: 12, hex: '#0083C7', name: 'Teal' },
  { id: 13, hex: '#0000EA', name: 'Blue' },
  { id: 14, hex: '#CF6EE4', name: 'Violet' },
  { id: 15, hex: '#820080', name: 'Purple' },
];

export const HEX_MAP = PALETTE.map(p => p.hex);