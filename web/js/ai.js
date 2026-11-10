/* Draw Alive – on-device AI background removers.
 *
 * Runs rembg's models (github.com/danielgatis/rembg, Apache-2.0 weights) with
 * ONNX Runtime Web (WebAssembly). Photos never leave the device.
 *
 *  - U²-Net-P (4.6 MB) is built into the app, so it works offline from the start.
 *  - Bigger models are downloaded once from the app's GitHub Pages site and then
 *    kept on the device (IndexedDB), so they also work offline afterwards.
 *    (The IS-Net models are 8-bit compressed versions of rembg's originals.)
 */
(function () {
  'use strict';
  const DA = window.DA;

  const IMAGENET = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] };
  const ENGINES = {
    u2netp:        { label: '⚡ Quick AI (U²-Net-P)', note: 'built in · fast', file: 'u2netp.onnx', size: 320, mean: IMAGENET.mean, std: IMAGENET.std, mb: 4.6, bundled: true },
    silueta:       { label: '⭐ Silueta – best all-round', note: '44 MB, downloads once', file: 'silueta.onnx', size: 320, mean: IMAGENET.mean, std: IMAGENET.std, mb: 44 },
    isnet:         { label: '🔍 IS-Net – very detailed', note: '46 MB, downloads once · slow', file: 'isnet-general-use-q8.onnx', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], mb: 46, slow: true },
    'isnet-anime': { label: '🎨 IS-Net Anime – cartoons & drawings', note: '44 MB, downloads once · slow', file: 'isnet-anime-q8.onnx', size: 1024, mean: IMAGENET.mean, std: [1, 1, 1], mb: 44, slow: true }
  };
  const PUBLIC_MODELS = 'https://mrameow.github.io/Draw-Alive/models/';

  const sessions = {};     // engine id -> Promise<InferenceSession|null>
  const failed = {};
  let ortPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(el);
    });
  }
  function loadOrt() {
    if (!ortPromise) {
      ortPromise = (async () => {
        if (!window.ort) await loadScript('vendor/ort/ort.wasm.min.js');
        window.ort.env.wasm.numThreads = 1; // no SharedArrayBuffer needed (GitHub Pages, Android, Windows)
        window.ort.env.wasm.wasmPaths = new URL('vendor/ort/', document.baseURI).href;
        return window.ort;
      })().catch((e) => { ortPromise = null; throw e; });
    }
    return ortPromise;
  }

  function modelBase() {
    const q = new URLSearchParams(location.search).get('modelbase'); // tests / self-hosting
    return q ? new URL(q, location.href).href : PUBLIC_MODELS;
  }

  /** Download a model with progress, keep it on the device for next time. */
  async function fetchModel(e, onProgress) {
    const key = 'model:' + e.file;
    const cached = await DA.storage.get(key);
    if (cached && cached.byteLength > 1e6) return new Uint8Array(cached);
    const res = await fetch(modelBase() + e.file);
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    const total = +res.headers.get('content-length') || e.mb * 1e6;
    let bytes;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); got += value.length;
        if (onProgress) onProgress(got / total);
      }
      bytes = new Uint8Array(got);
      let o = 0; chunks.forEach((c) => { bytes.set(c, o); o += c.length; });
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    try { await DA.storage.set(key, bytes.buffer); } catch (err) { /* storage full – it still works this time */ }
    return bytes;
  }

  function session(id, onProgress) {
    const e = ENGINES[id];
    if (!e) return Promise.resolve(null);
    if (!sessions[id]) {
      sessions[id] = (async () => {
        const ort = await loadOrt();
        const source = e.bundled ? new URL('models/' + e.file, document.baseURI).href : await fetchModel(e, onProgress);
        // keep memory low on phones: only one big model loaded at a time
        Object.keys(sessions).forEach((k) => {
          if (k !== id && !ENGINES[k].bundled && sessions[k]) {
            const old = sessions[k]; delete sessions[k];
            old.then((s) => s && s.release && s.release()).catch(() => {});
          }
        });
        return ort.InferenceSession.create(source, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      })().catch((err) => {
        console.warn('AI remover "' + id + '" unavailable', err);
        failed[id] = String(err && err.message || err);
        delete sessions[id];
        return null;
      });
    }
    return sessions[id];
  }

  /**
   * Foreground probability (0..1) per pixel of `canvas`, resized to w × h,
   * from the chosen engine. Resolves to null if it cannot run (e.g. offline before download).
   */
  async function mask(id, canvas, w, h, onProgress) {
    const e = ENGINES[id];
    const sess = await session(id, onProgress);
    if (!sess || !e) return null;
    try {
      const ort = window.ort, S = e.size;
      const s = DA.makeCanvas(S, S);
      const sx = s.getContext('2d', { willReadFrequently: true });
      sx.imageSmoothingQuality = 'high';
      sx.fillStyle = '#fff'; sx.fillRect(0, 0, S, S);
      sx.drawImage(canvas, 0, 0, S, S);
      const d = sx.getImageData(0, 0, S, S).data;
      const n = S * S;
      let mx = 1;
      for (let i = 0; i < n * 4; i++) if ((i & 3) !== 3 && d[i] > mx) mx = d[i];
      const input = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (d[i * 4 + c] / mx - e.mean[c]) / e.std[c];
      if (onProgress) onProgress(null); // "thinking"
      const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) });
      const pred = out[sess.outputNames[0]].data;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
      const range = hi - lo || 1;
      const mc = DA.makeCanvas(S, S), mctx = mc.getContext('2d');
      const id2 = mctx.createImageData(S, S);
      for (let i = 0; i < n; i++) id2.data[i * 4 + 3] = Math.round(((pred[i] - lo) / range) * 255);
      mctx.putImageData(id2, 0, 0);
      const back = DA.makeCanvas(w, h), bctx = back.getContext('2d', { willReadFrequently: true });
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(mc, 0, 0, w, h);
      const a = bctx.getImageData(0, 0, w, h).data;
      const res = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) res[i] = a[i * 4 + 3] / 255;
      return res;
    } catch (err) {
      console.warn('AI remover failed for this picture', err);
      failed[id] = String(err && err.message || err);
      return null;
    }
  }

  async function isDownloaded(id) {
    const e = ENGINES[id];
    if (!e) return false;
    if (e.bundled) return true;
    const c = await DA.storage.get('model:' + e.file);
    return !!(c && c.byteLength > 1e6);
  }

  DA.AI = {
    ENGINES,
    mask,
    isDownloaded,
    failedReason: (id) => failed[id] || null,
    warmUp(id) { const e = ENGINES[id || 'u2netp']; if (e && (e.bundled || sessions[id])) session(id || 'u2netp'); },
    get broken() { return !!failed.u2netp; }
  };
})();
