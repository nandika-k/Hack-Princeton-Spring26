# ReWear Chrome Extension

Flip the scanner on, browse any supported shopping site, and the extension shows a sustainability breakdown for the item on the page: origin, fiber quality, carbon footprint, fast-fashion risk, and a 0–100 sustainability score — all wrapped in the Y2K OS aesthetic of the main ReWear app.

## What the extension does

- **Toggle** — the popup has an on/off switch. When ON, the content script scrapes the current product page.
- **Score** — the background worker calls the Kizaki `calculateSustainability` endpoint (K2-Think powered). If the backend is unreachable it falls back to a built-in retailer + fiber heuristic, so the UI always has data.
- **Details** — popup shows price, country of origin, fiber + quality, carbon footprint estimate, fast-fashion risk, and plain-English notes.
- **Badge** — the toolbar icon shows the score of the current tab (green ≥65, amber ≥35, red otherwise).

## Supported sites

Secondhand: Depop, Vinted, eBay, ThredUp, Vestiaire Collective, Whatnot.
Fast fashion / retail: Zara, H&M, Shein, ASOS, Urban Outfitters, Nordstrom, Revolve, Amazon, Macy's, any Shopify store.

The generic scraper reads Open Graph + JSON-LD metadata, so it falls back to "something reasonable" on any shop that exposes standard product markup.

## Dev

```bash
cd extension
npm install
cp .env.example .env      # optional — point VITE_REWEAR_API_BASE at the Kizaki deploy
npm run dev
```

Vite will write the unpacked build to `dist/`. Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension/dist/` folder.

Changes to the popup hot-reload via the crxjs Vite plugin. Changes to the content script or service worker require hitting the reload icon in `chrome://extensions`.

## Production build

```bash
npm run build
```

Output is in `dist/`. Zip that folder for the Chrome Web Store submission.

## Architecture

```
popup (React)  <─messages─>  service worker  <─fetch─>  Kizaki /calculate-sustainability
                                   │
                                   │  storage.local  (status, per-URL cache, current item)
                                   │
content script  <─messages─>  service worker
   │
   └── scrapers: generic (OG / JSON-LD), Shopify, Depop
```

Messages are typed in [src/lib/messages.ts](src/lib/messages.ts). Storage helpers are in [src/lib/storage.ts](src/lib/storage.ts). The backend client + heuristic fallback live in [src/lib/api.ts](src/lib/api.ts).

## Adding a new site scraper

1. Create `src/content/scrapers/<site>.ts` exporting a function that returns `ScrapedItem | null`.
2. Route to it from [src/content/content-script.ts](src/content/content-script.ts) (`scrape()` switch).
3. Add the host to `content_scripts.matches` in [manifest.json](manifest.json).

## Icons

Not checked in yet — add 16/48/128 PNGs to `public/` and re-add the `icons` block in `manifest.json` before store submission.
