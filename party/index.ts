import type * as Party from "partykit/server";

// --- Constants ---
const WIDTH = 1920;
const HEIGHT = 1080;
const TOTAL_PIXELS = WIDTH * HEIGHT; // 2,073,600 bytes

// Durable Object storage has a 128KB per-key limit.
// We chunk the canvas into rows-per-chunk to stay well under that.
const ROWS_PER_CHUNK = 64;
const CHUNK_COUNT = Math.ceil(HEIGHT / ROWS_PER_CHUNK); // 17 chunks
const SAVE_INTERVAL_MS = 30_000; // auto-save to durable storage every 30s (updates are broadcast live via WebSocket instantly)

// Cloudflare WebSocket messages have a ~1MB limit.
// 1920*1080 = 2MB, so we must send initial state in chunks.
const SEND_CHUNK_SIZE = 500_000; // 500KB per network chunk (well under 1MB)

// --- Username Generator ---
const ADJS = ["Neon", "Pixel", "Retro", "Mega", "Hyper", "Cyber", "Cool", "Rad", "Turbo", "Ultra"];
const NOUNS = ["Cat", "Dog", "Fox", "Bot", "User", "Artist", "Glitch", "Wizard", "Panda", "Crab"];

function generateName(): string {
  const adj = ADJS[Math.floor(Math.random() * ADJS.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

// Encode Uint8Array → base64 string (works in CF Workers + Node)
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// --- PartyKit Server ---
export default class PixelPlacerServer implements Party.Server {
  canvas: Uint8Array;
  usernames: Map<string, string>; // connection id -> username
  dirty: boolean; // whether canvas has unsaved changes

  constructor(readonly room: Party.Room) {
    this.canvas = new Uint8Array(TOTAL_PIXELS);
    this.usernames = new Map();
    this.dirty = false;
  }

  // Called once when the room is first created or wakes from hibernation
  async onStart(): Promise<void> {
    try {
      await this.loadCanvas();
    } catch (e) {
      console.error("Failed to load canvas in onStart:", e);
    }
    try {
      this.room.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
    } catch (e) {
      console.error("Failed to set alarm in onStart:", e);
    }
  }

  // Alarm fires periodically to save canvas state
  async onAlarm(): Promise<void> {
    try {
      if (this.dirty) {
        await this.saveCanvas();
        this.dirty = false;
      }
    } catch (e) {
      console.error("Failed to save canvas in onAlarm:", e);
    }
    try {
      this.room.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
    } catch (e) {
      console.error("Failed to re-schedule alarm:", e);
    }
  }

  // Load canvas from durable storage (chunked)
  async loadCanvas(): Promise<void> {
    const keys = Array.from({ length: CHUNK_COUNT }, (_, i) => `canvas_chunk_${i}`);
    const stored = await this.room.storage.get<number[]>(keys);

    let loaded = false;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = stored.get(`canvas_chunk_${i}`);
      if (chunk) {
        const startRow = i * ROWS_PER_CHUNK;
        const offset = startRow * WIDTH;
        const arr = new Uint8Array(chunk);
        this.canvas.set(arr, offset);
        loaded = true;
      }
    }

    if (loaded) {
      console.log("Canvas loaded from storage.");
    } else {
      console.log("No saved canvas found. Starting fresh.");
    }
  }

  // Save canvas to durable storage (chunked)
  async saveCanvas(): Promise<void> {
    const entries: Record<string, number[]> = {};

    for (let i = 0; i < CHUNK_COUNT; i++) {
      const startRow = i * ROWS_PER_CHUNK;
      const endRow = Math.min(startRow + ROWS_PER_CHUNK, HEIGHT);
      const offset = startRow * WIDTH;
      const length = (endRow - startRow) * WIDTH;
      const slice = this.canvas.slice(offset, offset + length);
      entries[`canvas_chunk_${i}`] = Array.from(slice);
    }

    await this.room.storage.put(entries);
    console.log("Canvas saved to storage.");
  }

  // Broadcast to all connections, optionally excluding one
  broadcast(message: string | ArrayBuffer, exclude?: string): void {
    for (const conn of this.room.getConnections()) {
      if (conn.id !== exclude) {
        conn.send(message);
      }
    }
  }

  broadcastUserCount(): void {
    const count = [...this.room.getConnections()].length;
    const msg = JSON.stringify({ type: "USER_COUNT", payload: count });
    this.broadcast(msg);
  }

  // New client connects
  async onConnect(conn: Party.Connection): Promise<void> {
    try {
      const username = generateName();
      this.usernames.set(conn.id, username);
      console.log(`Connected: ${username} (${conn.id})`);

      // Send canvas as base64-encoded text chunks (avoids binary WS issues on CF Workers)
      const CHUNK_BYTES = 300_000; // 300K pixels per chunk → ~400KB base64 text
      const totalChunks = Math.ceil(this.canvas.length / CHUNK_BYTES);

      conn.send(JSON.stringify({
        type: "INIT_START",
        payload: { totalSize: this.canvas.length, chunks: totalChunks }
      }));

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_BYTES;
        const end = Math.min(start + CHUNK_BYTES, this.canvas.length);
        const chunk = this.canvas.slice(start, end);
        conn.send(JSON.stringify({
          type: "CANVAS_CHUNK",
          payload: uint8ToBase64(chunk)
        }));
      }

      conn.send(JSON.stringify({ type: "INIT_END" }));

      this.broadcastUserCount();
    } catch (e) {
      console.error("Error in onConnect:", e);
    }
  }

  // Receive a message from a client
  async onMessage(message: string, sender: Party.Connection): Promise<void> {
    try {
      const parsed = JSON.parse(message);

      if (parsed.type === "PLACE") {
        const { x, y, colorIndex } = parsed.payload;

        // Validate
        if (
          !Number.isInteger(x) || x < 0 || x >= WIDTH ||
          !Number.isInteger(y) || y < 0 || y >= HEIGHT ||
          !Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 15
        ) {
          return;
        }

        // Update canvas
        this.canvas[y * WIDTH + x] = colorIndex;
        this.dirty = true;

        // Broadcast update to everyone except sender (sender did optimistic update)
        const updateMsg = JSON.stringify({
          type: "UPDATE",
          payload: { x, y, colorIndex, username: this.usernames.get(sender.id) },
        });
        this.broadcast(updateMsg, sender.id);
      }
    } catch (e) {
      console.error("Invalid message:", e);
    }
  }

  // Client disconnects
  async onClose(conn: Party.Connection): Promise<void> {
    this.usernames.delete(conn.id);
    this.broadcastUserCount();
  }
}

// PartyKit requires this
PixelPlacerServer satisfies Party.Worker;
