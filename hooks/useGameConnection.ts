import { useRef, useState, useCallback } from 'react';
import usePartySocket from 'partysocket/react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PARTYKIT_HOST } from '../constants';
import { MessageType, PixelData } from '../types';

interface UseGameConnectionProps {
  onPixelUpdate: (pixel: PixelData) => void;
  onFullUpdate: (buffer: Uint8Array) => void;
}

export const useGameConnection = ({ onPixelUpdate, onFullUpdate }: UseGameConnectionProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);

  // Store callbacks in refs so the socket doesn't reconnect when they change
  const onPixelUpdateRef = useRef(onPixelUpdate);
  onPixelUpdateRef.current = onPixelUpdate;
  const onFullUpdateRef = useRef(onFullUpdate);
  onFullUpdateRef.current = onFullUpdate;

  // Chunked init state — server sends canvas in multiple binary messages
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
    // Reset
    initChunks.current = [];
    initReceived.current = 0;
    isReceivingInit.current = false;
    onFullUpdateRef.current(full);
  }, []);

  const processBinary = useCallback((buf: ArrayBuffer) => {
    if (!isReceivingInit.current) return; // ignore unexpected binary
    const uint8 = new Uint8Array(buf);
    initChunks.current.push(uint8);
    initReceived.current += uint8.length;

    // If we've received all expected bytes, assemble
    if (initReceived.current >= initExpectedSize.current) {
      assembleChunks();
    }
  }, [assembleChunks]);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: 'canvas',

    onOpen() {
      console.log('Connected to PartyKit at', PARTYKIT_HOST);
      setIsConnected(true);
      // Reset init state on reconnect
      initChunks.current = [];
      initReceived.current = 0;
      isReceivingInit.current = false;
    },

    onClose() {
      console.log('Disconnected from PartyKit');
      setIsConnected(false);
    },

    onError(e) {
      console.error('PartySocket error:', e);
    },

    onMessage(event) {
      const { data } = event;

      // Binary data = canvas init chunk
      if (data instanceof ArrayBuffer) {
        processBinary(data);
        return;
      }

      // Blob → convert to ArrayBuffer
      if (data instanceof Blob) {
        data.arrayBuffer().then(processBinary);
        return;
      }

      // Text data = JSON message
      if (typeof data === 'string') {
        try {
          const message = JSON.parse(data);
          switch (message.type) {
            case 'INIT_START':
              // Server is about to send canvas chunks
              initChunks.current = [];
              initReceived.current = 0;
              initExpectedSize.current = message.payload.totalSize;
              isReceivingInit.current = true;
              break;
            case 'INIT_END':
              // Fallback: if we haven't assembled yet, do it now
              if (isReceivingInit.current && initReceived.current >= initExpectedSize.current) {
                assembleChunks();
              }
              break;
            case MessageType.UPDATE:
              onPixelUpdateRef.current(message.payload);
              break;
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

  return { isConnected, userCount, placePixel, cooldown: 0 };
};