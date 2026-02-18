import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---
interface PixelUpdate {
  type: 'PLACE';
  payload: {
    x: number;
    y: number;
    colorIndex: number;
  };
}

// --- Constants ---
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const WIDTH = 1920;
const HEIGHT = 1080;
// Use process.cwd() to avoid __dirname issues in some TS configs or ESM
const DATA_FILE = path.join((process as any).cwd(), 'canvas.dat');
const SNAPSHOT_INTERVAL_MS = 30000;

// --- State ---
// The canvas grid.
let canvas = new Uint8Array(WIDTH * HEIGHT);

// Map to track user names
const clients = new Map<WebSocket, string>();

// --- Persistence ---
function loadCanvas() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE);
      if (data.length === WIDTH * HEIGHT) {
        canvas = new Uint8Array(data);
        console.log('Canvas state loaded from disk.');
      } else {
        console.warn('Data file size mismatch. Starting fresh.');
      }
    }
  } catch (err) {
    console.error('Failed to load canvas data:', err);
  }
}

function saveCanvas() {
  try {
    fs.writeFileSync(DATA_FILE, canvas);
    console.log('Canvas state saved.');
  } catch (err) {
    console.error('Failed to save canvas data:', err);
  }
}

// Initialize
loadCanvas();
setInterval(saveCanvas, SNAPSHOT_INTERVAL_MS);

// --- Server Setup ---
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('NullDraw Server Running');
});

const wss = new WebSocketServer({ server });

function broadcast(message: string | ArrayBuffer, exclude?: WebSocket) {
  wss.clients.forEach(client => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastUserCount() {
  const count = wss.clients.size;
  const msg = JSON.stringify({ type: 'USER_COUNT', payload: count });
  broadcast(msg);
}

function generateName() {
  const adjs = ['Neon', 'Pixel', 'Retro', 'Mega', 'Hyper', 'Cyber', 'Cool'];
  const nouns = ['Cat', 'Dog', 'Fox', 'Bot', 'User', 'Artist', 'Glitch'];
  return `${adjs[Math.floor(Math.random() * adjs.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 100)}`;
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const username = generateName();
  clients.set(ws, username);
  
  console.log(`New connection: ${username} (${ip})`);

  // 1. Send initial state (Binary is faster)
  ws.send(canvas);

  // 2. Send user count
  broadcastUserCount();

  ws.on('message', (data) => {
    try {
      // We expect JSON for updates
      const message = JSON.parse(data.toString());

      if (message.type === 'PLACE') {
        const { x, y, colorIndex } = message.payload;

        // Validation
        if (
          !Number.isInteger(x) || x < 0 || x >= WIDTH ||
          !Number.isInteger(y) || y < 0 || y >= HEIGHT ||
          !Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 15
        ) {
          return; // Invalid payload
        }

        // Apply Update
        const idx = y * WIDTH + x;
        canvas[idx] = colorIndex;

        // Broadcast to all (exclude sender if we want pure optimistic, 
        // but including sender is fine for confirmation, 
        // though Frontend handles optimistic now)
        const updateMsg = JSON.stringify({
          type: 'UPDATE',
          payload: { x, y, colorIndex, username: clients.get(ws) }
        });
        
        // Broadcast to everyone else (sender updated optimistically)
        broadcast(updateMsg, ws);
      }
    } catch (e) {
      console.error('Invalid message received', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastUserCount();
  });
});

// Handle server shutdown
const cleanup = () => {
  console.log('Shutting down...');
  saveCanvas();
  (process as any).exit();
};
(process as any).on('SIGINT', cleanup);
(process as any).on('SIGTERM', cleanup);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});