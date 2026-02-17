# PixelPlacer

A real-time collaborative pixel art canvas — draw together with your friends!

## Architecture

1.  **Frontend**: React + TypeScript + Tailwind + HTML5 Canvas.
    *   1920×1080 pixel grid (~2 million pixels) rendered with `putImageData` + per-pixel `fillRect` updates.
    *   `useGameConnection` hook manages PartySocket connection with auto-reconnect.
    *   Optimistic local rendering — your strokes appear instantly, then broadcast to others.
2.  **Backend**: [PartyKit](https://partykit.io) (Cloudflare Durable Objects).
    *   Canvas state stored in a `Uint8Array` (~2MB) in durable storage (chunked to stay under per-key limits).
    *   Sends full binary canvas on connect, JSON delta updates for individual pixels.
    *   Auto-saves every 30 seconds.

## How to Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the PartyKit server (port 1999)

```bash
npm run dev:party
```

### 3. Start the Vite frontend (port 3000)

```bash
npm run dev
```

Open `http://localhost:3000`. Open a second tab to test real-time sync.

## Deployment

### PartyKit Server

```bash
# Login to PartyKit (uses Cloudflare under the hood)
npx partykit login

# Deploy the server
npm run deploy:party
```

This gives you a URL like `pixelplacer.<your-username>.partykit.dev`.

### Frontend (Vercel)

1.  Push this repo to GitHub.
2.  Import it in [Vercel](https://vercel.com).
3.  Set the environment variable:
    *   `VITE_PARTYKIT_HOST` = `pixelplacer.<your-username>.partykit.dev`
4.  Vercel auto-builds with `npm run build` and deploys the static site.
5.  Share the Vercel URL with your friends!

### Frontend (other hosts)

Update the env var or edit `constants.ts` → `PARTYKIT_HOST` to point to your deployed PartyKit server, then:

```bash
npm run build
```

Serve the `dist/` folder with any static file host (Nginx, Netlify, Cloudflare Pages, etc.).
