# Page Semantic Extractor

**Chrome extension** — extract semantic content from any web page and send structured JSON to a remote API. Features human-like scroll anti-bot and recursive DFS exploration.

> Built with **Angular 21** + **Angular Material 21** (standalone components, signals, OnPush).

---

## Features

| Feature | Description |
|---------|-------------|
| **Semantic extraction** | Parses DOM → headings, paragraphs, lists, tables, images, links |
| **Human-like scroll** | Configurable speed, variance, pauses — bypasses lazy-load and infinite scroll anti-bots |
| **DFS exploration** | Recursively crawls linked pages up to N depth |
| **Configurable API** | POST to any endpoint with Bearer token or API Key auth |
| **Angular popup** | Signal-based UI with Angular Material — status, progress, logs |
| **Options panel** | Full configuration: endpoint, auth, scroll params, exploration rules, click selectors |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | Angular 21 standalone components + Angular Material 21 (M3 theming) |
| State | Angular Signals (`signal()`, `computed()`) |
| Content scripts | Vanilla JS ES2022 (run in isolated world) |
| Background | Service Worker (TypeScript → compiled to JS) |
| Storage | `chrome.storage.sync` (config) + `chrome.storage.local` (logs) |
| Build | `@angular/cli 21` |

---

## Project Structure

```
page-extractor/
├── src/
│   ├── app/                    # Root Angular app component (shell routing)
│   ├── popup/                  # Popup Angular component
│   ├── options/                # Options page Angular component
│   ├── background/
│   │   └── service-worker.ts   # Orchestrator (scroll → extract → explore → POST)
│   ├── content-script/
│   │   ├── message-bridge.js  # postMessage bridge ↔ background
│   │   ├── scroll-bot.js      # Human-like scroll anti-bot
│   │   ├── extractor.js       # DOM → semantic JSON
│   │   └── link-finder.js     # DFS link discovery
│   ├── shared/
│   │   ├── models/             # TypeScript interfaces
│   │   └── services/          # Angular services (storage, api, extraction, scroll, explorer)
│   ├── index.html
│   ├── main.ts
│   ├── manifest.json
│   └── styles.scss
├── page-extractor/             # Angular project (build source)
├── dist-chrome/                # Built extension (load in Chrome)
├── test-extension.js           # Playwright test suite
├── SPEC.md                     # Full specification
└── README.md
```

---

## Install & Build

```bash
# Install dependencies
cd page-extractor
npm install

# Development build (Angular + Service Worker)
ng build --configuration=development
npx tsc --project tsconfig.service-worker.json

# Copy to dist-chrome/
cp -r page-extractor/dist/page-extractor/browser/* ../dist-chrome/
cp page-extractor/src/manifest.json ../dist-chrome/
```

---

## Load in Chrome

1. Ouvrir `chrome://extensions/`
2. Activer **Mode développeur** (toggle en haut à droite)
3. Cliquer **« Charger l'extension non empaquetée »**
4. Sélectionner le dossier `dist-chrome/`

---

## Run Tests

```bash
# Start local server (for Playwright to serve the extension files)
cd page-extractor
python3 -m http.server 8888 &

# Run Playwright tests
node test-extension.js
```

---

## JSON Output Schema

```json
{
  "url": "https://example.com/article",
  "title": "Titre de la page",
  "description": "Meta description",
  "lang": "fr",
  "extractedAt": "2026-05-30T12:00:00.000Z",
  "depth": 0,
  "parentUrl": null,
  "content": {
    "headings":    [{ "level": 1, "text": "..." }],
    "paragraphs":  [{ "index": 0, "text": "..." }],
    "lists":       [{ "type": "ul", "items": ["..."] }],
    "tables":      [{ "headers": ["..."], "rows": [["..."]] }],
    "images":      [{ "src": "https://...", "alt": "...", "isDecorative": false }],
    "links":       [{ "href": "https://...", "text": "...", "isExternal": true, "crawlDecision": "explore" }]
  },
  "metadata": {
    "wordCount": 1240,
    "readabilityScore": 72,
    "scrollEventsFired": 3,
    "contentLoadedAfterScroll": true
  }
}
```

---

## Configuration (Options page)

| Section | Setting | Description |
|---------|---------|-------------|
| **Web Service** | Endpoint URL | POST target |
| | Auth type | None / Bearer Token / API Key |
| | Token | Stored in `chrome.storage.session` |
| **Scroll** | Enabled | Toggle scroll behavior |
| | Iterations | Number of scroll cycles |
| | Speed (px/s) | Base scroll speed |
| | Speed variance (%) | Random ±% variation |
| | Pause between scrolls | ms |
| | Return to top | After each scroll cycle |
| **Exploration** | Enabled | Toggle DFS exploration |
| | Max depth | Crawl depth (1–5) |
| | Links per page | Max links to follow per page |
| | Same domain only | Restrict to same domain |
| | Exclude domains | Comma-separated list |
| **Click Selectors** | CSS selectors | Elements to click to load more content |

---

## License

MIT