/**
 * service-worker.ts
 * Background orchestrator for the Chrome extension
 */

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

let currentConfig: ExtensionConfig = { ...DEFAULT_CONFIG };
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
    chrome.storage.sync.get(['extensionConfig'], (result: Record<string, unknown>) => {
      const cfg = result['extensionConfig'] as Partial<ExtensionConfig> | undefined;
      if (cfg) {
        currentConfig = { ...DEFAULT_CONFIG, ...cfg };
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
        reject(new Error(String(chrome.runtime.lastError)));
      } else {
        resolve();
      }
    });
  });
}

interface LogEntry {
  url: string;
  timestamp: string;
  depth: number;
  status: number;
  statusText: string;
  sizeBytes: number;
  durationMs: number;
}

async function logRequest(log: LogEntry): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['requestLogs'], (result: Record<string, unknown>) => {
      const logs = (result['requestLogs'] as LogEntry[]) || [];
      logs.unshift(log);
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
  await chrome.runtime.sendMessage({
    ...update,
    type: 'POPUP_UPDATE'
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
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    await logRequest({
      url: payload.url,
      timestamp: new Date().toISOString(),
      depth: payload.depth,
      status: 0,
      statusText: error instanceof Error ? error.message : 'Network error',
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

  try {
    const tab = await chrome.tabs.create({
      url: item.url,
      active: false,
      pinned: true
    });

    await new Promise<void>((resolve) => {
      const listener = (tabId: number, changeInfo: { status?: string }) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(resolve, 60000);
    });

    const extractResult = await chrome.tabs.sendMessage(tab.id!, {
      type: 'EXTRACT_WITH_SCROLL',
      payload: {
        url: item.url,
        depth: item.depth,
        parentUrl: item.parentUrl,
        scrollEnabled
      }
    }).catch((err: unknown) => {
      console.error('[ServiceWorker] Extraction failed for', item.url, err);
      return null;
    });

    if (extractResult) {
      await sendToApi(extractResult);

      if (currentConfig.explorationEnabled && item.depth < currentConfig.maxDepth) {
        const discoveredUrls = (extractResult.content?.links as Array<{ href: string; crawlDecision: string }> || [])
          .filter((l: { href: string; crawlDecision: string }) => l.crawlDecision === 'explore')
          .map((l: { href: string }) => l.href);

        await addToQueue(discoveredUrls, item.depth + 1, item.url);
      }

      explorationStats.successfulPages++;
    } else {
      explorationStats.failedPages++;
    }

    chrome.tabs.remove(tab.id!).catch(() => {});

  } catch (error: unknown) {
    console.error('[ServiceWorker] Error processing', item.url, error);
    explorationStats.failedPages++;
  }

  await randomDelay(explorationDelayMs, explorationDelayVarianceMs);

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
    payload: { totalExplored, stats: explorationStats }
  });
}

// ==================== SINGLE PAGE EXTRACTION ====================

async function extractAndSendSingle(tabId: number, url: string): Promise<PageContent> {
  await loadConfig();

  const {
    scrollEnabled, scrollIterations, scrollSpeedPxPerSec, scrollSpeedVariance,
    pauseBetweenScrollMs, pauseVarianceMs, returnToTop, scrollMaxDurationSec
  } = currentConfig;

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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const result = await chrome.tabs.sendMessage(tabId, {
    type: 'START_EXTRACTION',
    payload: {
      url,
      scrollEnabled,
      scrollEventsFired: scrollEnabled ? scrollIterations : 0
    }
  }).catch((err: unknown) => {
    throw new Error(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  await sendToApi(result);

  await notifyPopup({
    type: 'complete',
    payload: { url, status: 'success' }
  });

  return result;
}

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((
  message: { type: string; config?: ExtensionConfig; url?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  const handleAsync = async () => {
    switch (message.type) {
      case 'GET_CONFIG':
        await loadConfig();
        sendResponse(currentConfig);
        return;

      case 'SAVE_CONFIG':
        if (message.config) {
          await saveConfig(message.config);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No config provided' });
        }
        return;

      case 'EXTRACT_SINGLE': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id || !tab.url) throw new Error('No active tab');
          const result = await extractAndSendSingle(tab.id, tab.url);
          sendResponse({ success: true, result });
        } catch (error: unknown) {
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      case 'START_EXPLORATION': {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) throw new Error('No active tab');
          await startExploration(tab.url);
          sendResponse({ success: true });
        } catch (error: unknown) {
          sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      case 'STOP_EXPLORATION':
        await stopExploration();
        sendResponse({ success: true });
        return;

      case 'GET_EXPLORATION_STATUS':
        sendResponse({
          isActive: isExplorationActive,
          totalExplored,
          queueLength: explorationQueue.length,
          stats: explorationStats
        });
        return;

      case 'GET_LOGS':
        return new Promise<LogEntry[]>((resolve) => {
          chrome.storage.local.get(['requestLogs'], (result: Record<string, unknown>) => {
            const logs = (result['requestLogs'] as LogEntry[]) || [];
            resolve(logs);
          });
        });

      case 'CLEAR_LOGS':
        await chrome.storage.local.set({ requestLogs: [] });
        sendResponse({ success: true });
        return;

      default:
        sendResponse({ error: 'Unknown message type' });
        return;
    }
  };

  handleAsync().then(sendResponse).catch((err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[PageExtractor] Service worker installed');
  await loadConfig();
});