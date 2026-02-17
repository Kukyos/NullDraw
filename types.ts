export enum MessageType {
  INIT = 'INIT',
  UPDATE = 'UPDATE',
  COOLDOWN = 'COOLDOWN',
  ERROR = 'ERROR',
  USER_COUNT = 'USER_COUNT',
  PLACE = 'PLACE'
}

export interface PixelData {
  x: number;
  y: number;
  colorIndex: number;
  username?: string; // Who placed it
}

export interface ServerMessage {
  type: MessageType;
  payload?: any;
}

export interface PlacePixelPayload {
  x: number;
  y: number;
  colorIndex: number;
}

export interface CanvasState {
  pixels: Uint8Array; // 1920 * 1080 flattened
}

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface PaletteColor {
  id: number;
  hex: string;
  name: string;
}

export type ToolMode = 'PAN' | 'DRAW';

export interface FloatingLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  timestamp: number;
}