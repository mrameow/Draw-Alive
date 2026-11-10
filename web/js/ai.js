/* Draw Alive – on-device AI cut-out helper.
 *
 * Runs rembg's U²-Net-P model (github.com/danielgatis/rembg, Apache-2.0, 4.6 MB)
 * with ONNX Runtime Web (WebAssembly). Everything is bundled with the app, so it
 * works offline in the browser, the Windows app and the Android app, and photos
 * never leave the device.
 *
 * The AI's guess is not used on its own: it is fed into the classic remover
 * (bgremove.js) as a hint. That combination beat both methods alone in our tests,
 * especially for drawings on paper (where the AI alone drops the white inside)
 * and busy real-photo backgrounds (where colour rules alone keep clutter).
 */
(function () {
  'use strict';
  const DA = window.DA;

  const MODEL = 'models/u2netp.onnx';
  const SIZE = 320;
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  let sessionPromise = null;
  let broken = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(el);
    });
  }

  function session() {
    if (broken) return Promise.resolve(null);
    if (!sessionPromise) {
      sessionPromise = (async () => {
        if (!window.ort) await loadScript('vendor/ort/ort.wasm.min.js');
        const ort = window.ort;
        ort.env.wasm.numThreads = 1; // no SharedArrayBuffer needed (works on GitHub Pages, Android, Windows)
        ort.env.wasm.wasmPaths = new URL('vendor/ort/', document.baseURI).href;
        return ort.InferenceSession.create(new URL(MODEL, document.baseURI).href, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      })().catch((e) => {
        console.warn('AI cut-out unavailable, using the classic remover only.', e);
        broken = true;
        return null;
      });
    }
    return sessionPromise;
  }

  /**
   * Foreground probability (0..1) for each pixel of `canvas`, resized to w × h.
   * Resolves to null if the AI cannot run on this device (the app then falls back).
   */
  async function mask(canvas, w, h) {
    const sess = await session();
    if (!sess) return null;
    try {
      const ort = window.ort;
      const s = DA.makeCanvas(SIZE, SIZE);
      const sx = s.getContext('2d', { willReadFrequently: true });
      sx.imageSmoothingQuality = 'high';
      sx.fillStyle = '#fff'; sx.fillRect(0, 0, SIZE, SIZE); // transparent pixels count as white paper
      sx.drawImage(canvas, 0, 0, SIZE, SIZE);
      const d = sx.getImageData(0, 0, SIZE, SIZE).data;
      const n = SIZE * SIZE;
      let mx = 1;
      for (let i = 0; i < n * 4; i++) if ((i & 3) !== 3 && d[i] > mx) mx = d[i];
      const input = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (d[i * 4 + c] / mx - MEAN[c]) / STD[c];

      const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
      const pred = out[sess.outputNames[0]].data;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
      const range = hi - lo || 1;

      const mc = DA.makeCanvas(SIZE, SIZE), mctx = mc.getContext('2d');
      const id = mctx.createImageData(SIZE, SIZE);
      for (let i = 0; i < n; i++) id.data[i * 4 + 3] = Math.round(((pred[i] - lo) / range) * 255);
      mctx.putImageData(id, 0, 0);
      const back = DA.makeCanvas(w, h), bctx = back.getContext('2d', { willReadFrequently: true });
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(mc, 0, 0, w, h);
      const a = bctx.getImageData(0, 0, w, h).data;
      const res = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) res[i] = a[i * 4 + 3] / 255;
      return res;
    } catch (e) {
      console.warn('AI cut-out failed for this picture', e);
      return null;
    }
  }

  DA.AI = {
    mask,
    /** Start loading the model early (e.g. when the photo chooser opens). */
    warmUp() { session(); },
    get broken() { return broken; },
    /** How strongly the AI hint counts against the colour rules (tuned on our test set). */
    weight: 0.45
  };
})();
