/**
 * extractor.js
 * Extracts semantic content from the DOM
 * Runs in page context, sends results via postMessage to message-bridge
 */

(function () {
  'use strict';

  if (window.__PAGE_EXTRACTOR_EXTRACTOR_RUNNING) return;

  const EXCLUDE_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'NAV', 'FOOTER', 'HEADER', 'ASIDE'];
  const EXCLUDE_CLASSES = ['nav', 'navigation', 'menu', 'sidebar', 'footer', 'header', 'advertisement', 'ad', 'social', 'comment', 'popup', 'modal'];

  function isExcluded(element) {
    if (EXCLUDE_TAGS.includes(element.tagName)) return true;
    const className = element.className || '';
    const id = element.id || '';
    return EXCLUDE_CLASSES.some(cls =>
      className.includes(cls) || id.includes(cls)
    );
  }

  function getMainContentArea() {
    // Try to find the main content area
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.main-content'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim().length > 200) {
        return el;
      }
    }

    // Fallback to body
    return document.body;
  }

  function getTextContent(element) {
    if (!element) return '';
    return element.textContent
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getMetaContent(nameOrProperty) {
    const meta = document.querySelector(
      `meta[name="${nameOrProperty}"], meta[property="${nameOrProperty}"]`
    );
    return meta ? meta.getAttribute('content') || '' : '';
  }

  function extractHeadings(root) {
    const headings = [];
    const headingTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

    const elements = root.querySelectorAll(headingTags.join(','));
    elements.forEach((el) => {
      if (!isExcluded(el)) {
        const text = getTextContent(el);
        if (text.length > 0) {
          headings.push({
            level: parseInt(el.tagName.charAt(1), 10),
            text: text,
            id: el.id || undefined
          });
        }
      }
    });

    return headings;
  }

  function extractParagraphs(root) {
    const paragraphs = [];
    let index = 0;

    const elements = root.querySelectorAll('p');
    elements.forEach((el) => {
      if (!isExcluded(el)) {
        const text = getTextContent(el);
        if (text.length > 50) { // Only meaningful paragraphs
          paragraphs.push({ index: index++, text });
        }
      }
    });

    return paragraphs;
  }

  function extractLists(root) {
    const lists = [];

    root.querySelectorAll('ul, ol').forEach((list) => {
      if (!isExcluded(list)) {
        const items = [];
        list.querySelectorAll('li').forEach((li) => {
          const text = getTextContent(li);
          if (text.length > 0) {
            items.push(text);
          }
        });

        if (items.length > 0) {
          lists.push({
            type: list.tagName === 'UL' ? 'ul' : 'ol',
            items
          });
        }
      }
    });

    return lists;
  }

  function extractTables(root) {
    const tables = [];

    root.querySelectorAll('table').forEach((table) => {
      if (!isExcluded(table)) {
        const headers = [];
        const rows = [];

        // Extract headers
        const headerCells = table.querySelectorAll('thead th, thead td');
        headerCells.forEach((cell) => {
          headers.push(getTextContent(cell));
        });

        // Extract body rows
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach((tr) => {
          const cells = [];
          tr.querySelectorAll('td').forEach((cell) => {
            cells.push(getTextContent(cell));
          });
          if (cells.length > 0) {
            rows.push(cells);
          }
        });

        if (headers.length > 0 || rows.length > 0) {
          tables.push({ headers, rows });
        }
      }
    });

    return tables;
  }

  function extractImages(root) {
    const images = [];

    root.querySelectorAll('img').forEach((img) => {
      const src = img.src || img.getAttribute('data-src') || '';
      const alt = img.alt || '';

      if (src && !src.startsWith('data:')) {
        // Determine if decorative (empty alt and not meaningful src)
        const isDecorative = alt === '' && (
          src.includes('spacer') ||
          src.includes('pixel') ||
          src.includes('tracker') ||
          src.includes('1x1')
        );

        images.push({
          src,
          alt,
          isDecorative
        });
      }
    });

    return images;
  }

  function extractLinks(root, currentUrl) {
    const links = [];
    const currentHostname = new URL(currentUrl).hostname;
    const seenHrefs = new Set();

    root.querySelectorAll('a[href]').forEach((a) => {
      if (isExcluded(a)) return;

      let href = a.href;
      if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

      // Skip if already seen
      if (seenHrefs.has(href)) return;
      seenHrefs.add(href);

      const text = getTextContent(a);
      if (!text || text.trim().length === 0) return;

      let linkUrl;
      try {
        linkUrl = new URL(href, currentUrl);
      } catch {
        return;
      }

      const isExternal = linkUrl.hostname !== currentHostname;

      // Determine crawl decision
      let crawlDecision = 'skip';
      let reason = '';

      if (isExternal) {
        if (!config.allowExternal) {
          reason = 'external_domain';
          crawlDecision = 'skip';
        } else {
          crawlDecision = 'explore';
        }
      } else if (href.startsWith('http')) {
        crawlDecision = 'explore';
      } else {
        reason = 'same_page_fragment';
        crawlDecision = 'skip';
      }

      links.push({
        href: linkUrl.href,
        text: text.trim(),
        isExternal,
        crawlDecision,
        reason
      });
    });

    return links;
  }

  function countWords(text) {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  function calculateReadabilityScore(text) {
    // Simplified Flesch reading ease approximation
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (words.length === 0 || sentences.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;

    // Approximate syllable count
    const syllables = words.reduce((acc, word) => {
      const clean = word.replace(/[^a-zA-Z]/g, '');
      if (clean.length <= 3) return acc + 1;
      return acc + Math.ceil(clean.length / 2);
    }, 0);

    const avgSyllablesPerWord = syllables / words.length;

    // Flesch Reading Ease formula
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function extract(config = {}) {
    const startTime = performance.now();
    const currentUrl = config.url || window.location.href;
    const root = getMainContentArea();

    // Gather all text for metadata calculations
    const allText = root.textContent.replace(/\s+/g, ' ').trim();

    const pageContent = {
      url: currentUrl,
      title: document.title || '',
      description: getMetaContent('description') || getMetaContent('og:description') || '',
      lang: document.documentElement.lang || document.querySelector('html')?.getAttribute('lang') || 'en',
      extractedAt: new Date().toISOString(),
      depth: config.depth || 0,
      parentUrl: config.parentUrl || null,
      content: {
        headings: extractHeadings(root),
        paragraphs: extractParagraphs(root),
        lists: extractLists(root),
        tables: extractTables(root),
        images: extractImages(root),
        links: extractLinks(root, currentUrl)
      },
      metadata: {
        wordCount: countWords(allText),
        readabilityScore: calculateReadabilityScore(allText),
        canonicalUrl: getMetaContent('canonical') || undefined,
        ogImage: getMetaContent('og:image') || undefined,
        scrollEventsFired: config.scrollEventsFired || 0,
        contentLoadedAfterScroll: config.scrollEventsFired > 0
      }
    };

    const duration = performance.now() - startTime;
    console.log(`[PageExtractor] Extraction complete in ${duration.toFixed(2)}ms`, {
      words: pageContent.metadata.wordCount,
      headings: pageContent.content.headings.length,
      paragraphs: pageContent.content.paragraphs.length,
      images: pageContent.content.images.length,
      links: pageContent.content.links.length
    });

    return pageContent;
  }

  // Listen for extraction commands
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'START_EXTRACTION' || event.data.type === 'EXTRACT_CONTENT') {
      const config = event.data.payload || {};
      const result = extract(config);

      window.postMessage({
        type: 'EXTRACTION_RESULT',
        payload: result
      }, '*');
    }
  });

  window.__PAGE_EXTRACTOR_EXTRACTOR_RUNNING = true;
  console.log('[PageExtractor] Extractor ready');
})();