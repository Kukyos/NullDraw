import type * as Party from "partykit/server";

// --- Constants ---
const WIDTH = 1920;
const HEIGHT = 1080;
const TOTAL_PIXELS = WIDTH * HEIGHT;

const ROWS_PER_CHUNK = 64;
const CHUNK_COUNT = Math.ceil(HEIGHT / ROWS_PER_CHUNK);
const SAVE_INTERVAL_MS = 30_000;
const MAX_BATCH_PIXELS = 500;
const MAX_FILL_PIXELS = 10_000;

// --- Helpers ---
const ADJS = ["Neon", "Pixel", "Retro", "Mega", "Hyper", "Cyber", "Cool", "Rad", "Turbo", "Ultra"];
const NOUNS = ["Cat", "Dog", "Fox", "Bot", "User", "Artist", "Glitch", "Wizard", "Panda", "Crab"];

function generateName(): string {
  const adj = ADJS[Math.floor(Math.random() * ADJS.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function isValidPixel(x: number, y: number, colorIndex: number): boolean {
  return (
    Number.isInteger(x) && x >= 0 && x < WIDTH &&
    Number.isInteger(y) && y >= 0 && y < HEIGHT &&
    Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex <= 15
  );
}

// --- PartyKit Server ---
export default class PixelPlacerServer implements Party.Server {
  canvas: Uint8Array;
  usernames: Map<string, string>;
  dirty: boolean;

  constructor(readonly room: Party.Room) {
    this.canvas = new Uint8Array(TOTAL_PIXELS);
    this.usernames = new Map();
    this.dirty = false;
  }

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

  async loadCanvas(): Promise<void> {
    const keys = Array.from({ length: CHUNK_COUNT }, (_, i) => `canvas_chunk_${i}`);
    const stored = await this.room.storage.get<number[]>(keys);
    let loaded = false;
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const chunk = stored.get(`canvas_chunk_${i}`);
      if (chunk) {
        const startRow = i * ROWS_PER_CHUNK;
        const offset = startRow * WIDTH;
        this.canvas.set(new Uint8Array(chunk), offset);
        loaded = true;
      }
    }
    console.log(loaded ? "Canvas loaded from storage." : "No saved canvas. Starting fresh.");
  }

  async saveCanvas(): Promise<void> {
    const entries: Record<string, number[]> = {};
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const startRow = i * ROWS_PER_CHUNK;
      const endRow = Math.min(startRow + ROWS_PER_CHUNK, HEIGHT);
      const offset = startRow * WIDTH;
      const length = (endRow - startRow) * WIDTH;
      entries[`canvas_chunk_${i}`] = Array.from(this.canvas.slice(offset, offset + length));
    }
    await this.room.storage.put(entries);
    console.log("Canvas saved.");
  }

  broadcast(message: string, exclude?: string): void {
    for (const conn of this.room.getConnections()) {
      if (conn.id !== exclude) {
        try { conn.send(message); } catch (_) {}
      }
    }
  }

  broadcastUserCount(): void {
    const count = [...this.room.getConnections()].length;
    this.broadcast(JSON.stringify({ type: "USER_COUNT", payload: count }));
  }

  // --- Flood fill (BFS, capped) ---
  floodFill(startX: number, startY: number, newColor: number): Array<{x: number; y: number; colorIndex: number}> {
    const targetColor = this.canvas[startY * WIDTH + startX];
    if (targetColor === newColor) return [];

    const changed: Array<{x: number; y: number; colorIndex: number}> = [];
    const visited = new Set<number>();
    const queue: Array<[number, number]> = [[startX, startY]];
    visited.add(startY * WIDTH + startX);

    while (queue.length > 0 && changed.length < MAX_FILL_PIXELS) {
      const [x, y] = queue.shift()!;
      const idx = y * WIDTH + x;

      if (this.canvas[idx] !== targetColor) continue;

      this.canvas[idx] = newColor;
      changed.push({ x, y, colorIndex: newColor });

      // 4-directional neighbors
      for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
        if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
          const nIdx = ny * WIDTH + nx;
          if (!visited.has(nIdx) && this.canvas[nIdx] === targetColor) {
            visited.add(nIdx);
            queue.push([nx, ny]);
          }
        }
      }
    }

    return changed;
  }

  // --- Connection ---
  async onConnect(conn: Party.Connection): Promise<void> {
    try {
      // Read username from query params, fallback to generated name
      let username = generateName();
      try {
        const url = new URL(conn.uri, "http://dummy");
        const nameParam = url.searchParams.get("name");
        if (nameParam && nameParam.trim().length > 0) {
          // Sanitize: max 20 chars, alphanumeric + spaces + underscores
          username = nameParam.trim().slice(0, 20).replace(/[^a-zA-Z0-9_ ]/g, '');
          if (username.length === 0) username = generateName();
        }
      } catch (_) {}

      this.usernames.set(conn.id, username);
      console.log(`Connected: ${username} (${conn.id})`);

      // Send canvas as base64-encoded text chunks
      const CHUNK_BYTES = 300_000;
      const totalChunks = Math.ceil(this.canvas.length / CHUNK_BYTES);

      conn.send(JSON.stringify({
        type: "INIT_START",
        payload: { totalSize: this.canvas.length, chunks: totalChunks }
      }));

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_BYTES;
        const end = Math.min(start + CHUNK_BYTES, this.canvas.length);
        conn.send(JSON.stringify({
          type: "CANVAS_CHUNK",
          payload: uint8ToBase64(this.canvas.slice(start, end))
        }));
      }

      conn.send(JSON.stringify({ type: "INIT_END" }));
      this.broadcastUserCount();
    } catch (e) {
      console.error("Error in onConnect:", e);
    }
  }

  // --- Messages ---
  async onMessage(message: string, sender: Party.Connection): Promise<void> {
    try {
      const parsed = JSON.parse(message);
      const username = this.usernames.get(sender.id) || "???";

      switch (parsed.type) {
        case "PLACE": {
          const { x, y, colorIndex } = parsed.payload;
          if (!isValidPixel(x, y, colorIndex)) return;

          this.canvas[y * WIDTH + x] = colorIndex;
          this.dirty = true;

          this.broadcast(JSON.stringify({
            type: "UPDATE",
            payload: { x, y, colorIndex, username },
          }), sender.id);
          break;
        }

        case "PLACE_BATCH": {
          const pixels = parsed.payload?.pixels;
          if (!Array.isArray(pixels)) return;

          const valid: Array<{x: number; y: number; colorIndex: number}> = [];
          const limit = Math.min(pixels.length, MAX_BATCH_PIXELS);

          for (let i = 0; i < limit; i++) {
            const { x, y, colorIndex } = pixels[i];
            if (isValidPixel(x, y, colorIndex)) {
              this.canvas[y * WIDTH + x] = colorIndex;
              valid.push({ x, y, colorIndex });
            }
          }

          if (valid.length > 0) {
            this.dirty = true;
            this.broadcast(JSON.stringify({
              type: "UPDATE_BATCH",
              payload: { pixels: valid, username },
            }), sender.id);
          }
          break;
        }

        case "FILL": {
          const { x, y, colorIndex } = parsed.payload;
          if (!isValidPixel(x, y, colorIndex)) return;

          const changed = this.floodFill(x, y, colorIndex);
          if (changed.length > 0) {
            this.dirty = true;
            // Broadcast to ALL including sender (server computed the fill result)
            this.broadcast(JSON.stringify({
              type: "UPDATE_BATCH",
              payload: { pixels: changed, username },
            }));
          }
          break;
        }
      }
    } catch (e) {
      console.error("Invalid message:", e);
    }
  }

  async onClose(conn: Party.Connection): Promise<void> {
    this.usernames.delete(conn.id);
    this.broadcastUserCount();
  }
}

PixelPlacerServer satisfies Party.Worker;
