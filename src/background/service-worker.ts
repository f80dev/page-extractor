/**
 * service-worker.ts
 * Background orchestrator for the Chrome extension
 * Coordinates: scroll → extract → explore → POST to API
 */

// Types (duplicated here since TS in service worker needs special handling)
// In production, these would be imported from shared/models/

interface PageContent {
  url: string;
  title: string;
  description: string;
  lang: string;
  extractedAt: string;
  depth: number;
  parentUrl: string | null;
  content: {
    headings: Array<{ level: number; text: string; id?: string }>;
    paragraphs: Array<{ index: number; text: string }>;
    lists: Array<{ type: 'ul' | 'ol'; items: string[] }>;
    tables: Array<{ headers: string[]; rows: string[][] }>;
    images: Array<{ src: string; alt: string; isDecorative: boolean }>;
    links: Array<{ href: string; text: string; isExternal: boolean; crawlDecision: string; reason?: string }>;
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

interface ExtensionConfig {
  endpoint: string;
  authType: 'none' | 'bearer' | 'apikey';
  token: string;
  scrollEnabled: boolean;
  scrollIterations: number;
  scrollSpeedPxPerSec: number;
  scrollSpeedVariance: number;
  pauseBetweenScrollMs: number;
  pauseVarianceMs: number;
  returnToTop: boolean;
  scrollMaxDurationSec: number;
  explorationEnabled: boolean;
  maxDepth: number;
  linksPerPageLimit: number;
  excludeDomains: string[];
  onlySameDomain: boolean;
  followExternalLinks: boolean;
  explorationDelayMs: number;
  explorationDelayVarianceMs: number;
  maxTotalPages: number;
  clickSelectors: string[];
}

interface ExplorationQueueItem {
  url: string;
  depth: number;
  parentUrl: string | null;
}

const DEFAULT_CONFIG: ExtensionConfig = {
  endpoint: '',
  authType: 'none',
  token: '',
  scrollEnabled: true,
  scrollIterations: 3,
  scrollSpeedPxPerSec: 1000,
  scrollSpeedVariance: 20,
  pauseBetweenScrollMs: 600,
  pauseVarianceMs: 200,
  returnToTop: true,
  scrollMaxDurationSec: 30,
  explorationEnabled: false,
  maxDepth: 1,
  linksPerPageLimit: 10,
  excludeDomains: [],
  onlySameDomain: true,
  followExternalLinks: false,
  explorationDelayMs: 2000,
  explorationDelayVarianceMs: 500,
  maxTotalPages: 20,
  clickSelectors: []
};

// State
let currentConfig: ExtensionConfig = DEFAULT_CONFIG;
let isExplorationActive = false;
let explorationQueue: ExplorationQueueItem[] = [];
let visitedUrls = new Set<string>();
let totalExplored = 0;
let explorationStats = {
  startedAt: '',
  finishedAt: '',
  totalPages: 0,
  successfulPages: 0,
  failedPages: 0
};

// ==================== STORAGE ====================

async function loadConfig(): Promise<ExtensionConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['extensionConfig'], (result) => {
      if (result.extensionConfig) {
        currentConfig = { ...DEFAULT_CONFIG, ...result.extensionConfig };
      }
      resolve(currentConfig);
    });
  });
}

async function saveConfig(config: ExtensionConfig): Promise<void> {
  currentConfig = config;
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ extensionConfig: config }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

async function logRequest(log: {
  url: string;
  timestamp: string;
  depth: number;
  status: number;
  statusText: string;
  sizeBytes: number;
  durationMs: number;
}): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['requestLogs'], (result) => {
      const logs = result.requestLogs || [];
      logs.unshift(log);
      // Keep only last 50
      if (logs.length > 50) logs.length = 50;
      chrome.storage.local.set({ requestLogs: logs }, resolve);
    });
  });
}

async function saveExplorationState(state: {
  isActive: boolean;
  totalExplored: number;
  queueLength: number;
  stats: typeof explorationStats;
}): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ explorationState: state }, resolve);
  });
}

async function notifyPopup(update: {
  type: 'progress' | 'complete' | 'error' | 'scroll_status';
  payload: any;
}): Promise<void> {
  // Notify all extension pages (popup, options)
  const response = await chrome.runtime.sendMessage({
    type: 'POPUP_UPDATE',
    ...update
  }).catch(() => {});
}

// ==================== HTTP ====================

async function sendToApi(payload: PageContent): Promise<{ status: number; statusText: string; body: any }> {
  const { endpoint, authType, token } = currentConfig;

  if (!endpoint) {
    throw new Error('No endpoint configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authType === 'bearer' && token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (authType === 'apikey' && token) {
    headers['X-API-Key'] = token;
  }

  const startTime = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const durationMs = Date.now() - startTime;
    const sizeBytes = JSON.stringify(payload).length;

    // Log the request
    await logRequest({
      url: payload.url,
      timestamp: payload.extractedAt,
      depth: payload.depth,
      status: response.status,
      statusText: response.statusText,
      sizeBytes,
      durationMs
    });

    let body: any;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return { status: response.status, statusText: response.statusText, body };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    await logRequest({
      url: payload.url,
      timestamp: new Date().toISOString(),
      depth: payload.depth,
      status: 0,
      statusText: error.message || 'Network error',
      sizeBytes: 0,
      durationMs
    });
    throw error;
  }
}

// ==================== EXPLORATION ====================

async function addToQueue(urls: string[], depth: number, parentUrl: string): Promise<void> {
  const { maxTotalPages, maxDepth } = currentConfig;

  for (const url of urls) {
    if (totalExplored >= maxTotalPages) break;
    if (visitedUrls.has(url)) continue;
    if (depth > maxDepth) continue;

    visitedUrls.add(url);
    explorationQueue.push({ url, depth, parentUrl });
  }
}

function randomDelay(base: number, variance: number): Promise<void> {
  const delay = base + (Math.random() - 0.5) * 2 * variance;
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
}

async function exploreNext(): Promise<void> {
  if (!isExplorationActive || explorationQueue.length === 0) {
    return;
  }

  const item = explorationQueue.shift();
  if (!item) return;

  const { explorationDelayMs, explorationDelayVarianceMs, scrollEnabled } = currentConfig;

  // Update progress
  totalExplored++;
  await notifyPopup({
    type: 'progress',
    payload: {
      explored: totalExplored,
      total: Math.min(currentConfig.maxTotalPages, explorationQueue.length + totalExplored),
      currentUrl: item.url,
      depth: item.depth
    }
  });
  await saveExplorationState({
    isActive: isExplorationActive,
    totalExplored,
    queueLength: explorationQueue.length,
    stats: explorationStats
  });

  // Process this page
  try {
    // Create a tab for the URL
    const tab = await chrome.tabs.create({
      url: item.url,
      active: false,
      pinned: true
    });

    // Wait for the tab to load
    await new Promise<void>((resolve) => {
      const listener = (tabId: number, changeInfo: any) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 60s
      setTimeout(resolve, 60000);
    });

    // Execute scroll and extraction via content scripts
    const extractResult = await chrome.tabs.sendMessage(tab.id!, {
      type: 'EXTRACT_WITH_SCROLL',
      payload: {
        url: item.url,
        depth: item.depth,
        parentUrl: item.parentUrl,
        scrollEnabled
      }
    }).catch((err) => {
      console.error('[ServiceWorker] Extraction failed for', item.url, err);
      return null;
    });

    if (extractResult) {
      // Send to API
      await sendToApi(extractResult);

      // If exploration enabled and depth < maxDepth, add discovered links to queue
      if (currentConfig.explorationEnabled && item.depth < currentConfig.maxDepth) {
        const discoveredUrls = extractResult.content.links
          .filter(l => l.crawlDecision === 'explore')
          .map(l => l.href);

        await addToQueue(discoveredUrls, item.depth + 1, item.url);
      }

      explorationStats.successfulPages++;
    } else {
      explorationStats.failedPages++;
    }

    // Close the tab
    chrome.tabs.remove(tab.id!).catch(() => {});

  } catch (error: any) {
    console.error('[ServiceWorker] Error processing', item.url, error);
    explorationStats.failedPages++;
  }

  // Delay before next page
  await randomDelay(explorationDelayMs, explorationDelayVarianceMs);

  // Continue exploration
  if (isExplorationActive) {
    await exploreNext();
  }
}

async function startExploration(initialUrl: string): Promise<void> {
  if (isExplorationActive) return;

  await loadConfig();
  await saveExplorationState({
    isActive: true,
    totalExplored: 0,
    queueLength: 0,
    stats: explorationStats
  });

  isExplorationActive = true;
  visitedUrls.clear();
  explorationQueue = [];
  totalExplored = 0;
  explorationStats = {
    startedAt: new Date().toISOString(),
    finishedAt: '',
    totalPages: 0,
    successfulPages: 0,
    failedPages: 0
  };

  visitedUrls.add(initialUrl);
  explorationQueue.push({ url: initialUrl, depth: 0, parentUrl: null });

  await notifyPopup({
    type: 'progress',
    payload: {
      explored: 0,
      total: 1,
      currentUrl: initialUrl,
      depth: 0
    }
  });

  await exploreNext();
}

async function stopExploration(): Promise<void> {
  isExplorationActive = false;
  explorationStats.finishedAt = new Date().toISOString();

  await saveExplorationState({
    isActive: false,
    totalExplored,
    queueLength: explorationQueue.length,
    stats: explorationStats
  });

  await notifyPopup({
    type: 'complete',
    payload: {
      totalExplored,
      stats: explorationStats
    }
  });
}

// ==================== SINGLE PAGE EXTRACTION ====================

async function extractAndSendSingle(tabId: number, url: string): Promise<any> {
  await loadConfig();

  const { scrollEnabled, scrollIterations, scrollSpeedPxPerSec, scrollSpeedVariance,
          pauseBetweenScrollMs, pauseVarianceMs, returnToTop, scrollMaxDurationSec } = currentConfig;

  // If scroll enabled, send scroll command first
  if (scrollEnabled) {
    await chrome.tabs.sendMessage(tabId, {
      type: 'START_SCROLL',
      payload: {
        config: {
          scrollIterations,
          scrollSpeedPxPerSec,
          scrollSpeedVariance,
          pauseBetweenScrollMs,
          pauseVarianceMs,
          returnToTop,
          scrollMaxDurationSec,
          enabled: true
        }
      }
    });

    // Wait for scroll completion (via PAGE_SCROLL_COMPLETE message)
    // In practice, this would use a promise that resolves on the message
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simplified: wait 2s
  }

  // Send extraction command
  const result = await chrome.tabs.sendMessage(tabId, {
    type: 'START_EXTRACTION',
    payload: {
      url,
      scrollEnabled,
      scrollEventsFired: scrollEnabled ? scrollIterations : 0
    }
  }).catch((err) => {
    throw new Error(`Extraction failed: ${err.message}`);
  });

  // Send to API
  await sendToApi(result);

  await notifyPopup({
    type: 'complete',
    payload: { url, status: 'success' }
  });

  return result;
}

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message.type) {
      case 'GET_CONFIG':
        await loadConfig();
        sendResponse(currentConfig);
        break;

      case 'SAVE_CONFIG':
        await saveConfig(message.config);
        sendResponse({ success: true });
        break;

      case 'EXTRACT_SINGLE':
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id || !tab.url) {
            throw new Error('No active tab');
          }
          const result = await extractAndSendSingle(tab.id, tab.url);
          sendResponse({ success: true, result });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'START_EXPLORATION':
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) throw new Error('No active tab');
          await startExploration(tab.url);
          sendResponse({ success: true });
        } catch (error: any) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'STOP_EXPLORATION':
        await stopExploration();
        sendResponse({ success: true });
        break;

      case 'GET_EXPLORATION_STATUS':
        sendResponse({
          isActive: isExplorationActive,
          totalExplored,
          queueLength: explorationQueue.length,
          stats: explorationStats
        });
        break;

      case 'GET_LOGS':
        return new Promise((resolve) => {
          chrome.storage.local.get(['requestLogs'], (result) => {
            resolve(result.requestLogs || []);
          });
        });

      case 'CLEAR_LOGS':
        await chrome.storage.local.set({ requestLogs: [] });
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  };

  handleAsync().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // Keep channel open for async response
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[PageExtractor] Service worker installed');
  await loadConfig();
});

export {};