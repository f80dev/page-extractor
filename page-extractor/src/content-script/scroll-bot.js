/**
 * scroll-bot.js
 * Simulates human-like scrolling to load lazy content and infinite scroll
 * Runs in page context, sends events via postMessage to message-bridge
 */

(function () {
  'use strict';

  if (window.__PAGE_EXTRACTOR_SCROLLBOT_RUNNING) return;

  // Check headless mode
  const isHeadless = navigator.webdriver === true;

  const config = {
    scrollIterations: 3,
    scrollSpeedPxPerSec: 1000,
    scrollSpeedVariance: 20,
    pauseBetweenScrollMs: 600,
    pauseVarianceMs: 200,
    returnToTop: true,
    scrollMaxDurationSec: 30,
    enabled: true
  };

  let scrollEventsFired = 0;
  let startTime = null;
  let stopped = false;

  // Utility functions
  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function getScrollSpeed() {
    const variance = config.scrollSpeedVariance / 100;
    const speed = config.scrollSpeedPxPerSec * (1 + randomBetween(-variance, variance));
    return Math.max(300, Math.min(3000, speed));
  }

  function getPauseDuration() {
    return randomBetween(
      config.pauseBetweenScrollMs - config.pauseVarianceMs,
      config.pauseBetweenScrollMs + config.pauseVarianceMs
    );
  }

  function getDocumentHeight() {
    return Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
  }

  function getViewportHeight() {
    return window.innerHeight;
  }

  function hasReachedBottom(threshold = 50) {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = getDocumentHeight();
    const clientHeight = getViewportHeight();
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }

  // Check if new content loaded after scroll
  function detectNewContent(initialContentHash) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    let newLoaded = 0;
    images.forEach((img) => {
      if (img.src && !img.classList.contains('page-extractor-scanned')) {
        newLoaded++;
        img.classList.add('page-extractor-scanned');
      }
    });
    return newLoaded;
  }

  // Smooth scroll step
  async function smoothScrollStep(targetY, durationMs) {
    return new Promise((resolve) => {
      const startY = window.scrollY;
      const startTime = performance.now();
      scrollEventsFired++;

      function step(currentTime) {
        if (stopped) {
          resolve();
          return;
        }

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentY = startY + (targetY - startY) * eased;

        window.scrollTo(0, currentY);

        if (progress < 1 && !stopped) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  // Scroll to bottom of page
  async function scrollToBottom() {
    const scrollHeight = getDocumentHeight();
    const clientHeight = getViewportHeight();
    const maxScroll = scrollHeight - clientHeight;
    const distance = maxScroll - (window.scrollY || document.documentElement.scrollTop);

    if (distance <= 0) return;

    const speed = getScrollSpeed();
    const durationMs = Math.abs(distance) / speed * 1000;

    await smoothScrollStep(maxScroll, durationMs);
  }

  // Scroll back to top
  async function scrollToTop() {
    await smoothScrollStep(0, 2000); // Slow scroll to top
  }

  // Wait for network idle
  async function waitForNetworkIdle(timeoutMs = 2000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, timeoutMs);

      if (window.PerformanceObserver) {
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const hasNetwork = entries.some(e => e.entryType === 'resource' || e.entryType === 'navigation');
            if (hasNetwork) {
              clearTimeout(timeout);
              setTimeout(resolve, 800); // Give a bit more time after last network activity
            }
          });
          observer.observe({ entryTypes: ['resource', 'navigation'] });

          // Also check existing images
          const lazyImages = document.querySelectorAll('img[loading="lazy"]');
          lazyImages.forEach(img => {
            if (!img.src.includes('data:') && img.src) {
              img.classList.add('page-extractor-scanned');
            }
          });
        } catch (e) {
          clearTimeout(timeout);
          resolve();
        }
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  // Main scroll loop
  async function executeScroll() {
    if (isHeadless) {
      console.warn('[PageExtractor] Headless detected — scroll skipped');
      signalScrollComplete({ skipped: true, reason: 'headless' });
      return;
    }

    if (!config.enabled) {
      signalScrollComplete({ skipped: true, reason: 'disabled' });
      return;
    }

    console.log('[PageExtractor] Starting scroll simulation');
    startTime = Date.now();
    stopped = false;

    try {
      // Wait for initial JS to execute
      await new Promise(r => setTimeout(r, 500));

      const docHeight = getDocumentHeight();
      if (docHeight <= getViewportHeight()) {
        // Page is short, no scroll needed
        signalScrollComplete({ skipped: true, reason: 'short_page', scrollEventsFired });
        return;
      }

      for (let i = 0; i < config.scrollIterations && !stopped; i++) {
        // Check timeout
        if (Date.now() - startTime > config.scrollMaxDurationSec * 1000) {
          console.warn('[PageExtractor] Scroll timeout reached');
          break;
        }

        await scrollToBottom();
        await waitForNetworkIdle();

        const previousHeight = getDocumentHeight();
        await new Promise(r => setTimeout(r, getPauseDuration()));

        // Check if new content loaded
        const newContent = detectNewContent(null);
        if (newContent > 0) {
          console.log(`[PageExtractor] ${newContent} new lazy elements detected, continuing...`);
        }

        const newHeight = getDocumentHeight();
        if (newHeight > previousHeight && i < config.scrollIterations - 1) {
          // More content loaded, do another pass
          i = Math.max(i, i); // Allow one extra iteration
        }

        // Check if we've reached bottom
        if (hasReachedBottom() && i < config.scrollIterations - 1) {
          // Check for infinite scroll sentinel
          const sentinel = document.querySelector('[data-infinite-scroll-sentinel]') ||
                           document.querySelector('.infinite-scroll-sentinel');
          if (!sentinel) {
            console.log('[PageExtractor] Reached bottom of page');
            break;
          }
        }
      }

      // Return to top if configured
      if (config.returnToTop && !stopped) {
        await new Promise(r => setTimeout(r, 300));
        await scrollToTop();
        await new Promise(r => setTimeout(r, 300));
      }

      signalScrollComplete({ success: true, scrollEventsFired, stopped });
    } catch (error) {
      console.error('[PageExtractor] Scroll error:', error);
      signalScrollComplete({ error: error.message, scrollEventsFired });
    }
  }

  // Signal scroll completion to bridge
  function signalScrollComplete(result) {
    window.postMessage({
      type: 'PAGE_READY',
      payload: {
        scrollConfig: config,
        result,
        timestamp: new Date().toISOString(),
        documentHeight: getDocumentHeight(),
        viewportHeight: getViewportHeight(),
        scrollEventsFired: scrollEventsFired
      }
    }, '*');
  }

  // Listen for commands from background via message bridge
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'START_SCROLL' || event.data.type === 'CONTENT_SCRIPT_COMMAND') {
      if (event.data.payload && event.data.payload.config) {
        Object.assign(config, event.data.payload.config);
      }
      executeScroll();
    }

    if (event.data.type === 'STOP_SCROLL') {
      stopped = true;
      window.scrollTo(0, 0);
    }
  });

  // Auto-start if message bridge is already ready
  if (window.__PAGE_EXTRACTOR_BRIDGE_READY) {
    // Wait for explicit START_SCROLL command from background
  }

  window.__PAGE_EXTRACTOR_SCROLLBOT_RUNNING = true;
  console.log('[PageExtractor] Scroll bot ready');
})();