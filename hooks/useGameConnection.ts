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

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: 'canvas',

    onOpen() {
      console.log('Connected to PartyKit');
      setIsConnected(true);
    },

    onClose() {
      console.log('Disconnected from PartyKit');
      setIsConnected(false);
    },

    onError() {
      // PartySocket handles reconnection automatically
    },

    onMessage(event) {
      const { data } = event;

      // Binary data = full grid state (INIT)
      if (data instanceof ArrayBuffer) {
        const uint8 = new Uint8Array(data);
        if (uint8.length === CANVAS_WIDTH * CANVAS_HEIGHT) {
          onFullUpdateRef.current(uint8);
        }
        return;
      }

      // Blob → convert to ArrayBuffer (some environments send binary as Blob)
      if (data instanceof Blob) {
        data.arrayBuffer().then((buf) => {
          const uint8 = new Uint8Array(buf);
          if (uint8.length === CANVAS_WIDTH * CANVAS_HEIGHT) {
            onFullUpdateRef.current(uint8);
          }
        });
        return;
      }

      // Text data = JSON message
      if (typeof data === 'string') {
        try {
          const message = JSON.parse(data);
          switch (message.type) {
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