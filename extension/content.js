(function () {
  'use strict';

  const OVERLAY_ID = 'bs-scanner-overlay';
  const LABEL_ID   = 'bs-scanner-label';
  const STYLE_ID   = 'bs-scanner-style';

  // Toggle off if already active; also clean up any leftover label
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.dispatchEvent(new CustomEvent('bs-close'));
    return;
  }
  document.getElementById(LABEL_ID)?.remove();

  // ── API check ──────────────────────────────────────────────────────────────
  if (!('BarcodeDetector' in window)) {
    showError('BarcodeDetector API nie jest obsługiwany.\nWymagany Chrome 88+.');
    return;
  }

  const detector = new BarcodeDetector();

  // ── Persistent prefs ───────────────────────────────────────────────────────
  const MUTE_KEY = 'bs-scanner-muted';
  const MODE_KEY = 'bs-scanner-mode';
  let muted       = localStorage.getItem(MUTE_KEY) === '1';
  let mode        = localStorage.getItem(MODE_KEY)   || 'barcode'; // 'barcode' | 'qr'
  const ORIENT_KEY = 'bs-scanner-orient';
  let orientation = localStorage.getItem(ORIENT_KEY) || 'horizontal'; // 'horizontal' | 'vertical'

  // ── Sound ──────────────────────────────────────────────────────────────────
  function playBeep() {
    if (muted) return;
    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1950, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
      osc.onended = () => ctx.close();
    } catch (_) {}
  }

  // ── CSS animations ─────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id    = STYLE_ID;
  style.textContent = `
    @keyframes bs-pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.65; }
    }
    @keyframes bs-scanline-h {
      0%   { transform: scaleX(0.9); }
      50%  { transform: scaleX(1); }
      100% { transform: scaleX(0.9); }
    }
    @keyframes bs-scanline-v {
      0%   { transform: scaleY(0.9); }
      50%  { transform: scaleY(1); }
      100% { transform: scaleY(0.9); }
    }
    @keyframes bs-qrpulse {
      0%,100% { opacity: 1; box-shadow: 0 0 8px 2px rgba(255,30,0,0.7); }
      50%      { opacity: 0.7; box-shadow: 0 0 16px 5px rgba(255,30,0,0.4); }
    }
    #bs-laser.horizontal {
      animation: bs-pulse 1.8s ease-in-out infinite,
                 bs-scanline-h 1.8s ease-in-out infinite;
    }
    #bs-laser.vertical {
      animation: bs-pulse 1.8s ease-in-out infinite,
                 bs-scanline-v 1.8s ease-in-out infinite;
    }
    #bs-laser.detected { animation: none; }
    #bs-qr-frame { animation: bs-qrpulse 1.8s ease-in-out infinite; }
    #bs-qr-frame.detected { animation: none; }
  `;
  document.head.appendChild(style);

  // ── Overlay ────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  css(overlay, {
    position:   'fixed',
    top:        '0',
    left:       '0',
    width:      '100vw',
    height:     '100vh',
    zIndex:     '2147483647',
    cursor:     'crosshair',
    background: 'rgba(0,0,0,0.06)',
    boxSizing:  'border-box',
  });

  // Laser line (barcode mode)
  const laser = document.createElement('div');
  laser.id = 'bs-laser';
  css(laser, {
    position:        'absolute',
    left:            '0',
    right:           '0',
    height:          '2px',
    background:      'linear-gradient(90deg,transparent 0%,#ff2200 6%,#ff4400 50%,#ff2200 94%,transparent 100%)',
    boxShadow:       '0 0 6px 2px rgba(255,30,0,0.85), 0 0 14px 4px rgba(255,30,0,0.35)',
    top:             '50%',
    pointerEvents:   'none',
    zIndex:          '1',
    transformOrigin: 'center',
  });
  overlay.appendChild(laser);

  // QR frame (qr mode) — square with corner brackets
  const QR_SIZE = 240;
  const qrFrame = document.createElement('div');
  qrFrame.id = 'bs-qr-frame';
  css(qrFrame, {
    position:      'absolute',
    width:         QR_SIZE + 'px',
    height:        QR_SIZE + 'px',
    transform:     'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex:        '1',
    display:       'none',
  });
  [
    { top: '0',  left:  '0',  borderTop:    '3px solid #ff2200', borderLeft:   '3px solid #ff2200' },
    { top: '0',  right: '0',  borderTop:    '3px solid #ff2200', borderRight:  '3px solid #ff2200' },
    { bottom: '0', left: '0', borderBottom: '3px solid #ff2200', borderLeft:   '3px solid #ff2200' },
    { bottom: '0', right:'0', borderBottom: '3px solid #ff2200', borderRight:  '3px solid #ff2200' },
  ].forEach(pos => {
    const c = document.createElement('div');
    css(c, { position: 'absolute', width: '28px', height: '28px', ...pos });
    qrFrame.appendChild(c);
  });
  // Crosshair center dot
  const dot = document.createElement('div');
  css(dot, {
    position:     'absolute',
    top:          '50%', left: '50%',
    transform:    'translate(-50%,-50%)',
    width:        '6px', height: '6px',
    borderRadius: '50%',
    background:   'rgba(255,60,0,0.7)',
  });
  qrFrame.appendChild(dot);
  overlay.appendChild(qrFrame);

  // Overlay corner brackets
  [
    { top: '18px',    left:  '18px',  borderTop:    '3px solid rgba(255,40,0,0.75)', borderLeft:   '3px solid rgba(255,40,0,0.75)' },
    { top: '18px',    right: '18px',  borderTop:    '3px solid rgba(255,40,0,0.75)', borderRight:  '3px solid rgba(255,40,0,0.75)' },
    { bottom: '18px', left:  '18px',  borderBottom: '3px solid rgba(255,40,0,0.75)', borderLeft:   '3px solid rgba(255,40,0,0.75)' },
    { bottom: '18px', right: '18px',  borderBottom: '3px solid rgba(255,40,0,0.75)', borderRight:  '3px solid rgba(255,40,0,0.75)' },
  ].forEach(pos => {
    const corner = document.createElement('div');
    css(corner, { position: 'absolute', width: '22px', height: '22px', ...pos });
    overlay.appendChild(corner);
  });

  // ── Status label ───────────────────────────────────────────────────────────
  const label = document.createElement('div');
  label.id = LABEL_ID;
  css(label, {
    position:     'fixed',
    top:          '12px',
    right:        '12px',
    display:      'flex',
    alignItems:   'center',
    gap:          '6px',
    padding:      '5px 8px 5px 15px',
    background:   'rgba(0,0,0,0.74)',
    color:        'white',
    borderRadius: '20px',
    font:         '12px/1.5 monospace',
    zIndex:       '2147483647',
    letterSpacing:'0.4px',
    userSelect:   'none',
  });

  const labelText = document.createElement('span');

  // Mode toggle button
  const modeBtn = document.createElement('button');
  css(modeBtn, {
    background:   'rgba(255,255,255,0.12)',
    border:       '1px solid rgba(255,255,255,0.25)',
    borderRadius: '12px',
    color:        'white',
    font:         '11px/1 monospace',
    padding:      '3px 9px',
    cursor:       'pointer',
    outline:      'none',
  });
  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    mode = mode === 'barcode' ? 'qr' : 'barcode';
    localStorage.setItem(MODE_KEY, mode);
    applyMode();
  });

  // Mute button
  const muteBtn = document.createElement('button');
  css(muteBtn, {
    background:   'rgba(255,255,255,0.12)',
    border:       '1px solid rgba(255,255,255,0.25)',
    borderRadius: '12px',
    color:        'white',
    font:         '12px/1 monospace',
    padding:      '2px 8px',
    cursor:       'pointer',
    outline:      'none',
  });
  muteBtn.title = 'Wycisz / włącz dźwięk (M)';
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
  });

  label.appendChild(labelText);
  label.appendChild(modeBtn);
  label.appendChild(muteBtn);

  document.body.appendChild(label);
  document.body.appendChild(overlay);

  // ── State ──────────────────────────────────────────────────────────────────
  let mouseX    = window.innerWidth  / 2;
  let mouseY    = window.innerHeight / 2;
  let scanning  = false;
  let closed    = false;

  // Apply initial mode (sets visuals + label text)
  applyMode();

  // ── Mouse tracking ─────────────────────────────────────────────────────────
  overlay.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (mode === 'barcode') {
      if (orientation === 'horizontal') {
        laser.style.top  = mouseY + 'px';
      } else {
        laser.style.left = mouseX + 'px';
      }
    } else {
      qrFrame.style.top  = mouseY + 'px';
      qrFrame.style.left = mouseX + 'px';
    }
  });

  // ── Scan on click ──────────────────────────────────────────────────────────
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    performScan();
  });

  // ── Scan logic ─────────────────────────────────────────────────────────────
  async function performScan() {
    if (scanning || closed) return;
    scanning = true;

    try {
      const res = await sendMessage({ type: 'captureTab' });
      if (!res?.dataUrl) return;

      const img = new Image();
      await new Promise((ok, fail) => {
        img.onload = ok;
        img.onerror = fail;
        img.src = res.dataUrl;
      });

      const dpr = window.devicePixelRatio || 1;
      let hit;

      if (mode === 'barcode') {
        const barcodes = await detector.detect(img);
        if (!barcodes.length) return;
        const reach = 100 * dpr;
        if (orientation === 'horizontal') {
          const laserY = mouseY * dpr;
          hit = barcodes.find(b => {
            const { top, height } = b.boundingBox;
            return top <= laserY + reach && (top + height) >= laserY - reach;
          });
        } else {
          const laserX = mouseX * dpr;
          hit = barcodes.find(b => {
            const { left, width } = b.boundingBox;
            return left <= laserX + reach && (left + width) >= laserX - reach;
          });
        }

        if (!hit) return;
      } else {
        // QR mode: crop the frame area from the screenshot, scale up 2×,
        // then run a fresh detection on the cropped canvas.
        // This is far more reliable than filtering by position on the full image.
        const margin = 40 * dpr;                      // extra padding beyond visible frame
        const half   = (QR_SIZE / 2) * dpr + margin;
        const cx     = mouseX * dpr;
        const cy     = mouseY * dpr;
        const x0     = Math.max(0, Math.round(cx - half));
        const y0     = Math.max(0, Math.round(cy - half));
        const cropW  = Math.min(Math.round(half * 2), img.width  - x0);
        const cropH  = Math.min(Math.round(half * 2), img.height - y0);

        const scale  = 2;
        const canvas = new OffscreenCanvas(cropW * scale, cropH * scale);
        const ctx    = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x0, y0, cropW, cropH, 0, 0, cropW * scale, cropH * scale);

        const cropped = await detector.detect(canvas);
        hit = cropped[0] ?? null;

        if (!hit) return;
      }

      await copyToClipboard(hit.rawValue);
      flashDetected(hit.rawValue);
      closeOverlay();

    } catch (_) {
    } finally {
      scanning = false;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function applyMode() {
    if (mode === 'barcode') {
      laser.style.display   = 'block';
      qrFrame.style.display = 'none';
      modeBtn.textContent = '⊞ QR';
      modeBtn.title = 'Przełącz na tryb QR (Q)';
      applyOrientation();
    } else {
      laser.style.display   = 'none';
      qrFrame.style.display = 'block';
      qrFrame.style.top  = mouseY + 'px';
      qrFrame.style.left = mouseX + 'px';
      modeBtn.textContent = '▬ Kod kreskowy';
      modeBtn.title = 'Przełącz na tryb kodów kreskowych (Q)';
      labelText.innerHTML = '<span style="color:#ff4422">●</span>  QR &nbsp;|&nbsp; kliknij = skanuj &nbsp;|&nbsp; Q = kod kreskowy &nbsp;|&nbsp; M = wycisz &nbsp;|&nbsp; ESC = zamknij';
    }
  }

  function applyOrientation() {
    laser.className = ''; // clear previous class
    if (orientation === 'horizontal') {
      laser.classList.add('horizontal');
      css(laser, {
        top:        mouseY + 'px',
        left:       '0',
        right:      '0',
        bottom:     '',
        width:      '',
        height:     '2px',
        background: 'linear-gradient(90deg,transparent 0%,#ff2200 6%,#ff4400 50%,#ff2200 94%,transparent 100%)',
        boxShadow:  '0 0 6px 2px rgba(255,30,0,0.85), 0 0 14px 4px rgba(255,30,0,0.35)',
        transformOrigin: 'center',
      });
      labelText.innerHTML = '<span style="color:#ff4422">●</span>  Kod kreskowy — poziomy &nbsp;|&nbsp; kliknij = skanuj &nbsp;|&nbsp; R = pionowy &nbsp;|&nbsp; Q = QR &nbsp;|&nbsp; M = wycisz &nbsp;|&nbsp; ESC = zamknij';
    } else {
      laser.classList.add('vertical');
      css(laser, {
        left:       mouseX + 'px',
        top:        '0',
        bottom:     '0',
        right:      '',
        width:      '2px',
        height:     '100%',
        background: 'linear-gradient(180deg,transparent 0%,#ff2200 6%,#ff4400 50%,#ff2200 94%,transparent 100%)',
        boxShadow:  '0 0 6px 2px rgba(255,30,0,0.85), 0 0 14px 4px rgba(255,30,0,0.35)',
        transformOrigin: 'center',
      });
      labelText.innerHTML = '<span style="color:#ff4422">●</span>  Kod kreskowy — pionowy &nbsp;|&nbsp; kliknij = skanuj &nbsp;|&nbsp; R = poziomy &nbsp;|&nbsp; Q = QR &nbsp;|&nbsp; M = wycisz &nbsp;|&nbsp; ESC = zamknij';
    }
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  function sendMessage(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, response => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      css(ta, { position: 'fixed', opacity: '0', top: '0', left: '0', width: '1px', height: '1px' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function flashDetected(value) {
    playBeep();

    // Flash active element green
    const el = mode === 'barcode' ? laser : qrFrame;
    el.classList.add('detected');
    if (mode === 'barcode') {
      css(laser, {
        background: 'linear-gradient(90deg,transparent 0%,#00ff55 6%,#00ff55 94%,transparent 100%)',
        boxShadow:  '0 0 10px 4px rgba(0,255,80,0.95), 0 0 22px 8px rgba(0,255,80,0.45)',
      });
    } else {
      // Flash QR frame corners green
      qrFrame.querySelectorAll('div').forEach(c => {
        c.style.borderColor = '#00ff55';
      });
    }

    showResultPanel(value);
  }

  function showResultPanel(value) {
    document.getElementById('bs-result-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'bs-result-panel';
    css(panel, {
      position:     'fixed',
      bottom:       '20px',
      left:         '20px',
      padding:      '12px 18px',
      background:   'rgba(10,10,10,0.92)',
      color:        'white',
      borderRadius: '10px',
      font:         '13px/1.6 monospace',
      zIndex:       '2147483647',
      boxShadow:    '0 4px 24px rgba(0,0,0,0.55)',
      maxWidth:     '420px',
      wordBreak:    'break-all',
      borderLeft:   '4px solid #00cc44',
      userSelect:   'text',
    });

    const headerText = document.createElement('div');
    css(headerText, { color: '#00cc44', fontWeight: 'bold', fontSize: '11px', letterSpacing: '1px', marginBottom: '4px' });
    headerText.textContent = '✓ ZESKANOWANO & SKOPIOWANO';

    const valueEl = document.createElement('div');
    css(valueEl, { fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px' });
    valueEl.textContent = value;

    panel.appendChild(headerText);
    panel.appendChild(valueEl);
    document.body.appendChild(panel);
  }

  function showError(msg) {
    const el = document.createElement('div');
    css(el, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      padding: '12px 24px', background: '#b00', color: 'white',
      borderRadius: '8px', zIndex: '2147483647',
      font: '14px sans-serif', whiteSpace: 'pre-line', textAlign: 'center',
    });
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function css(el, styles) {
    Object.assign(el.style, styles);
  }

  // ── Close ──────────────────────────────────────────────────────────────────

  function closeOverlay() {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.getElementById(STYLE_ID)?.remove();
    sendMessage({ type: 'scannerClosed' });

    // Update label to post-scan state
    labelText.innerHTML = '<span style="color:#00cc44">✓</span>  Zeskanowano &nbsp;|&nbsp; M = wycisz &nbsp;|&nbsp; ESC = zamknij';
    muteBtn.textContent = muted ? '🔇' : '🔊';

    // Rescan button
    const rescanBtn = document.createElement('button');
    css(rescanBtn, {
      background:   'rgba(0,200,100,0.2)',
      border:       '1px solid rgba(0,200,100,0.5)',
      borderRadius: '12px',
      color:        '#00ee66',
      font:         'bold 12px/1 monospace',
      padding:      '3px 10px',
      cursor:       'pointer',
      outline:      'none',
    });
    rescanBtn.textContent = '↺ skanuj';
    rescanBtn.title = 'Uruchom skaner ponownie';
    rescanBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      label.remove();
      document.getElementById('bs-result-panel')?.remove();
      sendMessage({ type: 'reinjectScanner' });
    });
    label.appendChild(rescanBtn);
  }

  function closeAll() {
    closeOverlay();
    label.remove();
  }

  overlay.addEventListener('bs-close', closeAll);

  document.addEventListener('keydown', function onKey(e) {
    const tag = e.target.tagName;
    if (!e.ctrlKey && !e.altKey && !e.metaKey &&
        tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      if (e.key === 'm' || e.key === 'M') toggleMute();
      if (e.key === 'q' || e.key === 'Q') {
        mode = mode === 'barcode' ? 'qr' : 'barcode';
        localStorage.setItem(MODE_KEY, mode);
        applyMode();
      }
      if ((e.key === 'r' || e.key === 'R') && mode === 'barcode') {
        orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
        localStorage.setItem(ORIENT_KEY, orientation);
        applyOrientation();
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('keydown', onKey, true);
      closeAll();
    }
  }, { capture: true });

})();
