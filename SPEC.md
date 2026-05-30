# Page Semantic Extractor — Specification

## 1. Overview

**Name:** Page Semantic Extractor
**Type:** Chrome Extension (Manifest V3)
**Summary:** Analyzes the current web page's DOM, extracts semantic content (headings, paragraphs, lists, tables, images, links), and sends a structured JSON payload to a configurable remote web service. Includes human-like scroll anti-bot to load lazy content and recursive DFS exploration of linked pages.

---

## 2. Architecture

```
Chrome Extension (Manifest V3)
├── Angular 21 App (popup + options)
│   └── Communicates via chrome.runtime.sendMessage
├── Content Scripts (Vanilla JS — isolated world)
│   ├── message-bridge.js   — postMessage bridge to page
│   ├── scroll-bot.js       — human-like scroll anti-bot
│   ├── extractor.js        — DOM → semantic JSON
│   └── link-finder.js      — DFS link discovery
├── Background Service Worker
│   └── Orchestrates: scroll → extract → explore → POST
└── Storage
    ├── chrome.storage.sync  — config
    └── chrome.storage.local — logs
```

---

## 3. Features

### F1 — Semantic Extraction
Extracts from the DOM:
- `headings[]` — h1–h6 with text and optional id
- `paragraphs[]` — p elements with text
- `lists[]` — ul/ol with extracted items
- `tables[]` — headers + rows
- `images[]` — src, alt, isDecorative flag
- `links[]` — href, text, isExternal, crawlDecision

Excludes: nav, footer, script, style, noscript, iframe, hidden elements.

### F2 — Scroll Anti-Bot
Simulates human scrolling:
- Configurable base speed (px/sec) + variance %
- Random pauses between scrolls (ms + variance)
- Multiple iterations
- Return-to-top between iterations
- Optional CSS click selectors to reveal hidden content
- Max duration guard (seconds)

### F3 — REST API Export
- POST JSON to configurable endpoint
- Auth: None / Bearer Token / API Key (X-API-Key header)
- Log every request: URL, timestamp, HTTP status, size, duration
- Retry on failure (no retry by default — caller handles)

### F4 — DFS Exploration
- Recursive depth-first traversal of linked pages
- Configurable max depth (0–5)
- Max total pages limit
- Same-domain restriction
- Exclude domain list
- Per-link crawlDecision: explore | skip-same-domain | skip-external | blocked

### F5 — Popup UI
Angular 21 standalone + Angular Material 21:
- Current page URL display
- "Extraire & Envoyer" primary action button
- Loading spinner + status message
- Exploration progress bar
- Last action status chip (success/error)
- Options link

### F6 — Options Page
Angular 21 with 5 tabs:
1. **Web Service** — endpoint URL, auth type, token
2. **Scroll** — all scroll-bot parameters
3. **Exploration** — DFS rules, depth, limits
4. **Click Selectors** — dynamic list of CSS selectors
5. **Logs** — mat-table of last 50 requests

---

## 4. JSON Schema

```typescript
interface PageContent {
  url: string;
  title: string;
  description: string;
  lang: string;
  extractedAt: string;        // ISO 8601
  depth: number;
  parentUrl: string | null;
  content: {
    headings:    Array<{ level: 1|2|3|4|5|6; text: string; id?: string }>;
    paragraphs:  Array<{ index: number; text: string }>;
    lists:       Array<{ type: 'ul'|'ol'; items: string[] }>;
    tables:      Array<{ headers: string[]; rows: string[][] }>;
    images:      Array<{ src: string; alt: string; isDecorative: boolean }>;
    links:       Array<{ href: string; text: string; isExternal: boolean; crawlDecision: string }>;
  };
  metadata: {
    wordCount: number;
    readabilityScore?: number;
    canonicalUrl?: string;
    ogImage?: string;
    scrollEventsFired: number;
    contentLoadedAfterScroll: boolean;
  };
}
```

---

## 5. Message Protocol

### Popup → Background (chrome.runtime.sendMessage)

| Message type | Payload | Response |
|---|---|---|
| `GET_CONFIG` | — | `ExtensionConfig` |
| `SAVE_CONFIG` | `ExtensionConfig` | `{ success: boolean }` |
| `EXTRACT_SINGLE` | — | `{ success: boolean; result?: PageContent; error?: string }` |
| `START_EXPLORATION` | — | `{ success: boolean; error?: string }` |
| `STOP_EXPLORATION` | — | `{ success: boolean }` |
| `GET_EXPLORATION_STATUS` | — | Exploration status object |
| `GET_LOGS` | — | `LogEntry[]` |
| `CLEAR_LOGS` | — | `{ success: boolean }` |

### Background → Content Scripts (chrome.tabs.sendMessage)

| Message type | Payload | Response |
|---|---|---|
| `START_SCROLL` | `ScrollConfig` | `{ eventsFired: number; contentLoaded: boolean }` |
| `START_EXTRACTION` | `ExtractionContext` | `PageContent` |
| `START_LINK_FINDING` | `LinkFindingContext` | `string[]` (URLs) |

---

## 6. Content Script APIs (window.*)

Available from page context via postMessage to bridge:

```javascript
window.__PAGE_SCROLL_BOT__.start(config)    // Start scrolling
window.__PAGE_SCROLL_BOT__.stop()            // Stop scrolling
window.__PAGE_SCROLL_BOT__.getState()        // { isScrolling, eventsFired }

window.__PAGE_EXTRACTOR__.extract(url, depth, parentUrl)  // Full extraction
window.__PAGE_EXTRACTOR__.getLinks()         // All visible links

window.__PAGE_LINK_FINDER__.find(selector)  // Get links matching selector
```

---

## 7. Configuration Schema

```typescript
interface ExtensionConfig {
  // Web Service
  endpoint: string;
  authType: 'none' | 'bearer' | 'apikey';
  token: string;

  // Scroll
  scrollEnabled: boolean;
  scrollIterations: number;
  scrollSpeedPxPerSec: number;
  scrollSpeedVariance: number;       // ±%
  pauseBetweenScrollMs: number;
  pauseVarianceMs: number;
  returnToTop: boolean;
  scrollMaxDurationSec: number;
  clickSelectors: string[];

  // Exploration
  explorationEnabled: boolean;
  maxDepth: number;                  // 0–5
  linksPerPageLimit: number;
  excludeDomains: string[];
  onlySameDomain: boolean;
  followExternalLinks: boolean;
  explorationDelayMs: number;
  explorationDelayVarianceMs: number;
  maxTotalPages: number;
}
```

---

## 8. Chrome Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Access the currently active tab for extraction |
| `storage` | Persist config and logs |
| `<all_urls>` (host_permissions) | Content scripts injected into all pages |

---

## 9. Security

- Token stored in `chrome.storage.session` (cleared on browser close)
- HTTPS required for endpoint (warning if not)
- Content scripts are **read-only** — never modify the DOM
- CSP compliant with Manifest V3