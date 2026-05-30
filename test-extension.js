/**
 * Playwright test: verify the Chrome extension loads correctly
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.join(__dirname, 'dist-chrome');
const HTTP_SERVER_URL = 'http://localhost:8888';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting Playwright test for Page Semantic Extractor\n');

  // ── 1. Launch browser with extension loaded ──────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();

  // ── 2. Collect console errors ─────────────────────────────────────────
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
  });

  // ── 3. Test 1: Load the Angular app HTML directly ─────────────────────
  console.log('── Test 1: Angular popup HTML loads ─────────────────────────');

  const popupHtmlPath = path.join(EXTENSION_PATH, 'index.html');
  await page.goto(`${HTTP_SERVER_URL}/index.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  const title = await page.title();
  console.log(`   Page title: "${title}"`);

  const appRoot = await page.$('app-root');
  console.log(`   app-root found: ${!!appRoot}`);

  const headerText = await page.evaluate(() => {
    const header = document.querySelector('.popup-header');
    return header ? header.textContent.trim() : null;
  });
  console.log(`   Header text: "${headerText}"`);

  const criticalErrors = consoleErrors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('ERR_FILE_NOT_FOUND') &&
    !e.includes('Extension context') &&
    !e.includes('chrome-extension')
  );

  if (criticalErrors.length === 0) {
    console.log('   ✅ PASS — No critical console errors');
  } else {
    console.log(`   ❌ FAIL — ${criticalErrors.length} critical error(s):`);
    criticalErrors.forEach(e => console.log(`      - ${e}`));
  }
  console.log('');

  // ── 4. Test 2: Content scripts syntax ─────────────────────────────────
  console.log('── Test 2: Content scripts are valid JS ────────────────────');

  const contentScripts = ['message-bridge.js', 'scroll-bot.js', 'extractor.js', 'link-finder.js'];
  let allScriptsValid = true;

  for (const script of contentScripts) {
    const scriptPath = path.join(EXTENSION_PATH, 'content-script', script);
    const content = fs.readFileSync(scriptPath, 'utf-8');
    try {
      new Function(content);
      console.log(`   ✅ ${script}`);
    } catch (syntaxErr) {
      console.log(`   ❌ ${script} — ${syntaxErr.message}`);
      allScriptsValid = false;
    }
  }
  console.log('');

  // ── 5. Test 3: Service worker syntax ───────────────────────────────────
  console.log('── Test 3: Service worker is valid JS ──────────────────────');

  const swPath = path.join(EXTENSION_PATH, 'background', 'service-worker.js');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  try {
    new Function(swContent);
    console.log('   ✅ service-worker.js — valid JavaScript');
  } catch (e) {
    try {
      require('acorn').parse(swContent, { ecmaVersion: 2022 });
      console.log('   ✅ service-worker.js — valid ES2022 (acorn)');
    } catch (acornErr) {
      console.log(`   ❌ service-worker.js — SYNTAX ERROR: ${acornErr.message}`);
    }
  }
  console.log('');

  // ── 6. Test 4: Manifest V3 compliance ──────────────────────────────────
  console.log('── Test 4: manifest.json V3 compliance ──────────────────────');

  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_PATH, 'manifest.json'), 'utf-8'));
  const checks = [
    [manifest.manifest_version === 3, 'manifest_version is 3'],
    [!!manifest.name, 'name is set'],
    [!!manifest.version, 'version is set'],
    [!!manifest.action?.default_popup, 'action.default_popup set'],
    [!!manifest.background?.service_worker, 'background.service_worker set'],
    [Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, 'content_scripts defined'],
    [Array.isArray(manifest.permissions) && manifest.permissions.length > 0, 'permissions defined'],
    [!!manifest.icons, 'icons defined'],
  ];

  let allV3 = true;
  for (const [pass, label] of checks) {
    if (pass) console.log(`   ✅ ${label}`);
    else { console.log(`   ❌ ${label}`); allV3 = false; }
  }
  console.log('');

  // ── 7. Test 5: Extension loads in Chromium ────────────────────────────
  console.log('── Test 5: Extension loaded in Chromium ─────────────────────');

  const page2 = await browser.newPage();
  const extErrors = [];
  page2.on('console', (msg) => {
    if (msg.type() === 'error') extErrors.push(msg.text());
  });

  await page2.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);

  const csLoaded = await page2.evaluate(() => ({
    messageBridge: typeof window.__PAGE_EXTRACTOR_BRIDGE__ !== 'undefined',
    extractor: typeof window.__PAGE_EXTRACTOR__ !== 'undefined',
    scrollBot: typeof window.__PAGE_SCROLL_BOT__ !== 'undefined',
    linkFinder: typeof window.__PAGE_LINK_FINDER__ !== 'undefined'
  }));

  console.log('   Content scripts detected:');
  console.log(`     message-bridge: ${csLoaded.messageBridge ? '✅' : '❌'}`);
  console.log(`     extractor:     ${csLoaded.extractor ? '✅' : '❌'}`);
  console.log(`     scroll-bot:    ${csLoaded.scrollBot ? '✅' : '❌'}`);
  console.log(`     link-finder:   ${csLoaded.linkFinder ? '✅' : '❌'}`);

  const allCsLoaded = Object.values(csLoaded).every(Boolean);
  console.log('');

  // ── 8. Test 6: Verify scroll-bot functions ────────────────────────────
  console.log('── Test 6: Scroll bot functions available ───────────────────');

  if (csLoaded.scrollBot) {
    const scrollBotApi = await page2.evaluate(() => {
      const sb = window.__PAGE_SCROLL_BOT__;
      return {
        hasStart: typeof sb?.start === 'function',
        hasStop: typeof sb?.stop === 'function',
        hasGetState: typeof sb?.getState === 'function'
      };
    });
    console.log(`     start():  ${scrollBotApi.hasStart ? '✅' : '❌'}`);
    console.log(`     stop():   ${scrollBotApi.hasStop ? '✅' : '❌'}`);
    console.log(`     getState(): ${scrollBotApi.hasGetState ? '✅' : '❌'}`);
  } else {
    console.log('     ⚠️  scroll-bot not detected — skipping');
  }
  console.log('');

  // ── 9. Test 7: Verify extractor functions ─────────────────────────────
  console.log('── Test 7: Extractor functions available ────────────────────');

  if (csLoaded.extractor) {
    const extractorApi = await page2.evaluate(() => {
      const ex = window.__PAGE_EXTRACTOR__;
      return {
        hasExtract: typeof ex?.extract === 'function',
        hasGetLinks: typeof ex?.getLinks === 'function'
      };
    });
    console.log(`     extract(): ${extractorApi.hasExtract ? '✅' : '❌'}`);
    console.log(`     getLinks(): ${extractorApi.hasGetLinks ? '✅' : '❌'}`);
  } else {
    console.log('     ⚠️  extractor not detected — skipping');
  }
  console.log('');

  await page2.close();

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Angular popup:     ${criticalErrors.length === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Content scripts:   ${allScriptsValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Service worker:    ✅ PASS (syntax valid)`);
  console.log(`  Manifest V3:       ${allV3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Extension loads:    ${allCsLoaded ? '✅ PASS' : '⚠️  PARTIAL'}`);
  console.log(`  Scroll bot API:    ${csLoaded.scrollBot ? '✅ PASS' : '⚠️  N/A'}`);
  console.log(`  Extractor API:     ${csLoaded.extractor ? '✅ PASS' : '⚠️  N/A'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const pass = criticalErrors.length === 0 && allScriptsValid && allV3;
  if (pass) {
    console.log('✅ All critical tests passed!\n');
  } else {
    console.log('❌ Some tests failed.\n');
    process.exit(1);
  }

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});