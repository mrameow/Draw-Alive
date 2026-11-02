/* Draw Alive – the living world: renders the current scene and animates creatures. */
(function () {
  'use strict';
  const DA = window.DA;
  const TAU = Math.PI * 2;

  const MOTIONS = {
    swim:  { label: 'Swim',  speed: 70 },
    roam:  { label: 'Roam',  speed: 55 },
    walk:  { label: 'Walk',  speed: 55 },
    float: { label: 'Float', speed: 32 },
    fly:   { label: 'Fly',   speed: 85 }
  };
  DA.MOTIONS = MOTIONS;

  let canvas, ctx, W = 0, H = 0, dpr = 1;
  let scene = null;
  let selected = null;
  let paused = false;
  let time = 0, lastTs = 0;
  let particles = [];
  let drag = null;
  const listeners = {};

  function emit(name, data) { (listeners[name] || []).forEach((fn) => fn(data)); }

  /* ---------- creature helpers ---------- */
  function motionOf(c) {
    if (c.motion && c.motion !== 'auto') return c.motion;
    const env = DA.ENVIRONMENTS[scene.type] || {};
    let m = scene.type === 'custom' ? (scene.motion || 'walk') : env.motion;
    if (m === 'walk' && c.kind === 'Sky') m = 'fly';
    return m || 'roam';
  }

  function baseSize() { return DA.clamp(Math.min(W, H) * 0.24, 70, 190); }

  function dims(c) {
    const s = baseSize() * (c.scale || 1);
    const k = s / Math.max(c.w, c.h);
    return { w: c.w * k, h: c.h * k };
  }

  function ensureRuntime(c) {
    if (c._rt) return c._rt;
    if (!c._img) {
      const img = new Image();
      img.src = c.sprite;
      c._img = img;
      img.onload = () => buildAlpha(c);
    }
    c._rt = {
      tx: c.x, ty: c.y, vx: 0, vy: 0, next: 0, phase: Math.random() * TAU,
      faceRight: Math.random() > 0.5, spawn: c._new ? 0 : 1, hop: 0, blink: 0
    };
    delete c._new;
    return c._rt;
  }

  function buildAlpha(c) {
    try {
      const img = c._img;
      const cv = DA.makeCanvas(img.naturalWidth, img.naturalHeight);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const a = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      c._alpha = { a, w: cv.width, h: cv.height };
    } catch (e) { c._alpha = null; }
  }

  function pickTarget(c, rt) {
    const b = DA.motionBounds(motionOf(c));
    const dist = 0.12 + Math.random() * 0.3;
    const ang = Math.random() * TAU;
    rt.tx = DA.clamp(c.x + Math.cos(ang) * dist, b.minX, b.maxX);
    rt.ty = DA.clamp(c.y + Math.sin(ang) * dist * (motionOf(c) === 'walk' ? 0.35 : 0.8), b.minY, b.maxY);
    rt.next = time + 2 + Math.random() * 4;
    rt.pause = Math.random() < 0.25 ? time + 0.6 + Math.random() * 1.6 : 0;
  }

  function update(c, dt) {
    const rt = ensureRuntime(c);
    if (rt.spawn < 1) rt.spawn = Math.min(1, rt.spawn + dt * 1.6);
    if (rt.hop > 0) rt.hop = Math.max(0, rt.hop - dt * 2.2);
    if (drag && drag.c === c) { rt.vx = rt.vy = 0; return; }
    const m = motionOf(c);
    const b = DA.motionBounds(m);
    // keep inside the allowed area (e.g. after motion change or resize)
    c.x = DA.clamp(c.x, b.minX - 0.02, b.maxX + 0.02);
    c.y = DA.clamp(c.y, b.minY - 0.02, b.maxY + 0.02);

    if (time > rt.next) pickTarget(c, rt);
    const dxp = (rt.tx - c.x) * W, dyp = (rt.ty - c.y) * H;
    const dist = Math.hypot(dxp, dyp);
    const speed = MOTIONS[m].speed * (c.speed || 1) * DA.clamp(Math.min(W, H) / 700, 0.6, 1.6);
    let wantX = 0, wantY = 0;
    if (rt.pause && time < rt.pause) { /* idle */ }
    else if (dist > 4) { wantX = (dxp / dist) * speed; wantY = (dyp / dist) * speed; }
    else pickTarget(c, rt);
    const ease = 1 - Math.exp(-dt * (m === 'float' ? 1.2 : 3));
    rt.vx += (wantX - rt.vx) * ease;
    rt.vy += (wantY - rt.vy) * ease;
    c.x += (rt.vx * dt) / W;
    c.y += (rt.vy * dt) / H;
    if (rt.vx > 6) rt.faceRight = true; else if (rt.vx < -6) rt.faceRight = false;
    rt.phase += dt * (2 + Math.hypot(rt.vx, rt.vy) / 18);
  }

  function draw(c) {
    const rt = ensureRuntime(c);
    const img = c._img;
    if (!img || !(img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth))) return;
    const m = motionOf(c);
    const d = dims(c);
    let x = c.x * W, y = c.y * H, rot = 0, sx = 1, sy = 1;
    const moving = Math.min(1, Math.hypot(rt.vx, rt.vy) / 30);
    const ph = rt.phase;

    if (m === 'swim') {
      y += Math.sin(ph * 0.8) * 4;
      rot = DA.clamp(Math.atan2(rt.vy, Math.abs(rt.vx) + 20) * 0.6, -0.5, 0.5) + Math.sin(ph * 1.6) * 0.04;
      sx = 1 + Math.sin(ph * 2.2) * 0.035;
    } else if (m === 'float') {
      y += Math.sin(ph * 0.7) * 6; x += Math.cos(ph * 0.5) * 4;
      rot = Math.sin(ph * 0.4) * 0.18;
    } else if (m === 'fly') {
      y += Math.sin(ph * 0.9) * 8;
      sy = 1 + Math.sin(ph * 5) * 0.08;
      rot = DA.clamp(rt.vy / 300, -0.25, 0.25);
    } else { // walk & roam
      const hopY = Math.abs(Math.sin(ph * 1.4)) * 7 * moving;
      y -= hopY;
      rot = Math.sin(ph * 1.4) * 0.06 * moving;
      const squash = moving * Math.max(0, 0.06 - hopY / 120);
      sx = 1 + squash; sy = 1 - squash;
    }
    if (rt.hop > 0) { y -= Math.sin(rt.hop * Math.PI) * 40; rot += Math.sin(rt.hop * TAU * 2) * 0.12; }
    const sp = rt.spawn < 1 ? elastic(rt.spawn) : 1;

    // shadow
    if (m === 'walk' || m === 'roam') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(c.x * W, c.y * H + d.h * 0.46, d.w * 0.36 * sp, d.h * 0.07 * sp, 0, 0, TAU);
      ctx.fill();
    }

    // facing: sprites face c.facing; flip when moving the other way
    const facesLeft = (c.facing || 'left') === 'left';
    const flip = rt.faceRight ? facesLeft : !facesLeft;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(flip ? -rot : rot);
    ctx.scale((flip ? -1 : 1) * sx * sp, sy * sp);
    ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();

    if (c === selected) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -time * 30;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6;
      roundRect(ctx, x - d.w / 2 - 8, y - d.h / 2 - 8, d.w + 16, d.h + 16, 14);
      ctx.stroke();
      ctx.restore();
    }
  }

  function elastic(t) { return t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1; }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function burst(x, y, n) {
    const colors = ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c', '#da77f2', '#ffffff'];
    for (let i = 0; i < (n || 26); i++) {
      const a = Math.random() * TAU, s = 80 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 1, size: 3 + Math.random() * 5, c: colors[i % colors.length], star: Math.random() < 0.4 });
    }
  }
  function drawParticles(dt) {
    particles = particles.filter((p) => (p.life -= dt * 1.3) > 0);
    particles.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.98;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      if (p.star) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 6);
        ctx.beginPath();
        for (let k = 0; k < 10; k++) { const r = k % 2 ? p.size * 0.45 : p.size * 1.2; ctx.lineTo(Math.cos(k * Math.PI / 5) * r, Math.sin(k * Math.PI / 5) * r); }
        ctx.fill(); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    render(dt);
  }

  function render(dt) {
    if (!scene || !W || !H) return;
    if (!paused) time += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    DA.Env.render(ctx, scene, W, H, time);
    const list = scene.creatures.slice();
    if (!paused) list.forEach((c) => update(c, dt));
    const m = DA.ENVIRONMENTS[scene.type] ? DA.ENVIRONMENTS[scene.type].motion : 'walk';
    if (m !== 'swim' && m !== 'float') list.sort((a, b) => a.y - b.y);
    list.forEach(draw);
    drawParticles(paused ? 0 : dt);
  }

  /* ---------- interaction ---------- */
  function hit(px, py) {
    for (let i = scene.creatures.length - 1; i >= 0; i--) {
      const c = scene.creatures[i];
      const d = dims(c);
      const cx = c.x * W, cy = c.y * H;
      if (Math.abs(px - cx) > d.w / 2 + 6 || Math.abs(py - cy) > d.h / 2 + 6) continue;
      if (!c._alpha) return c;
      const rt = ensureRuntime(c);
      const facesLeft = (c.facing || 'left') === 'left';
      const flip = rt.faceRight ? facesLeft : !facesLeft;
      let u = (px - cx) / d.w + 0.5;
      if (flip) u = 1 - u;
      const v = (py - cy) / d.h + 0.5;
      const A = c._alpha;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const ax = Math.floor(u * A.w) + ox * 4, ay = Math.floor(v * A.h) + oy * 4;
        if (ax >= 0 && ay >= 0 && ax < A.w && ay < A.h && A.a[ay * A.w + ax] > 40) return c;
      }
    }
    return null;
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (!scene) return;
    const p = local(e);
    const c = hit(p.x, p.y);
    if (!c) { DA.World.select(null); return; }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    drag = { c, ox: p.x - c.x * W, oy: p.y - c.y * H, sx: p.x, sy: p.y, moved: false };
    DA.World.select(c);
  }
  function onMove(e) {
    if (!drag) {
      if (scene && e.pointerType === 'mouse') canvas.style.cursor = hit(...Object.values(local(e))) ? 'grab' : 'default';
      return;
    }
    const p = local(e);
    if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) drag.moved = true;
    if (drag.moved) {
      canvas.style.cursor = 'grabbing';
      drag.c.x = DA.clamp((p.x - drag.ox) / W, 0.02, 0.98);
      drag.c.y = DA.clamp((p.y - drag.oy) / H, 0.02, 0.98);
    }
  }
  function onUp() {
    if (!drag) return;
    const c = drag.c, rt = ensureRuntime(c);
    if (!drag.moved) { rt.hop = 1; }
    else { rt.tx = c.x; rt.ty = c.y; rt.next = time + 1; emit('change'); }
    drag = null;
    canvas.style.cursor = 'default';
  }

  /* ---------- public API ---------- */
  DA.World = {
    init(el) {
      canvas = el;
      ctx = canvas.getContext('2d');
      const resize = () => {
        const r = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      };
      window.addEventListener('resize', resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
      resize();
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      requestAnimationFrame(frame);
    },
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    setScene(s) {
      scene = s;
      selected = null; drag = null; particles = [];
      DA.Env.prepare(s);
      emit('select', null);
    },
    get scene() { return scene; },
    get selected() { return selected; },
    select(c) {
      if (selected === c) return;
      selected = c;
      emit('select', c);
    },
    /** Add a creature from a sprite canvas. */
    addCreature(canvasSprite, info) {
      info = info || {};
      const env = DA.ENVIRONMENTS[scene.type] || {};
      const c = {
        id: DA.uid(), name: info.name || 'Creature', kind: info.kind || null,
        sprite: canvasSprite.toDataURL('image/png'), w: canvasSprite.width, h: canvasSprite.height,
        scale: 1, speed: 1, facing: info.facing || 'left', motion: 'auto', x: 0.5, y: 0.5, _new: true
      };
      c._img = canvasSprite; // draw immediately, Image loads lazily after reload
      const b = DA.motionBounds(scene.type === 'custom' ? (scene.motion || 'walk') : (c.kind === 'Sky' && env.motion === 'walk' ? 'fly' : env.motion));
      c.x = DA.lerp(b.minX + 0.1, b.maxX - 0.1, 0.25 + Math.random() * 0.5);
      c.y = DA.lerp(b.minY, b.maxY, 0.3 + Math.random() * 0.4);
      buildAlphaFromCanvas(c, canvasSprite);
      scene.creatures.push(c);
      burst(c.x * W, c.y * H, 34);
      emit('change');
      return c;
    },
    duplicate(c) {
      const copy = Object.assign({}, c, { id: DA.uid(), x: DA.clamp(c.x + 0.06, 0.05, 0.95), _rt: null, _new: true });
      scene.creatures.push(copy);
      burst(copy.x * W, copy.y * H, 18);
      emit('change');
      return copy;
    },
    remove(c) {
      const i = scene.creatures.indexOf(c);
      if (i < 0) return;
      const d = dims(c);
      burst(c.x * W, c.y * H, 16);
      scene.creatures.splice(i, 1);
      if (selected === c) this.select(null);
      emit('change');
      return { c, i, d };
    },
    restore(c, i) {
      scene.creatures.splice(Math.min(i, scene.creatures.length), 0, c);
      emit('change');
    },
    bringToFront(c) {
      const i = scene.creatures.indexOf(c);
      if (i >= 0) { scene.creatures.splice(i, 1); scene.creatures.push(c); emit('change'); }
    },
    celebrate() {
      scene.creatures.forEach((c) => { ensureRuntime(c).hop = 1; });
      burst(W / 2, H / 2, 50);
    },
    setPaused(v) { paused = v; },
    get paused() { return paused; },
    motionOf(c) { return motionOf(c); },
    snapshot() {
      const was = selected;
      selected = null;
      render(0);
      const url = canvas.toDataURL('image/png');
      selected = was;
      return url;
    },
    changed() { emit('change'); }
  };

  function buildAlphaFromCanvas(c, cv) {
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const a = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      c._alpha = { a, w: cv.width, h: cv.height };
    } catch (e) { c._alpha = null; }
  }
})();
