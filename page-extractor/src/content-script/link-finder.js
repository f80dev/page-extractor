/**
 * link-finder.js
 * Discovers and filters links for recursive exploration
 * Runs in page context, sends results via postMessage to message-bridge
 */

(function () {
  'use strict';

  if (window.__PAGE_EXTRACTOR_LINKFINDER_RUNNING) return;

  function normalizeUrl(href, baseUrl) {
    try {
      const url = new URL(href, baseUrl);
      return url.href;
    } catch {
      return null;
    }
  }

  function getCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      return normalizeUrl(canonical.href, window.location.href);
    }
    return window.location.href;
  }

  function findLinks(config = {}) {
    const {
      onlySameDomain = true,
      excludeDomains = [],
      linksPerPageLimit = 10,
      followExternalLinks = false
    } = config;

    const currentHostname = new URL(window.location.href).hostname;
    const canonicalUrl = getCanonicalUrl();
    const visitedUrls = new Set();
    const discoveredLinks = [];
    let skippedCount = 0;
    const skipReasons = {};

    function addSkipReason(reason) {
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      skippedCount++;
    }

    // Get all anchor elements
    const anchors = document.querySelectorAll('a[href]');

    anchors.forEach((a) => {
      let href = a.href;

      // Skip empty, javascript, and fragment-only links
      if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
        addSkipReason('non_navigation');
        return;
      }

      // Skip links without text (likely decorative)
      const text = (a.textContent || '').trim();
      if (text.length === 0) {
        addSkipReason('empty_text');
        return;
      }

      // Skip data URLs
      if (href.startsWith('data:')) {
        addSkipReason('data_url');
        return;
      }

      // Normalize and validate URL
      let normalizedHref = normalizeUrl(href, window.location.href);
      if (!normalizedHref) {
        addSkipReason('invalid_url');
        return;
      }

      // Deduplicate by canonical URL
      if (visitedUrls.has(normalizedHref)) {
        addSkipReason('duplicate');
        return;
      }

      let linkUrl;
      try {
        linkUrl = new URL(normalizedHref);
      } catch {
        addSkipReason('invalid_url');
        return;
      }

      // Check domain restrictions
      const linkHostname = linkUrl.hostname;

      // Excluded domains
      if (excludeDomains.some(domain => linkHostname.includes(domain))) {
        addSkipReason('excluded_domain');
        return;
      }

      // Same domain check
      const isExternal = linkHostname !== currentHostname;

      if (isExternal) {
        if (onlySameDomain) {
          addSkipReason('external_domain');
          return;
        }
        if (!followExternalLinks) {
          addSkipReason('external_disallowed');
          return;
        }
      }

      // Skip mailto, tel, etc.
      if (linkUrl.protocol === 'mailto:' || linkUrl.protocol === 'tel:' || linkUrl.protocol === 'ftp:') {
        addSkipReason('non_http_protocol');
        return;
      }

      // This link is valid
      visitedUrls.add(normalizedHref);

      discoveredLinks.push({
        url: normalizedHref,
        text: text.substring(0, 200), // Truncate long link text
        isExternal,
        hostname: linkHostname
      });
    });

    // Sort: same-domain links first, then by position in page
    discoveredLinks.sort((a, b) => {
      if (a.isExternal !== b.isExternal) {
        return a.isExternal ? 1 : -1;
      }
      return 0;
    });

    // Apply limit
    const limitedLinks = discoveredLinks.slice(0, linksPerPageLimit);

    const result = {
      sourceUrl: window.location.href,
      canonicalUrl,
      totalFound: discoveredLinks.length,
      totalSkipped: skippedCount,
      skipReasons,
      links: limitedLinks,
      timestamp: new Date().toISOString()
    };

    console.log('[PageExtractor] Link discovery:', {
      found: discoveredLinks.length,
      skipped: skippedCount,
      reasons: skipReasons,
      returned: limitedLinks.length
    });

    return result;
  }

  // Listen for link discovery commands
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'FIND_LINKS' || event.data.type === 'DISCOVER_LINKS') {
      const config = event.data.payload || {};
      const result = findLinks(config);

      window.postMessage({
        type: 'LINKS_FOUND',
        payload: result
      }, '*');
    }
  });

  window.__PAGE_EXTRACTOR_LINKFINDER_RUNNING = true;
  console.log('[PageExtractor] Link finder ready');
})();