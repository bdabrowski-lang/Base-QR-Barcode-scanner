'use strict';

// Tabs with active scanner
const activeTabs = new Set();

// ── Icon generation ──────────────────────────────────────────────────────────

function drawBarcodeIcon(ctx, size, active) {
  // Background circle
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = active ? '#cc1100' : '#1e1e1e';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.fill();

  // White barcode stripes
  const m  = Math.ceil(size * 0.14);
  const top = Math.ceil(size * 0.22);
  const h   = Math.ceil(size * 0.40);
  const w   = size - m * 2;

  // Pattern: bar widths (odd indices = gap)
  const pattern = [2, 1, 3, 1, 2, 1, 3, 1, 2];
  const total   = pattern.reduce((a, b) => a + b, 0);
  let x = m;
  pattern.forEach((p, i) => {
    const bw = Math.round((p / total) * w);
    if (i % 2 === 0) {
      ctx.fillStyle = 'white';
      ctx.fillRect(x, top, bw, h);
    }
    x += bw;
  });

  // Numbers row below barcode
  const numH = Math.ceil(size * 0.12);
  const numY = top + h + Math.ceil(size * 0.04);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(m + i * Math.floor(w / 5), numY, Math.floor(w / 5) - 1, numH);
  }

  // Red laser line (always visible as branding)
  ctx.fillStyle = active ? 'rgba(255,100,100,0.95)' : 'rgba(255,60,60,0.55)';
  const lineY = Math.round(top + h / 2);
  ctx.fillRect(m - 2, lineY, w + 4, Math.max(1, Math.round(size * 0.04)));
}

function buildIconData() {
  const inactive = {};
  const active   = {};
  for (const size of [16, 32, 48, 128]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx    = canvas.getContext('2d');

    drawBarcodeIcon(ctx, size, false);
    inactive[size] = ctx.getImageData(0, 0, size, size);

    ctx.clearRect(0, 0, size, size);
    drawBarcodeIcon(ctx, size, true);
    active[size] = ctx.getImageData(0, 0, size, size);
  }
  return { inactive, active };
}

let icons = null;

function setIcon(active, tabId) {
  try {
    if (!icons) icons = buildIconData();
    const imageData = active ? icons.active : icons.inactive;
    const opts = { imageData };
    if (tabId !== undefined) opts.tabId = tabId;
    chrome.action.setIcon(opts);
  } catch (e) {
    console.error('[BarcodeScanner] icon error', e);
  }
}

// ── Extension action click ───────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (activeTabs.has(tab.id)) {
    // Already active — tell content script to close
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('bs-scanner-overlay');
          if (el) el.dispatchEvent(new CustomEvent('bs-close'));
        }
      });
    } catch (_) {}
    activeTabs.delete(tab.id);
    setIcon(false, tab.id);
  } else {
    // Inject / activate
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      activeTabs.add(tab.id);
      setIcon(true, tab.id);
    } catch (e) {
      console.error('[BarcodeScanner] inject failed', e);
    }
  }
});

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'captureTab') {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl });
        }
      }
    );
    return true; // async response
  }

  if (msg.type === 'scannerClosed' && sender.tab) {
    activeTabs.delete(sender.tab.id);
    setIcon(false, sender.tab.id);
  }

  if (msg.type === 'reinjectScanner' && sender.tab) {
    const tabId = sender.tab.id;
    activeTabs.delete(tabId);
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content.js'] },
      () => {
        if (!chrome.runtime.lastError) {
          activeTabs.add(tabId);
          setIcon(true, tabId);
        }
      }
    );
  }
});

// ── Cleanup ──────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => activeTabs.delete(tabId));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
    setIcon(false, tabId);
  }
});

// Set default icon on startup / install
chrome.runtime.onInstalled.addListener(() => setIcon(false));
chrome.runtime.onStartup.addListener(() => setIcon(false));
setTimeout(() => setIcon(false), 0);
