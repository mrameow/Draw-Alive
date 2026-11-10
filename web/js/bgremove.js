/* Draw Alive – smart background remover (fully offline, no AI model download).
 *
 * The old version averaged the 4 corner pixels and deleted every pixel within a
 * fixed RGB distance – which fails on gradients, textures, shadows and objects
 * that share colours with the background. This version works like a light-weight
 * GrabCut:
 *   1. Learn the background colours from the whole image border (k-means in Lab).
 *   2. Flood-fill the background inwards from the border, following gentle colour
 *      drift but stopping at strong edges.
 *   3. Build colour models for foreground & background and score every pixel.
 *   4. Smooth the scores with an edge-aware diffusion (stays sharp at object edges).
 *   5. Clean up: remove specks, keep the main object(s), fill small holes, feather.
 * Users can paint "keep" / "remove" hints that act as hard constraints.
 */
(function () {
  'use strict';
  const DA = window.DA;

  /* ---------- colour space ---------- */
  function srgbToLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) LIN[i] = srgbToLin(i);
  function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }

  function toLab(data, n) {
    const lab = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = LIN[data[i * 4]], g = LIN[data[i * 4 + 1]], b = LIN[data[i * 4 + 2]];
      const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
      const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
      const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      lab[i * 3] = 116 * y - 16;
      lab[i * 3 + 1] = 500 * (x - y);
      lab[i * 3 + 2] = 200 * (y - z);
    }
    return lab;
  }

  /* ---------- k-means ---------- */
  function kmeans(samples, k, iters) {
    const n = samples.length / 3;
    if (n === 0) return [];
    k = Math.min(k, n);
    const rnd = DA.rng(1234);
    const cents = [];
    // k-means++ initialisation
    let idx = Math.floor(rnd() * n);
    cents.push([samples[idx * 3], samples[idx * 3 + 1], samples[idx * 3 + 2]]);
    const dmin = new Float32Array(n).fill(Infinity);
    while (cents.length < k) {
      const c = cents[cents.length - 1];
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const dl = samples[i * 3] - c[0], da = samples[i * 3 + 1] - c[1], db = samples[i * 3 + 2] - c[2];
        const d = dl * dl + da * da + db * db;
        if (d < dmin[i]) dmin[i] = d;
        sum += dmin[i];
      }
      if (sum === 0) break;
      let target = rnd() * sum;
      idx = 0;
      for (let i = 0; i < n; i++) { target -= dmin[i]; if (target <= 0) { idx = i; break; } }
      cents.push([samples[idx * 3], samples[idx * 3 + 1], samples[idx * 3 + 2]]);
    }
    const K = cents.length;
    const assign = new Int32Array(n);
    for (let it = 0; it < (iters || 8); it++) {
      const acc = new Float64Array(K * 4);
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < K; c++) {
          const dl = samples[i * 3] - cents[c][0], da = samples[i * 3 + 1] - cents[c][1], db = samples[i * 3 + 2] - cents[c][2];
          const d = dl * dl + da * da + db * db;
          if (d < bd) { bd = d; best = c; }
        }
        assign[i] = best;
        acc[best * 4] += samples[i * 3]; acc[best * 4 + 1] += samples[i * 3 + 1]; acc[best * 4 + 2] += samples[i * 3 + 2]; acc[best * 4 + 3]++;
      }
      for (let c = 0; c < K; c++) if (acc[c * 4 + 3] > 0) cents[c] = [acc[c * 4] / acc[c * 4 + 3], acc[c * 4 + 1] / acc[c * 4 + 3], acc[c * 4 + 2] / acc[c * 4 + 3]];
    }
    // cluster statistics (rms spread, share)
    const spread = new Float64Array(K), count = new Float64Array(K);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      const dl = samples[i * 3] - cents[c][0], da = samples[i * 3 + 1] - cents[c][1], db = samples[i * 3 + 2] - cents[c][2];
      spread[c] += dl * dl + da * da + db * db; count[c]++;
    }
    return cents.map((c, i) => ({ c, sigma: count[i] ? Math.sqrt(spread[i] / count[i]) : 0, share: count[i] / n })).filter((m) => m.share > 0);
  }

  function sample(lab, indices, max) {
    const step = Math.max(1, Math.floor(indices.length / max));
    const out = new Float32Array(Math.ceil(indices.length / step) * 3);
    let j = 0;
    for (let i = 0; i < indices.length; i += step) {
      const p = indices[i] * 3;
      out[j++] = lab[p]; out[j++] = lab[p + 1]; out[j++] = lab[p + 2];
    }
    return out.subarray(0, j);
  }

  function nearest(lab, p, models) {
    let best = Infinity;
    const L = lab[p * 3], A = lab[p * 3 + 1], B = lab[p * 3 + 2];
    for (let m = 0; m < models.length; m++) {
      const c = models[m].c;
      const dl = L - c[0], da = A - c[1], db = B - c[2];
      const d = Math.sqrt(dl * dl + da * da + db * db) - Math.min(models[m].sigma, 12) * 0.5;
      if (d < best) best = d;
    }
    return best < 0 ? 0 : best;
  }

  /* ---------- connected components ---------- */
  function components(mask, w, h, value) {
    const n = w * h;
    const label = new Int32Array(n).fill(-1);
    const sizes = [], touchesBorder = [];
    const stack = new Int32Array(n);
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (mask[s] !== value || label[s] !== -1) continue;
      let sp = 0, size = 0, border = false;
      stack[sp++] = s; label[s] = id;
      while (sp) {
        const p = stack[--sp]; size++;
        const x = p % w, y = (p / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        if (x > 0 && mask[p - 1] === value && label[p - 1] === -1) { label[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] === value && label[p + 1] === -1) { label[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] === value && label[p - w] === -1) { label[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] === value && label[p + w] === -1) { label[p + w] = id; stack[sp++] = p + w; }
      }
      sizes.push(size); touchesBorder.push(border); id++;
    }
    return { label, sizes, touchesBorder };
  }

  function erode(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      o[p] = m[p] && m[p - 1] && m[p + 1] && m[p - w] && m[p + w] ? 1 : 0;
    }
    return o;
  }
  function dilate(m, w, h) {
    const o = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      o[p] = m[p] || (x > 0 && m[p - 1]) || (x < w - 1 && m[p + 1]) || (y > 0 && m[p - w]) || (y < h - 1 && m[p + w]) ? 1 : 0;
    }
    return o;
  }

  /**
   * Compute a foreground mask.
   * @param {ImageData} img working-size image (≈ 300px)
   * @param {{strength?:number, hints?:Uint8Array, fillHoles?:boolean, aiMask?:Float32Array}} opts strength 0..100; hints: 1 keep, 2 remove
   * @returns {Float32Array} alpha 0..1 per pixel
   */
  function computeMask(img, opts) {
    opts = opts || {};
    const { data, width: w, height: h } = img;
    const n = w * h;
    const hints = opts.hints || new Uint8Array(n);
    const strength = opts.strength == null ? 50 : opts.strength;

    // Image already transparent (e.g. a PNG sticker)? Respect existing alpha.
    let transparent = 0;
    for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 32) transparent++;
    if (transparent > n * 0.03) {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = hints[i] === 2 ? 0 : hints[i] === 1 ? 1 : data[i * 4 + 3] / 255;
      return out;
    }

    const lab = toLab(data, n);

    // edge strength (Sobel on Lab)
    const grad = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      let gsum = 0;
      for (let ch = 0; ch < 3; ch++) {
        const wgt = ch === 0 ? 1 : 0.6;
        const v = (q) => lab[q * 3 + ch];
        const gx = v(p - w + 1) + 2 * v(p + 1) + v(p + w + 1) - v(p - w - 1) - 2 * v(p - 1) - v(p + w - 1);
        const gy = v(p + w - 1) + 2 * v(p + w) + v(p + w + 1) - v(p - w - 1) - 2 * v(p - w) - v(p - w + 1);
        gsum += wgt * (gx * gx + gy * gy);
      }
      grad[p] = Math.sqrt(gsum) / 4;
    }

    // 1. background colours from the border ring
    const bw = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const ring = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < bw || y < bw || x >= w - bw || y >= h - bw) { const p = y * w + x; if (hints[p] !== 1) ring.push(p); }
    }
    for (let p = 0; p < n; p++) if (hints[p] === 2) ring.push(p);
    let bgModels = kmeans(sample(lab, ring, 2500), 5, 8).filter((m) => m.share > 0.04);
    if (!bgModels.length) bgModels = kmeans(sample(lab, ring, 2500), 1, 4);

    const T = 6 + strength * 0.32; // colour tolerance in ΔE units
    const G = 10 + strength * 0.45; // edge barrier
    const dBg = new Float32Array(n);
    for (let p = 0; p < n; p++) dBg[p] = nearest(lab, p, bgModels);

    // 2. flood fill background from the border (and from "remove" hints)
    const bg = new Uint8Array(n);
    const queue = new Int32Array(n);
    let qh = 0, qt = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const isBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (hints[p] === 2 || (isBorder && hints[p] !== 1 && dBg[p] < T)) { bg[p] = 1; queue[qt++] = p; }
    }
    while (qh < qt) {
      const p = queue[qh++];
      const x = p % w, y = (p / w) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (let k = 0; k < 4; k++) {
        const q = nb[k];
        if (q < 0 || bg[q] || hints[q] === 1) continue;
        const dl = lab[p * 3] - lab[q * 3], da = lab[p * 3 + 1] - lab[q * 3 + 1], db = lab[p * 3 + 2] - lab[q * 3 + 2];
        const step = Math.sqrt(dl * dl + da * da + db * db);
        const ok = (dBg[q] < T && grad[q] < G * 1.6) || (step < T * 0.3 && dBg[q] < T * 2.2 && grad[q] < G);
        if (ok) { bg[q] = 1; queue[qt++] = q; }
      }
    }

    // 3. colour models
    // With an AI mask (rembg U²-Net run on the device) the colour models learn from
    // what the AI thinks is creature vs background, not just from the flood fill.
    const ai = opts.aiMask && opts.aiMask.length === n ? opts.aiMask : null;
    let fgIdx = [], bgIdx = [];
    for (let p = 0; p < n; p++) (bg[p] ? bgIdx : fgIdx).push(p);
    if (ai) {
      const f2 = [], b2 = [];
      for (let p = 0; p < n; p++) {
        if (hints[p] === 1 || (!bg[p] && ai[p] > 0.35)) f2.push(p);
        else if (hints[p] === 2 || bg[p] || ai[p] < 0.12) b2.push(p);
      }
      if (f2.length > n * 0.01) { fgIdx = f2; bgIdx = b2; }
    }
    if (fgIdx.length < n * 0.002) return new Float32Array(n); // nothing left
    const fgModels = kmeans(sample(lab, fgIdx, 3000), 6, 8);
    const bgModels2 = bgIdx.length ? kmeans(sample(lab, bgIdx, 3000), 6, 8) : bgModels;

    const prob = new Float32Array(n), prior = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const df = nearest(lab, p, fgModels), db = nearest(lab, p, bgModels2);
      const pd = 1 / (1 + Math.exp(-(db - df) / 5));
      let pr = bg[p] ? 0.12 : 0.88;
      if (ai) { const w = opts.aiWeight == null ? 0.65 : opts.aiWeight; pr = DA.clamp((1 - w) * pr + w * ai[p], 0.03, 0.97); }
      prior[p] = (pd * pr) / (pd * pr + (1 - pd) * (1 - pr) + 1e-6);
      prob[p] = prior[p];
    }

    // 4. edge-aware diffusion (approximates a graph-cut smoothness term)
    const wR = new Float32Array(n), wD = new Float32Array(n);
    const s2 = 2 * 9 * 9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (x < w - 1) { const q = p + 1; const dl = lab[p * 3] - lab[q * 3], da = lab[p * 3 + 1] - lab[q * 3 + 1], db = lab[p * 3 + 2] - lab[q * 3 + 2]; wR[p] = Math.exp(-(dl * dl + da * da + db * db) / s2); }
      if (y < h - 1) { const q = p + w; const dl = lab[p * 3] - lab[q * 3], da = lab[p * 3 + 1] - lab[q * 3 + 1], db = lab[p * 3 + 2] - lab[q * 3 + 2]; wD[p] = Math.exp(-(dl * dl + da * da + db * db) / s2); }
    }
    const alpha = 0.5;
    let cur = prob, nxt = new Float32Array(n);
    for (let it = 0; it < 40; it++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (hints[p]) { nxt[p] = hints[p] === 1 ? 1 : 0; continue; }
        let sum = prior[p] * alpha, wsum = alpha;
        if (x > 0) { sum += wR[p - 1] * cur[p - 1]; wsum += wR[p - 1]; }
        if (x < w - 1) { sum += wR[p] * cur[p + 1]; wsum += wR[p]; }
        if (y > 0) { sum += wD[p - w] * cur[p - w]; wsum += wD[p - w]; }
        if (y < h - 1) { sum += wD[p] * cur[p + w]; wsum += wD[p]; }
        nxt[p] = sum / wsum;
      }
      const tmp = cur; cur = nxt; nxt = tmp;
    }

    // 5. clean up
    let m = new Uint8Array(n);
    for (let p = 0; p < n; p++) m[p] = cur[p] > 0.5 ? 1 : 0;
    m = dilate(erode(m, w, h), w, h);
    for (let p = 0; p < n; p++) if (hints[p] === 1) m[p] = 1; else if (hints[p] === 2) m[p] = 0;

    const fg = components(m, w, h, 1);
    if (!fg.sizes.length) return new Float32Array(n);
    const largest = Math.max.apply(null, fg.sizes);
    const keepComp = fg.sizes.map((s) => s >= largest * 0.12 && s > 12);
    for (let p = 0; p < n; p++) if (hints[p] === 1 && fg.label[p] >= 0) keepComp[fg.label[p]] = true;
    let fgArea = 0;
    for (let p = 0; p < n; p++) { if (m[p] && !keepComp[fg.label[p]]) m[p] = 0; if (m[p]) fgArea++; }

    // Enclosed areas: always fill small holes; with fillHoles (default) fill every
    // enclosed area, which keeps the white inside of drawings photographed on paper.
    const fillHoles = opts.fillHoles !== false;
    const holes = components(m, w, h, 0);
    const holeRemoved = new Uint8Array(holes.sizes.length);
    for (let p = 0; p < n; p++) if (hints[p] === 2 && holes.label[p] >= 0) holeRemoved[holes.label[p]] = 1;
    for (let p = 0; p < n; p++) {
      const l = holes.label[p];
      if (l < 0 || holes.touchesBorder[l] || holeRemoved[l]) continue;
      if (fillHoles || holes.sizes[l] < fgArea * 0.04) m[p] = 1;
    }

    // feather (3x3 blur)
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        s += m[yy * w + xx]; c++;
      }
      out[y * w + x] = s / c;
    }
    return out;
  }

  /**
   * Turn an AI foreground guess (0..1 per pixel) into a clean cut-out mask.
   * The AI leads; we only add what it tends to miss and the user's touch-ups:
   *  - strength 0..100 moves the cut line (higher = removes more)
   *  - keep / remove scribbles always win
   *  - enclosed areas (the white inside a drawing on paper) are filled in
   *  - tiny stray specks are dropped
   */
  function refineAI(ai, w, h, opts) {
    opts = opts || {};
    const n = w * h;
    const hints = opts.hints || new Uint8Array(n);
    const strength = opts.strength == null ? 50 : opts.strength;
    const thr = 0.5 + (strength - 50) / 100 * 0.5; // 0.25 .. 0.75
    const lo = thr - 0.12, hi = thr + 0.12;
    const out = new Float32Array(n);
    const m = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      let a = DA.clamp((ai[p] - lo) / (hi - lo), 0, 1);
      a = a * a * (3 - 2 * a);
      if (hints[p] === 1) a = 1; else if (hints[p] === 2) a = 0;
      out[p] = a;
      m[p] = a > 0.5 ? 1 : 0;
    }
    // drop tiny specks (keep every piece that is at least 2 % of the biggest one)
    const fg = components(m, w, h, 1);
    if (fg.sizes.length) {
      const big = Math.max.apply(null, fg.sizes);
      const keep = fg.sizes.map((sz) => sz >= big * 0.02);
      for (let p = 0; p < n; p++) if (hints[p] === 1 && fg.label[p] >= 0) keep[fg.label[p]] = true;
      for (let p = 0; p < n; p++) if (m[p] && !keep[fg.label[p]]) { m[p] = 0; out[p] = 0; }
    }
    if (opts.fillHoles !== false) {
      let area = 0;
      for (let p = 0; p < n; p++) area += m[p];
      const holes = components(m, w, h, 0);
      const removed = new Uint8Array(holes.sizes.length);
      for (let p = 0; p < n; p++) if (hints[p] === 2 && holes.label[p] >= 0) removed[holes.label[p]] = 1;
      for (let p = 0; p < n; p++) {
        const l = holes.label[p];
        // only fill holes that are clearly inside the object (not huge gaps between legs etc.)
        if (l >= 0 && !holes.touchesBorder[l] && !removed[l] && holes.sizes[l] < area * 1.5) out[p] = 1;
      }
    }
    return out;
  }

  /** Apply a working-size mask to a (larger) image canvas. Returns a new canvas. */
  function applyMask(full, mask, mw, mh) {
    const mc = DA.makeCanvas(mw, mh);
    const mctx = mc.getContext('2d');
    const mid = mctx.createImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) { mid.data[i * 4 + 3] = Math.round(mask[i] * 255); }
    mctx.putImageData(mid, 0, 0);

    const out = DA.makeCanvas(full.width, full.height);
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(mc, 0, 0, full.width, full.height);
    // sharpen the up-scaled alpha a little so edges stay crisp but smooth
    const id = octx.getImageData(0, 0, out.width, out.height);
    const d = id.data;
    for (let i = 3; i < d.length; i += 4) {
      const t = DA.clamp((d[i] / 255 - 0.3) / 0.4, 0, 1);
      d[i] = Math.round(t * t * (3 - 2 * t) * 255);
    }
    octx.putImageData(id, 0, 0);
    octx.globalCompositeOperation = 'source-in';
    octx.drawImage(full, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    return out;
  }

  /** The original algorithm – kept only for comparison in tests. */
  function legacy(imageData) {
    const { data, width, height } = imageData;
    const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
    let r = 0, g = 0, b = 0;
    corners.forEach(([x, y]) => { const i = (y * width + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; });
    r /= 4; g /= 4; b /= 4;
    const out = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const d = Math.hypot(data[i * 4] - r, data[i * 4 + 1] - g, data[i * 4 + 2] - b);
      out[i] = d < 50 ? 0 : 1;
    }
    return out;
  }

  DA.BgRemove = { computeMask, refineAI, applyMask, legacy };
})();
