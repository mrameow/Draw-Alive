/* Draw Alive – drawing / colouring pad.
 * Layers: paint (user colours) below, outline (template lines) on top.
 * With a template the app knows the animal's silhouette, so the finished creature
 * is cropped exactly to the outline – no matter where the user coloured. */
(function () {
  'use strict';
  const DA = window.DA;
  const PW = 800, PH = 600; // fixed internal resolution (4:3)
  const MAX_UNDO = 14;

  const S = {
    tool: 'brush', color: '#ff6b6b', size: 14,
    stayInside: true, solidInside: true,
    template: null,         // template object
    outlineAlpha: null,     // Uint8Array of outline darkness (barrier)
    silhouette: null,       // Uint8Array 1 = inside the animal
    undo: [], redo: [],
    drawing: false, last: null, lastMid: null,
    region: null, base: null, strokeCv: null, strokeCtx: null, dirty: false
  };
  let paint, pctx, outline, octx, stage, area;

  DA.Pad = {
    init() {
      paint = document.getElementById('padPaint');
      outline = document.getElementById('padOutline');
      stage = document.getElementById('padStage');
      area = document.getElementById('padArea');
      [paint, outline].forEach((c) => { c.width = PW; c.height = PH; });
      pctx = paint.getContext('2d', { willReadFrequently: true });
      octx = outline.getContext('2d', { willReadFrequently: true });
      S.strokeCv = DA.makeCanvas(PW, PH);
      S.strokeCtx = S.strokeCv.getContext('2d');
      S.region = DA.makeCanvas(PW, PH);
      S.base = DA.makeCanvas(PW, PH);

      paint.addEventListener('pointerdown', onDown);
      paint.addEventListener('pointermove', onMove);
      paint.addEventListener('pointerup', onUp);
      paint.addEventListener('pointercancel', onUp);
      paint.addEventListener('lostpointercapture', onUp);
      window.addEventListener('resize', () => DA.Pad.fit());
      if (window.ResizeObserver) new ResizeObserver(() => DA.Pad.fit()).observe(area);
    },
    fit() {
      if (!area) return;
      const r = area.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = Math.min((r.width - 16) / PW, (r.height - 16) / PH);
      stage.style.width = Math.max(50, PW * s) + 'px';
      stage.style.height = Math.max(38, PH * s) + 'px';
    },
    setTool(t) { S.tool = t; paint.style.cursor = t === 'fill' ? 'cell' : 'crosshair'; },
    setColor(c) { S.color = c; },
    setSize(s) { S.size = s; },
    setStayInside(v) { S.stayInside = v; },
    setSolidInside(v) { S.solidInside = v; },
    get state() { return S; },
    hasTemplate() { return !!S.template; },
    isEmpty() { return !S.template && !DA.alphaBounds(pctx.getImageData(0, 0, PW, PH)); },

    undo() {
      if (!S.undo.length) return;
      S.redo.push(snapshot());
      restore(S.undo.pop());
      updateHistoryButtons();
    },
    redo() {
      if (!S.redo.length) return;
      S.undo.push(snapshot());
      restore(S.redo.pop());
      updateHistoryButtons();
    },
    clear(keepTemplate) {
      pushUndo();
      pctx.clearRect(0, 0, PW, PH);
      if (!keepTemplate) setTemplateInternal(null);
      S.dirty = false;
      updateHistoryButtons();
    },
    reset() {
      pctx.clearRect(0, 0, PW, PH);
      setTemplateInternal(null);
      S.undo = []; S.redo = []; S.dirty = false;
      updateHistoryButtons();
    },
    /** Load an existing creature picture to edit it (centred, as large as fits). */
    loadSprite(src) {
      pctx.clearRect(0, 0, PW, PH);
      setTemplateInternal(null);
      S.undo = []; S.redo = []; S.dirty = false;
      const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
      if (w && h) {
        const k = Math.min((PW * 0.84) / w, (PH * 0.84) / h, 3);
        pctx.imageSmoothingQuality = 'high';
        pctx.drawImage(src, (PW - w * k) / 2, (PH - h * k) / 2, w * k, h * k);
      }
      updateHistoryButtons();
    },
    async setTemplate(t) {
      pushUndo();
      pctx.clearRect(0, 0, PW, PH);
      await loadTemplate(t);
      updateHistoryButtons();
    },

    /** Build the finished creature sprite. Returns {canvas, name, template} or null. */
    exportCreature() {
      const out = DA.makeCanvas(PW, PH);
      const c = out.getContext('2d', { willReadFrequently: true });
      if (S.template) {
        const sil = maskCanvas(S.silhouette, 255, 255, 255);
        c.drawImage(sil, 0, 0);          // white paper inside the animal
        c.drawImage(paint, 0, 0);        // user colours
        c.drawImage(outline, 0, 0);      // black lines on top
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(maskCanvas(S.silhouette, 0, 0, 0), 0, 0); // crop to the silhouette
        c.globalCompositeOperation = 'source-over';
      } else {
        const img = pctx.getImageData(0, 0, PW, PH);
        if (!DA.alphaBounds(img)) return null;
        if (S.solidInside) {
          const barrier = new Uint8Array(PW * PH);
          for (let i = 0; i < PW * PH; i++) barrier[i] = img.data[i * 4 + 3] > 90 ? 1 : 0;
          c.drawImage(maskCanvas(silhouetteFrom(barrier, 1), 255, 255, 255), 0, 0);
        }
        c.drawImage(paint, 0, 0);
      }
      const trimmed = DA.trimCanvas(out, 360, 6);
      if (!trimmed) return null;
      return { canvas: trimmed, name: S.template ? S.template.name : 'Drawing', template: S.template ? S.template.id : null };
    }
  };

  /* ---------------- history ---------------- */
  function snapshot() { return { img: pctx.getImageData(0, 0, PW, PH), template: S.template }; }
  function restore(s) {
    pctx.putImageData(s.img, 0, 0);
    if (s.template !== S.template) loadTemplate(s.template);
  }
  function pushUndo() {
    S.undo.push(snapshot());
    if (S.undo.length > MAX_UNDO) S.undo.shift();
    S.redo = [];
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    const u = document.getElementById('padUndo'), r = document.getElementById('padRedo');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
    document.dispatchEvent(new CustomEvent('pad-template', { detail: S.template }));
  }

  /* ---------------- templates ---------------- */
  function setTemplateInternal(t) {
    S.template = t;
    if (!t) { octx.clearRect(0, 0, PW, PH); S.outlineAlpha = null; S.silhouette = null; }
  }

  async function loadTemplate(t) {
    if (!t) { setTemplateInternal(null); return; }
    S.template = t;
    const img = await DA.loadImage(t.url);
    if (S.template !== t) return; // changed meanwhile
    const tmp = DA.makeCanvas(PW, PH);
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, PW, PH);
    const m = 0.06;
    tctx.drawImage(img, PW * m, PH * m, PW * (1 - 2 * m), PH * (1 - 2 * m));
    const id = tctx.getImageData(0, 0, PW, PH);
    const d = id.data;
    const barrier = new Uint8Array(PW * PH);
    S.outlineAlpha = new Uint8Array(PW * PH);
    for (let i = 0; i < PW * PH; i++) {
      const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11);
      const a = 255 - lum;
      S.outlineAlpha[i] = a;
      barrier[i] = a > 110 ? 1 : 0;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 17;
      d[i * 4 + 3] = a;
    }
    octx.clearRect(0, 0, PW, PH);
    octx.putImageData(id, 0, 0);
    S.silhouette = silhouetteFrom(barrier, 2);
  }

  /** Everything not reachable from the canvas border without crossing a barrier. */
  function silhouetteFrom(barrier, grow) {
    const n = PW * PH;
    const outside = new Uint8Array(n);
    const q = new Int32Array(n);
    let h = 0, t = 0;
    const push = (p) => { if (!outside[p] && !barrier[p]) { outside[p] = 1; q[t++] = p; } };
    for (let x = 0; x < PW; x++) { push(x); push((PH - 1) * PW + x); }
    for (let y = 0; y < PH; y++) { push(y * PW); push(y * PW + PW - 1); }
    while (h < t) {
      const p = q[h++], x = p % PW;
      if (x > 0) push(p - 1);
      if (x < PW - 1) push(p + 1);
      if (p >= PW) push(p - PW);
      if (p < n - PW) push(p + PW);
    }
    let sil = new Uint8Array(n);
    for (let i = 0; i < n; i++) sil[i] = outside[i] ? 0 : 1;
    for (let g = 0; g < (grow || 0); g++) sil = grow1(sil);
    return sil;
  }
  function grow1(m) {
    const o = new Uint8Array(m.length);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const p = y * PW + x;
      o[p] = m[p] || (x > 0 && m[p - 1]) || (x < PW - 1 && m[p + 1]) || (y > 0 && m[p - PW]) || (y < PH - 1 && m[p + PW]) ? 1 : 0;
    }
    return o;
  }
  function maskCanvas(mask, r, g, b) {
    const c = DA.makeCanvas(PW, PH);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(PW, PH);
    for (let i = 0; i < PW * PH; i++) {
      if (mask[i]) { id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = 255; }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /* ---------------- pointer drawing ---------------- */
  function pos(e) {
    const r = paint.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (PW / r.width), y: (e.clientY - r.top) * (PH / r.height) };
  }

  function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    const p = pos(e);
    if (S.tool === 'fill') { pushUndo(); bucket(Math.floor(p.x), Math.floor(p.y)); return; }
    try { paint.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    pushUndo();
    S.drawing = true;
    S.last = p; S.lastMid = p;
    const clip = S.template && S.stayInside && S.tool === 'brush';
    S.clipping = clip && buildRegion(Math.floor(p.x), Math.floor(p.y));
    if (S.clipping) {
      S.base.getContext('2d').clearRect(0, 0, PW, PH);
      S.base.getContext('2d').drawImage(paint, 0, 0);
      S.strokeCtx.clearRect(0, 0, PW, PH);
    }
    segment(p, p, p);
  }

  function onMove(e) {
    if (!S.drawing) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((ev) => {
      const p = pos(ev);
      const mid = { x: (S.last.x + p.x) / 2, y: (S.last.y + p.y) / 2 };
      segment(S.lastMid, S.last, mid);
      S.last = p; S.lastMid = mid;
    });
  }

  function onUp() {
    if (!S.drawing) return;
    S.drawing = false;
    S.dirty = true;
  }

  function segment(from, ctrl, to) {
    const ctx = S.clipping ? S.strokeCtx : pctx;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = S.size;
    if (S.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; }
    else ctx.strokeStyle = S.color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, to.x + 0.01, to.y);
    ctx.stroke();
    ctx.restore();
    if (S.clipping) {
      const tmp = S.strokeCv;
      // show base + (stroke ∩ region)
      pctx.clearRect(0, 0, PW, PH);
      pctx.drawImage(S.base, 0, 0);
      const t2 = clipTmp();
      const c2 = t2.getContext('2d');
      c2.clearRect(0, 0, PW, PH);
      c2.drawImage(tmp, 0, 0);
      c2.globalCompositeOperation = 'destination-in';
      c2.drawImage(S.region, 0, 0);
      c2.globalCompositeOperation = 'source-over';
      pctx.drawImage(t2, 0, 0);
    }
  }
  let _clipTmp = null;
  function clipTmp() { return _clipTmp || (_clipTmp = DA.makeCanvas(PW, PH)); }

  /** Region of the template enclosed by lines around (x,y), slightly grown under the lines. */
  function buildRegion(x, y) {
    if (!S.outlineAlpha) return false;
    const n = PW * PH, a = S.outlineAlpha;
    const start = y * PW + x;
    if (x < 0 || y < 0 || x >= PW || y >= PH || a[start] > 110) return false; // started on a line
    let reg = new Uint8Array(n);
    const q = new Int32Array(n);
    let h = 0, t = 0;
    reg[start] = 1; q[t++] = start;
    while (h < t) {
      const p = q[h++], px = p % PW;
      const nb = [px > 0 ? p - 1 : -1, px < PW - 1 ? p + 1 : -1, p >= PW ? p - PW : -1, p < n - PW ? p + PW : -1];
      for (let k = 0; k < 4; k++) { const r = nb[k]; if (r >= 0 && !reg[r] && a[r] <= 110) { reg[r] = 1; q[t++] = r; } }
    }
    for (let g = 0; g < 3; g++) reg = grow1(reg);
    const rc = S.region.getContext('2d');
    rc.clearRect(0, 0, PW, PH);
    rc.drawImage(maskCanvas(reg, 0, 0, 0), 0, 0);
    return true;
  }

  /* ---------------- bucket fill ---------------- */
  function bucket(x, y) {
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const img = pctx.getImageData(0, 0, PW, PH);
    const d = img.data, n = PW * PH;
    const a = S.outlineAlpha;
    const start = y * PW + x;
    if (a && a[start] > 110) { DA.toast('Tap inside an area, not on the line'); S.undo.pop(); updateHistoryButtons(); return; }
    const sr = d[start * 4], sg = d[start * 4 + 1], sb = d[start * 4 + 2], sa = d[start * 4 + 3];
    const [fr, fg, fb] = DA.hexToRgb(S.color);
    const tol = 48;
    const match = (p) => {
      if (a && a[p] > 110) return false;
      const i = p * 4;
      if (sa < 20) return d[i + 3] < 110; // transparent seed: fill all mostly-empty pixels
      return Math.abs(d[i] - sr) + Math.abs(d[i + 1] - sg) + Math.abs(d[i + 2] - sb) + Math.abs(d[i + 3] - sa) < tol * 2;
    };
    const filled = new Uint8Array(n);
    const q = new Int32Array(n);
    let h = 0, t = 0, touchesEdge = false;
    filled[start] = 1; q[t++] = start;
    while (h < t) {
      const p = q[h++], px = p % PW, py = (p / PW) | 0;
      if (px === 0 || py === 0 || px === PW - 1 || py === PH - 1) touchesEdge = true;
      const nb = [px > 0 ? p - 1 : -1, px < PW - 1 ? p + 1 : -1, py > 0 ? p - PW : -1, py < PH - 1 ? p + PW : -1];
      for (let k = 0; k < 4; k++) { const r = nb[k]; if (r >= 0 && !filled[r] && match(r)) { filled[r] = 1; q[t++] = r; } }
    }
    if (touchesEdge && (!a || !S.template)) {
      DA.toast('Close the shape first – the fill would spill everywhere!', 2800);
      S.undo.pop(); updateHistoryButtons();
      return;
    }
    if (touchesEdge && a) {
      DA.toast('That is outside the animal – tap inside the outline', 2600);
      S.undo.pop(); updateHistoryButtons();
      return;
    }
    // grow 2px so the colour slides under anti-aliased lines (no white halo)
    let grown = filled;
    for (let g = 0; g < 2; g++) grown = grow1(grown);
    for (let p = 0; p < n; p++) {
      if (!grown[p]) continue;
      const i = p * 4;
      if (filled[p]) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255; continue; }
      // edge pixel: keep existing colour on top of the fill
      const ea = d[i + 3] / 255;
      d[i] = Math.round(d[i] * ea + fr * (1 - ea));
      d[i + 1] = Math.round(d[i + 1] * ea + fg * (1 - ea));
      d[i + 2] = Math.round(d[i + 2] * ea + fb * (1 - ea));
      d[i + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
    S.dirty = true;
  }
})();
