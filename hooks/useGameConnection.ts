import { useRef, useState, useCallback } from 'react';
import usePartySocket from 'partysocket/react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PARTYKIT_HOST } from '../constants';
import { MessageType, PixelData, BatchPixel } from '../types';

function base64ToUint8(b64: string): Uint8Array {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

interface UseGameConnectionProps {
  onPixelUpdate: (pixel: PixelData) => void;
  onBatchUpdate: (pixels: PixelData[]) => void;
  onFullUpdate: (buffer: Uint8Array) => void;
  username: string;
}

export const useGameConnection = ({ onPixelUpdate, onBatchUpdate, onFullUpdate, username }: UseGameConnectionProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);

  const onPixelUpdateRef = useRef(onPixelUpdate);
  onPixelUpdateRef.current = onPixelUpdate;
  const onBatchUpdateRef = useRef(onBatchUpdate);
  onBatchUpdateRef.current = onBatchUpdate;
  const onFullUpdateRef = useRef(onFullUpdate);
  onFullUpdateRef.current = onFullUpdate;

  // Chunked init state
  const initChunks = useRef<Uint8Array[]>([]);
  const initExpectedSize = useRef<number>(0);
  const initReceived = useRef<number>(0);
  const isReceivingInit = useRef<boolean>(false);

  const assembleChunks = useCallback(() => {
    const full = new Uint8Array(initExpectedSize.current);
    let offset = 0;
    for (const chunk of initChunks.current) {
      full.set(chunk, offset);
      offset += chunk.length;
    }
    initChunks.current = [];
    initReceived.current = 0;
    isReceivingInit.current = false;
    onFullUpdateRef.current(full);
  }, []);

  const processBinary = useCallback((buf: ArrayBuffer) => {
    if (!isReceivingInit.current) return;
    const uint8 = new Uint8Array(buf);
    initChunks.current.push(uint8);
    initReceived.current += uint8.length;
    if (initReceived.current >= initExpectedSize.current) {
      assembleChunks();
    }
  }, [assembleChunks]);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: 'canvas',
    query: { name: username },

    onOpen() {
      setIsConnected(true);
      initChunks.current = [];
      initReceived.current = 0;
      isReceivingInit.current = false;
    },

    onClose() {
      setIsConnected(false);
    },

    onError(e) {
      console.error('PartySocket error:', e);
    },

    onMessage(event) {
      const { data } = event;

      if (data instanceof ArrayBuffer) {
        processBinary(data);
        return;
      }
      if (data instanceof Blob) {
        data.arrayBuffer().then(processBinary);
        return;
      }

      if (typeof data === 'string') {
        try {
          const message = JSON.parse(data);
          switch (message.type) {
            case 'INIT_START':
              initChunks.current = [];
              initReceived.current = 0;
              initExpectedSize.current = message.payload.totalSize;
              isReceivingInit.current = true;
              break;
            case 'CANVAS_CHUNK': {
              if (!isReceivingInit.current) break;
              const decoded = base64ToUint8(message.payload);
              initChunks.current.push(decoded);
              initReceived.current += decoded.length;
              if (initReceived.current >= initExpectedSize.current) {
                assembleChunks();
              }
              break;
            }
            case 'INIT_END':
              if (isReceivingInit.current && initReceived.current >= initExpectedSize.current) {
                assembleChunks();
              }
              break;
            case MessageType.UPDATE:
              onPixelUpdateRef.current(message.payload);
              break;
            case MessageType.UPDATE_BATCH:
            case 'UPDATE_BATCH': {
              const { pixels, username: uname } = message.payload;
              if (Array.isArray(pixels)) {
                const withName = pixels.map((p: BatchPixel) => ({ ...p, username: uname }));
                onBatchUpdateRef.current(withName);
              }
              break;
            }
            case MessageType.USER_COUNT:
              setUserCount(message.payload);
              break;
            case MessageType.ERROR:
              console.warn('Server Error:', message.payload);
              break;
          }
        } catch (e) {
          console.error('Failed to parse message', e);
        }
      }
    },
  });

  const placePixel = useCallback((x: number, y: number, colorIndex: number) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: MessageType.PLACE,
        payload: { x, y, colorIndex }
      }));
    }
  }, [socket]);

  const placePixelBatch = useCallback((pixels: BatchPixel[]) => {
    if (socket && socket.readyState === WebSocket.OPEN && pixels.length > 0) {
      socket.send(JSON.stringify({
        type: MessageType.PLACE_BATCH,
        payload: { pixels }
      }));
    }
  }, [socket]);

  const sendFill = useCallback((x: number, y: number, colorIndex: number) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: MessageType.FILL,
        payload: { x, y, colorIndex }
      }));
    }
  }, [socket]);

  return { isConnected, userCount, placePixel, placePixelBatch, sendFill };
};