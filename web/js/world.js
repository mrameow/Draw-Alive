/* Draw Alive – the living world: renders scenes and animates creatures.
 * Supports one big main view plus an "all worlds" overview where every scene
 * keeps living at the same time. Creatures move in many styles, do little
 * tricks on their own and sometimes interact with each other. */
(function () {
  'use strict';
  const DA = window.DA;
  const TAU = Math.PI * 2;

  const MOTIONS = {
    swim:    { label: 'Swim',    speed: 70 },
    walk:    { label: 'Walk',    speed: 55 },
    roam:    { label: 'Roam',    speed: 55 },
    hop:     { label: 'Hop',     speed: 95 },
    bounce:  { label: 'Bounce',  speed: 60 },
    slither: { label: 'Slither', speed: 45 },
    dash:    { label: 'Dash',    speed: 170 },
    fly:     { label: 'Fly',     speed: 85 },
    float:   { label: 'Float',   speed: 32 }
  };
  DA.MOTIONS = MOTIONS;
  const GROUND = { walk: 1, roam: 1, hop: 1, bounce: 1, slither: 1, dash: 1 };

  const TRICKS = ['spin', 'jump', 'wiggle', 'sleep', 'look', 'grow'];
  const TRICK_DUR = { spin: 0.9, jump: 0.8, wiggle: 1.6, sleep: 4, look: 1.6, grow: 1 };
  const GREET = ['👋', '😊', '❤️', '😄', '✨', '🥰', '👀', '💬'];

  let canvas, mainCtx, mainW = 0, mainH = 0, dpr = 1;
  // "current render target" – set before each scene is stepped
  let ctx, W = 0, H = 0, rs = null, mainView = true;
  let scene = null;          // the scene shown in the main view
  let selected = null;
  let paused = false;
  let time = 0, lastTs = 0;
  let particles = [];
  let drag = null;
  let overview = null;       // { tiles: [{scene, canvas, ctx, w, h}] }
  let interact = true;
  const listeners = {};

  function emit(name, data) { (listeners[name] || []).forEach((fn) => fn(data)); }
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- creature helpers ---------- */
  function sceneMotion(s) {
    const env = DA.ENVIRONMENTS[s.type] || {};
    return s.type === 'custom' ? (s.motion || 'walk') : (env.motion || 'roam');
  }
  function motionIn(c, s) {
    if (c.motion && c.motion !== 'auto') return c.motion;
    const m = sceneMotion(s);
    if (GROUND[m] || m === 'walk') {
      if (c.kind === 'Sky' || c.move === 'fly') return 'fly';
      if (c.move && GROUND[c.move]) return c.move;
    }
    return m;
  }
  const motionOf = (c) => motionIn(c, rs || scene);

  function baseSize() { return DA.clamp(Math.min(W, H) * 0.24, 46, 190); }
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
      tx: c.x, ty: c.y, vx: 0, vy: 0, next: 0, pause: 0, phase: Math.random() * TAU,
      faceRight: Math.random() > 0.5, spawn: c._new ? 0 : 1, hop: 0,
      trick: null, nextTrick: time + rand(4, 14), bubble: null, ix: null,
      hopT: Math.random(), dashT: Math.random() * 2, lift: 0
    };
    delete c._new;
    return c._rt;
  }

  function buildAlpha(c) {
    try {
      const img = c._img;
      const cv = DA.makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const a = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      c._alpha = { a, w: cv.width, h: cv.height };
    } catch (e) { c._alpha = null; }
  }

  function bounds(c) { return DA.motionBounds(motionOf(c), rs.type, sceneMotion(rs)); }

  function pickTarget(c, rt) {
    const m = motionOf(c);
    const b = bounds(c);
    const dist = 0.12 + Math.random() * 0.3;
    const ang = Math.random() * TAU;
    const flat = GROUND[m] && b.maxY - b.minY < 0.4 ? 0.35 : 0.8;
    rt.tx = DA.clamp(c.x + Math.cos(ang) * dist, b.minX, b.maxX);
    rt.ty = DA.clamp(c.y + Math.sin(ang) * dist * flat, b.minY, b.maxY);
    rt.next = time + rand(2, 6);
    rt.pause = Math.random() < 0.25 ? time + rand(0.6, 2.2) : 0;
  }

  function say(c, emoji, dur) {
    ensureRuntime(c).bubble = { emoji, t: 0, dur: dur || 2 };
  }

  function startTrick(c, rt, type) {
    rt.trick = { type: type || pick(TRICKS), t: 0 };
    rt.trick.dur = TRICK_DUR[rt.trick.type];
    if (rt.trick.type === 'sleep') say(c, '💤', 3.6);
    if (rt.trick.type === 'wiggle') say(c, '🎵', 1.6);
    if (rt.trick.type === 'jump') rt.hop = 1;
    if (rt.trick.type === 'grow' && Math.random() < 0.5) say(c, '💪', 1.2);
  }

  /* ---------- per-frame update ---------- */
  function update(c, dt) {
    const rt = ensureRuntime(c);
    if (rt.spawn < 1) rt.spawn = Math.min(1, rt.spawn + dt * 1.6);
    if (rt.hop > 0) rt.hop = Math.max(0, rt.hop - dt * 2.2);
    if (rt.bubble && (rt.bubble.t += dt) > rt.bubble.dur) rt.bubble = null;
    if (drag && drag.c === c) { rt.vx = rt.vy = 0; return; }

    const m = motionOf(c);
    const b = bounds(c);
    c.x = DA.clamp(c.x, b.minX - 0.02, b.maxX + 0.02);
    c.y = DA.clamp(c.y, b.minY - 0.02, b.maxY + 0.02);

    // tricks
    if (rt.trick) {
      rt.trick.t += dt;
      if (rt.trick.type === 'look' && rt.trick.t > 0.5 && !rt.trick.flipped) { rt.faceRight = !rt.faceRight; rt.trick.flipped = 1; }
      if (rt.trick.t > rt.trick.dur) { rt.trick = null; rt.nextTrick = time + rand(8, 22); }
    } else if (!rt.ix && time > rt.nextTrick) startTrick(c, rt);
    const still = rt.trick && (rt.trick.type === 'sleep' || rt.trick.type === 'spin' || rt.trick.type === 'look');

    if (!rt.ix && time > rt.next) pickTarget(c, rt);
    const dxp = (rt.tx - c.x) * W, dyp = (rt.ty - c.y) * H;
    const dist = Math.hypot(dxp, dyp);
    let speed = MOTIONS[m].speed * (c.speed == null ? 1 : c.speed) * DA.clamp(Math.min(W, H) / 700, 0.35, 1.6);
    if (rt.ix && rt.ix.speed) speed *= rt.ix.speed;

    // motion-specific speed shaping
    if (m === 'hop') {
      rt.hopT += dt * 1.25 * (0.6 + 0.4 * (c.speed == null ? 1 : c.speed));
      if (rt.hopT >= 1) rt.hopT -= 1;
      if (rt.hopT > 0.62) speed = 0; // on the ground between hops
    } else if (m === 'dash') {
      rt.dashT += dt;
      if (rt.dashT > 2.2) rt.dashT = 0;
      if (rt.dashT > 0.7) speed *= 0.05;
    }

    let wantX = 0, wantY = 0;
    if (still || (rt.pause && time < rt.pause && !rt.ix)) { /* idle */ }
    else if (dist > 4) { wantX = (dxp / dist) * speed; wantY = (dyp / dist) * speed; }
    else if (!rt.ix) pickTarget(c, rt);

    const ease = 1 - Math.exp(-dt * (m === 'float' ? 1.2 : m === 'dash' || m === 'hop' ? 9 : 3));
    rt.vx += (wantX - rt.vx) * ease;
    rt.vy += (wantY - rt.vy) * ease;
    c.x += (rt.vx * dt) / W;
    c.y += (rt.vy * dt) / H;
    if (!rt.ix || !rt.ix.facing) {
      if (rt.vx > 6) rt.faceRight = true; else if (rt.vx < -6) rt.faceRight = false;
    }
    rt.phase += dt * (2 + Math.hypot(rt.vx, rt.vy) / 18);
  }

  /* ---------- drawing ---------- */
  function draw(c) {
    const rt = ensureRuntime(c);
    const img = c._img;
    if (!img || !(img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth))) return;
    const m = motionOf(c);
    const d = dims(c);
    let x = c.x * W, y = c.y * H, rot = 0, sx = 1, sy = 1, lift = 0;
    const moving = Math.min(1, Math.hypot(rt.vx, rt.vy) / 30);
    const ph = rt.phase;
    const k = Math.min(1, d.h / 120); // scale wobble amounts for small tiles

    if (m === 'swim') {
      y += Math.sin(ph * 0.8) * 4 * k;
      rot = DA.clamp(Math.atan2(rt.vy, Math.abs(rt.vx) + 20) * 0.6, -0.5, 0.5) + Math.sin(ph * 1.6) * 0.04;
      sx = 1 + Math.sin(ph * 2.2) * 0.035;
    } else if (m === 'float') {
      y += Math.sin(ph * 0.7) * 6 * k; x += Math.cos(ph * 0.5) * 4 * k;
      rot = Math.sin(ph * 0.4) * 0.18;
    } else if (m === 'fly') {
      y += Math.sin(ph * 0.9) * 8 * k;
      sy = 1 + Math.sin(ph * 5) * 0.08;
      rot = DA.clamp(rt.vy / 300, -0.25, 0.25);
    } else if (m === 'hop') {
      const t = rt.hopT;
      if (t < 0.62) { const u = t / 0.62; lift = Math.sin(u * Math.PI) * d.h * 0.45; rot = (u - 0.5) * -0.35; sy = 1 + Math.sin(u * Math.PI) * 0.08; sx = 2 - sy; }
      else { const u = (t - 0.62) / 0.38; const sq = Math.sin(u * Math.PI) * 0.12; sx = 1 + sq; sy = 1 - sq; }
    } else if (m === 'bounce') {
      const s = Math.abs(Math.sin(ph * 1.3));
      lift = s * d.h * 0.35;
      const sq = Math.max(0, 0.25 - s) * 0.6;
      sx = 1 + sq; sy = 1 - sq;
      rot = Math.sin(ph * 0.65) * 0.12;
    } else if (m === 'slither') {
      rot = Math.sin(ph * 1.8) * 0.16;
      y += Math.cos(ph * 1.8) * 5 * k;
      sx = 1 + Math.sin(ph * 3.6) * 0.06; sy = 1 - Math.sin(ph * 3.6) * 0.03;
    } else if (m === 'dash') {
      const fast = Math.min(1, Math.abs(rt.vx) / 90);
      rot = -0.18 * fast;
      sx = 1 + fast * 0.12; sy = 1 - fast * 0.06;
      lift = Math.abs(Math.sin(ph * 2.4)) * 4 * k * moving;
    } else { // walk & roam
      lift = Math.abs(Math.sin(ph * 1.4)) * 7 * moving * k;
      rot = Math.sin(ph * 1.4) * 0.06 * moving;
      const squash = moving * Math.max(0, 0.06 - lift / 120);
      sx = 1 + squash; sy = 1 - squash;
    }

    // tricks
    let extraScale = 1;
    const tr = rt.trick;
    if (tr) {
      const u = tr.t / tr.dur;
      if (tr.type === 'spin') rot += u * TAU;
      else if (tr.type === 'wiggle') { rot += Math.sin(tr.t * 18) * 0.22; lift += Math.abs(Math.sin(tr.t * 9)) * 6 * k; }
      else if (tr.type === 'sleep') { const br = Math.sin(tr.t * 2.5) * 0.04; sy *= 0.94 + br; sx *= 1.02 - br; rot = 0.12; }
      else if (tr.type === 'grow') extraScale = 1 + Math.sin(u * Math.PI) * 0.35;
    }
    if (rt.hop > 0) { lift += Math.sin(rt.hop * Math.PI) * 40 * k; rot += Math.sin(rt.hop * TAU * 2) * 0.12; }
    y -= lift;
    const sp = (rt.spawn < 1 ? elastic(rt.spawn) : 1) * extraScale;

    // shadow (shrinks while in the air)
    if (GROUND[m]) {
      const g = 1 / (1 + lift / (d.h * 0.5));
      ctx.fillStyle = `rgba(0,0,0,${0.18 * g})`;
      ctx.beginPath();
      ctx.ellipse(c.x * W, c.y * H + d.h * 0.46, d.w * 0.36 * sp * g, d.h * 0.07 * sp * g, 0, 0, TAU);
      ctx.fill();
    }
    // speed lines while dashing
    if (m === 'dash' && Math.abs(rt.vx) > 60) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const dir = rt.vx > 0 ? -1 : 1;
      for (let i = -1; i <= 1; i++) {
        const ly = y + i * d.h * 0.2, lx = x + dir * d.w * 0.55;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + dir * d.w * (0.25 + Math.random() * 0.15), ly); ctx.stroke();
      }
    }

    const facesLeft = (c.facing || 'left') === 'left';
    const flip = rt.faceRight ? facesLeft : !facesLeft;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(flip ? -rot : rot);
    ctx.scale((flip ? -1 : 1) * sx * sp, sy * sp);
    ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
    ctx.restore();

    if (rt.bubble) drawBubble(rt.bubble, x + d.w * 0.25, y - d.h * 0.5 * sp - 6);

    if (c === selected && mainView) {
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

  function drawBubble(b, x, y) {
    const u = b.t / b.dur;
    const a = Math.min(1, b.t * 6, (1 - u) * 6);
    if (a <= 0) return;
    const s = DA.clamp(Math.min(W, H) / 22, 12, 24) * (u < 0.1 ? 0.6 + u * 4 : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y - Math.sin(u * Math.PI) * 4);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(0, -s, s * 0.95, 0, TAU);
    ctx.moveTo(-s * 0.35, -s * 0.2); ctx.lineTo(-s * 0.6, s * 0.45); ctx.lineTo(s * 0.05, -s * 0.1);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.font = `${Math.round(s * 1.1)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.emoji, 0, -s + 1);
    ctx.restore();
  }

  function elastic(t) { return t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1; }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* ---------- interactions between creatures ---------- */
  const IX_TYPES = ['greet', 'chase', 'dance', 'highfive', 'greet', 'chase'];

  function endIx(ix) {
    ix.a._rt && (ix.a._rt.ix = null);
    ix.b._rt && (ix.b._rt.ix = null);
    [ix.a, ix.b].forEach((c) => { const rt = c._rt; if (rt) { rt.next = time + rand(0.5, 2); rt.nextTrick = time + rand(6, 16); } });
  }

  function updateInteractions(s, dt) {
    const ixs = (s._ix = s._ix || { list: [], next: time + rand(3, 7) });
    // run active interactions
    ixs.list = ixs.list.filter((ix) => {
      const { a, b } = ix;
      if (!s.creatures.includes(a) || !s.creatures.includes(b) || (drag && (drag.c === a || drag.c === b))) { endIx(ix); return false; }
      const ra = ensureRuntime(a), rb = ensureRuntime(b);
      ix.t += dt;
      const dx = (b.x - a.x) * W, dy = (b.y - a.y) * H;
      const dist = Math.hypot(dx, dy);
      const da = dims(a), db = dims(b);
      const near = (da.w + db.w) * 0.42;

      if (ix.type === 'chase') {
        ra.tx = b.x; ra.ty = b.y; ra.ix.speed = 1.45;
        const bb = bounds(b);
        const len = Math.max(1, dist);
        rb.tx = DA.clamp(b.x + (dx / len) * 0.25, bb.minX, bb.maxX);
        rb.ty = DA.clamp(b.y + (dy / len) * 0.2, bb.minY, bb.maxY);
        rb.ix.speed = 1.25;
        if (ix.t > 5 || dist < near * 0.6) {
          say(a, dist < near * 0.6 ? '🙌' : '😂', 1.8); say(b, '😆', 1.8);
          if (dist < near * 0.6) { ra.hop = 1; rb.hop = 1; if (mainView && s === scene) burst((a.x + b.x) / 2 * W, (a.y + b.y) / 2 * H, 12); }
          endIx(ix); return false;
        }
        return true;
      }

      if (ix.phase === 'approach') {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const ba = bounds(a), bb = bounds(b);
        const off = near / 2 / W;
        ra.tx = DA.clamp(mx - (a.x < b.x ? off : -off), ba.minX, ba.maxX); ra.ty = DA.clamp(my, ba.minY, ba.maxY);
        rb.tx = DA.clamp(mx + (a.x < b.x ? off : -off), bb.minX, bb.maxX); rb.ty = DA.clamp(my, bb.minY, bb.maxY);
        if (dist < near * 1.15 || ix.t > 7) {
          ix.phase = 'act'; ix.t = 0;
          ra.ix.facing = rb.ix.facing = true;
          ra.faceRight = b.x > a.x; rb.faceRight = a.x > b.x;
          ra.tx = a.x; ra.ty = a.y; rb.tx = b.x; rb.ty = b.y;
          if (ix.type === 'greet') { say(a, pick(GREET), 2.2); setTimeout(() => say(b, pick(GREET), 2), 500); ra.hop = 1; }
          if (ix.type === 'dance') { startTrick(a, ra, 'wiggle'); startTrick(b, rb, 'wiggle'); ra.trick.dur = rb.trick.dur = 2.4; }
          if (ix.type === 'highfive') { say(a, '✋', 1.6); say(b, '✋', 1.6); ra.hop = rb.hop = 1; }
        }
        return true;
      }
      // act
      if (ix.type === 'highfive' && !ix.sparked && ix.t > 0.35) {
        ix.sparked = true;
        if (mainView && s === scene) burst((a.x + b.x) / 2 * W, Math.min(a.y, b.y) * H - 20, 18);
      }
      if (ix.type === 'dance' && !ix.spun && ix.t > 1.4) { ix.spun = true; startTrick(a, ra, 'spin'); startTrick(b, rb, 'spin'); }
      if (ix.t > 2.6) { endIx(ix); return false; }
      return true;
    });

    if (!interact || time < ixs.next) return;
    ixs.next = time + rand(4, 10);
    const free = s.creatures.filter((c) => { const rt = ensureRuntime(c); return !rt.ix && !(rt.trick && rt.trick.type === 'sleep') && !(drag && drag.c === c); });
    if (free.length < 2) return;
    const a = pick(free);
    // prefer a nearby partner
    const others = free.filter((c) => c !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
    const b = Math.random() < 0.7 ? others[0] : pick(others);
    const type = pick(IX_TYPES);
    const ix = { a, b, type, t: 0, phase: type === 'chase' ? 'act' : 'approach' };
    ensureRuntime(a).ix = {}; ensureRuntime(b).ix = {};
    a._rt.trick = null; b._rt.trick = null;
    if (type === 'chase') { say(a, pick(['😈', '🏃', '😜']), 1.6); say(b, pick(['😱', '💨', '🙈']), 1.6); }
    ixs.list.push(ix);
  }

  /* ---------- particles ---------- */
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

  /* ---------- scene stepping ---------- */
  function stepScene(s, target, dt, isMain) {
    ctx = target.ctx; W = target.w; H = target.h; rs = s; mainView = isMain;
    ctx.setTransform(target.dpr, 0, 0, target.dpr, 0, 0);
    DA.Env.render(ctx, s, W, H, time);
    const list = s.creatures.slice();
    if (!paused) {
      list.forEach((c) => update(c, dt));
      if (list.length > 1) updateInteractions(s, dt);
    }
    if (!GROUND[sceneMotion(s)] && sceneMotion(s) !== 'walk') { /* keep layer order */ } else list.sort((a, b) => a.y - b.y);
    list.forEach(draw);
    if (isMain) drawParticles(paused ? 0 : dt);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    render(dt);
  }

  function render(dt) {
    if (!paused) time += dt;
    if (overview) {
      overview.tiles.forEach((t) => { if (t.w > 4 && t.h > 4) stepScene(t.scene, t, dt, false); });
      return;
    }
    if (!scene || !mainW || !mainH) return;
    stepScene(scene, { ctx: mainCtx, w: mainW, h: mainH, dpr }, dt, true);
  }

  /* ---------- interaction (pointer) ---------- */
  function setMain() { ctx = mainCtx; W = mainW; H = mainH; rs = scene; mainView = true; }

  function hit(px, py) {
    setMain();
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
    if (!scene || overview) return;
    const p = local(e);
    const c = hit(p.x, p.y);
    if (!c) { DA.World.select(null); return; }
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    drag = { c, ox: p.x - c.x * mainW, oy: p.y - c.y * mainH, sx: p.x, sy: p.y, moved: false };
    DA.World.select(c);
  }
  function onMove(e) {
    if (!drag) {
      if (scene && !overview && e.pointerType === 'mouse') { const p = local(e); canvas.style.cursor = hit(p.x, p.y) ? 'grab' : 'default'; }
      return;
    }
    const p = local(e);
    if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5) drag.moved = true;
    if (drag.moved) {
      canvas.style.cursor = 'grabbing';
      drag.c.x = DA.clamp((p.x - drag.ox) / mainW, 0.02, 0.98);
      drag.c.y = DA.clamp((p.y - drag.oy) / mainH, 0.02, 0.98);
    }
  }
  function onUp() {
    if (!drag) return;
    const c = drag.c, rt = ensureRuntime(c);
    if (!drag.moved) { rt.hop = 1; if (Math.random() < 0.6) say(c, pick(['😊', '❤️', '😄', '✨', '😝', '🎉']), 1.4); emit('tap', c); }
    else { rt.tx = c.x; rt.ty = c.y; rt.next = time + 1; emit('change'); }
    drag = null;
    canvas.style.cursor = 'default';
  }

  function buildAlphaFromCanvas(c, cv) {
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const a = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
      c._alpha = { a, w: cv.width, h: cv.height };
    } catch (e) { c._alpha = null; }
  }

  /* ---------- public API ---------- */
  DA.World = {
    init(el) {
      canvas = el;
      mainCtx = canvas.getContext('2d');
      const resize = () => {
        const r = canvas.parentElement.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        mainW = Math.max(1, r.width); mainH = Math.max(1, r.height);
        canvas.width = Math.round(mainW * dpr); canvas.height = Math.round(mainH * dpr);
        canvas.style.width = mainW + 'px'; canvas.style.height = mainH + 'px';
      };
      window.addEventListener('resize', resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement);
      resize();
      setMain();
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
      setMain();
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
      setMain();
      const c = {
        id: DA.uid(), name: info.name || 'Creature', kind: info.kind || null, move: info.move || null,
        sprite: canvasSprite.toDataURL('image/png'), w: canvasSprite.width, h: canvasSprite.height,
        scale: 1, speed: info.speed || 1, facing: info.facing || 'left', motion: 'auto', x: 0.5, y: 0.5, _new: true
      };
      c._img = canvasSprite; // draw immediately, Image loads lazily after reload
      const b = DA.motionBounds(motionIn(c, scene), scene.type, sceneMotion(scene));
      c.x = DA.lerp(b.minX + 0.1, b.maxX - 0.1, 0.25 + Math.random() * 0.5);
      c.y = DA.lerp(b.minY, b.maxY, 0.3 + Math.random() * 0.4);
      buildAlphaFromCanvas(c, canvasSprite);
      scene.creatures.push(c);
      burst(c.x * W, c.y * H, 34);
      setTimeout(() => { if (c._rt) say(c, pick(['👋', '😄', '🎉', '✨']), 1.8); }, 700);
      emit('change');
      return c;
    },
    duplicate(c) {
      setMain();
      const copy = Object.assign({}, c, { id: DA.uid(), x: DA.clamp(c.x + 0.06, 0.05, 0.95), _rt: null, _new: true });
      scene.creatures.push(copy);
      burst(copy.x * W, copy.y * H, 18);
      emit('change');
      return copy;
    },
    remove(c) {
      setMain();
      const i = scene.creatures.indexOf(c);
      if (i < 0) return;
      burst(c.x * W, c.y * H, 16);
      scene.creatures.splice(i, 1);
      if (selected === c) this.select(null);
      emit('change');
      return { c, i };
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
      setMain();
      scene.creatures.forEach((c, i) => {
        const rt = ensureRuntime(c);
        rt.hop = 1;
        setTimeout(() => { if (c._rt) startTrick(c, c._rt, i % 2 ? 'spin' : 'wiggle'); }, 500);
        say(c, pick(['🎉', '🥳', '🎵', '✨', '😄']), 2);
      });
      burst(W / 2, H / 2, 50);
    },
    trick(c, type) { if (c) startTrick(c, ensureRuntime(c), type); },
    setPaused(v) { paused = v; },
    get paused() { return paused; },
    setInteract(v) { interact = !!v; },
    motionOf(c) { return motionIn(c, scene); },
    /** Overview: animate several scenes at once into their own canvases. */
    setOverview(tiles) {
      overview = tiles && tiles.length ? { tiles } : null;
      if (overview) { selected = null; drag = null; emit('select', null); }
      setMain();
    },
    get overview() { return !!overview; },
    snapshot() {
      const was = selected;
      selected = null;
      const p = particles; particles = [];
      stepScene(scene, { ctx: mainCtx, w: mainW, h: mainH, dpr }, 0, true);
      particles = p;
      const url = canvas.toDataURL('image/png');
      selected = was;
      return url;
    },
    changed() { emit('change'); }
  };
})();
