/* Draw Alive – shared helpers (classic script, no build step needed). */
(function () {
  'use strict';
  const DA = (window.DA = window.DA || {});

  /* ---------- math / random ---------- */
  DA.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  DA.lerp = (a, b, t) => a + (b - a) * t;
  DA.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Small deterministic PRNG so every scene keeps the same layout after reload. */
  DA.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s += 0x6d2b79f5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- canvas helpers ---------- */
  DA.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };

  /** Bounding box of pixels with alpha > threshold, or null if empty. */
  DA.alphaBounds = function (imageData, threshold) {
    const t = threshold == null ? 8 : threshold;
    const { data, width, height } = imageData;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (data[row + x * 4 + 3] > t) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };

  /** Crop a canvas to its visible content and scale it so the longest side <= maxSide. */
  DA.trimCanvas = function (src, maxSide, pad) {
    const ctx = src.getContext('2d', { willReadFrequently: true });
    const b = DA.alphaBounds(ctx.getImageData(0, 0, src.width, src.height));
    if (!b) return null;
    const p = pad == null ? 4 : pad;
    const scale = Math.min(1, (maxSide || 320) / Math.max(b.w, b.h));
    const out = DA.makeCanvas(b.w * scale + p * 2, b.h * scale + p * 2);
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, b.x, b.y, b.w, b.h, p, p, b.w * scale, b.h * scale);
    return out;
  };

  DA.loadImage = function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = src;
    });
  };

  DA.readFileAsDataURL = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('Could not read file'));
      r.readAsDataURL(file);
    });
  };

  DA.hexToRgb = function (hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  /* ---------- UI: toast ---------- */
  let toastTimer = null;
  DA.toast = function (text, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2200);
  };

  /* ---------- UI: modal dialogs ---------- */
  const openStack = [];
  DA.openModal = function (id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('open')) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    openStack.push(id);
    const focusable = el.querySelector('[data-autofocus]') || el.querySelector('.modal-close');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 30);
    el.dispatchEvent(new CustomEvent('modal-open'));
  };
  DA.closeModal = function (id) {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains('open')) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    const i = openStack.lastIndexOf(id);
    if (i >= 0) openStack.splice(i, 1);
    el.dispatchEvent(new CustomEvent('modal-close'));
  };
  DA.topModal = () => openStack[openStack.length - 1] || null;
  DA.isModalOpen = () => openStack.length > 0;

  /** Promise based confirm dialog with app styling. */
  DA.confirm = function (title, message, okText, danger) {
    return new Promise((resolve) => {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message || '';
      const ok = document.getElementById('confirmOk');
      ok.textContent = okText || 'OK';
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      const cancel = document.getElementById('confirmCancel');
      const modal = document.getElementById('confirmModal');
      function done(v) {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        modal.removeEventListener('modal-close', onClose);
        DA.closeModal('confirmModal');
        resolve(v);
      }
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onClose = () => done(false);
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      modal.addEventListener('modal-close', onClose);
      DA.openModal('confirmModal');
    });
  };

  /** Promise based text prompt dialog. */
  DA.prompt = function (title, value) {
    return new Promise((resolve) => {
      document.getElementById('promptTitle').textContent = title;
      const input = document.getElementById('promptInput');
      input.value = value || '';
      const ok = document.getElementById('promptOk');
      const cancel = document.getElementById('promptCancel');
      const modal = document.getElementById('promptModal');
      function done(v) {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
        modal.removeEventListener('modal-close', onClose);
        DA.closeModal('promptModal');
        resolve(v);
      }
      const onOk = () => done(input.value.trim() || null);
      const onCancel = () => done(null);
      const onClose = () => done(null);
      const onKey = (e) => { if (e.key === 'Enter') onOk(); };
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
      modal.addEventListener('modal-close', onClose);
      DA.openModal('promptModal');
      setTimeout(() => { input.focus(); input.select(); }, 40);
    });
  };

  /* ---------- storage (IndexedDB with graceful fallback) ---------- */
  const DB_NAME = 'draw-alive';
  const STORE = 'kv';
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        if (!window.indexedDB) return reject(new Error('no indexedDB'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    return dbPromise;
  }
  DA.storage = {
    async get(key) {
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const r = tx.objectStore(STORE).get(key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      } catch (e) {
        try { const v = localStorage.getItem('da:' + key); return v ? JSON.parse(v) : undefined; } catch (_) { return undefined; }
      }
    },
    async set(key, value) {
      try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return true;
      } catch (e) {
        try { localStorage.setItem('da:' + key, JSON.stringify(value)); return true; } catch (_) { return false; }
      }
    }
  };

  /* ---------- saving files (web, desktop and Android) ---------- */
  DA.saveDataURL = async function (dataURL, filename) {
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem) {
      try {
        const base64 = dataURL.split(',')[1];
        const fs = cap.Plugins.Filesystem;
        const res = await fs.writeFile({ path: filename, data: base64, directory: 'CACHE' });
        if (cap.Plugins.Share) {
          await cap.Plugins.Share.share({ title: 'Draw Alive', files: [res.uri] });
          return true;
        }
        await fs.writeFile({ path: 'Pictures/' + filename, data: base64, directory: 'DOCUMENTS', recursive: true });
        DA.toast('Saved to Documents/Pictures');
        return true;
      } catch (e) {
        if (e && /cancel/i.test(String(e.message || e))) return false;
        console.warn('Native save failed, falling back', e);
      }
    }
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  };
})();
