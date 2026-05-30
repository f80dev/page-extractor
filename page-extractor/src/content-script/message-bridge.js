/**
 * message-bridge.js
 * Bridge between content scripts and Chrome extension background
 * Runs in page context, communicates via chrome.runtime
 */

(function () {
  'use strict';

  const pendingRequests = new Map();
  let messageIdCounter = 0;

  // Listen for messages from other content scripts (scroll-bot, extractor, link-finder)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    const { type, payload, requestId } = event.data;

    if (type === 'PAGE_READY') {
      // Scroll bot signals that scroll is complete and page is ready
      chrome.runtime.sendMessage({
        type: 'PAGE_SCROLL_COMPLETE',
        payload
      }).catch(() => {});
      return;
    }

    if (type === 'GET_EXTRACTION_CONFIG') {
      // Request config from background
      chrome.runtime.sendMessage({
        type: 'GET_CONFIG',
        requestId
      }).then((response) => {
        window.postMessage({ type: 'CONFIG_RESPONSE', requestId, payload: response }, '*');
      }).catch(() => {
        window.postMessage({ type: 'CONFIG_RESPONSE', requestId, payload: null }, '*');
      });
      return;
    }

    if (type === 'EXTRACTION_RESULT') {
      // Extractor sends result back
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_RESULT',
        payload,
        requestId
      }).catch(() => {});
      return;
    }

    if (type === 'LINKS_FOUND') {
      // Link finder sends discovered links
      chrome.runtime.sendMessage({
        type: 'LINKS_FOUND',
        payload,
        requestId
      }).catch(() => {});
      return;
    }

    if (type === 'EXPLORATION_TRIGGER') {
      // Background triggers exploration for a specific URL
      chrome.runtime.sendMessage({
        type: 'EXPLORATION_TRIGGER',
        payload: { url: payload.url, depth: payload.depth }
      }).catch(() => {});
      return;
    }
  });

  // Listen for messages from background (via content script port)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTENT_SCRIPT_COMMAND') {
      // Forward to scroll-bot or extractor via window.postMessage
      window.postMessage({ type: message.command, payload: message.payload }, '*');
      sendResponse({ received: true });
      return true;
    }

    if (message.type === 'INJECT_SCRIPT') {
      // Inject a script file dynamically
      const script = document.createElement('script');
      script.src = message.src;
      (document.head || document.documentElement).appendChild(script);
      sendResponse({ injected: true });
      return true;
    }
  });

  // Signal that bridge is ready
  window.__PAGE_EXTRACTOR_BRIDGE_READY = true;

  console.log('[PageExtractor] Message bridge ready');
})();