/* Draw Alive – animated environments. Every scene owns one renderer whose
 * decorations are generated from the scene seed in normalised (0..1) coordinates,
 * so layouts survive window resizes and reloads. */
(function () {
  'use strict';
  const DA = window.DA;
  const TAU = Math.PI * 2;

  DA.ENVIRONMENTS = {
    ocean:  { name: 'Ocean',  icon: '🌊', motion: 'swim',  desc: 'Sea creatures swim around' },
    forest: { name: 'Forest', icon: '🌲', motion: 'roam',  desc: 'Animals roam a forest clearing' },
    space:  { name: 'Space',  icon: '🚀', motion: 'float', desc: 'Zero-gravity floating' },
    meadow: { name: 'Meadow', icon: '🌼', motion: 'walk',  desc: 'Sunny hills with flowers' },
    snow:   { name: 'Snow',   icon: '❄️', motion: 'walk',  desc: 'Snowy night with aurora' },
    custom: { name: 'My Photo', icon: '🖼️', motion: 'walk', desc: 'Use your own picture' }
  };

  /** Where creatures are allowed to move, as fractions of the canvas. */
  const BOUNDS = {
    swim:  { minX: 0.06, maxX: 0.94, minY: 0.1, maxY: 0.84 },
    roam:  { minX: 0.1, maxX: 0.9, minY: 0.12, maxY: 0.88 },
    float: { minX: 0.05, maxX: 0.95, minY: 0.06, maxY: 0.94 },
    walk:  { minX: 0.05, maxX: 0.95, minY: 0.66, maxY: 0.93 },
    fly:   { minX: 0.05, maxX: 0.95, minY: 0.08, maxY: 0.6 }
  };
  DA.motionBounds = (motion) => BOUNDS[motion] || BOUNDS.roam;

  function decor(type, seed) {
    const r = DA.rng(seed);
    const R = (a, b) => a + r() * (b - a);
    const d = {};
    if (type === 'ocean') {
      d.seaweed = Array.from({ length: 13 }, (_, i) => ({
        x: (i + R(0.1, 0.9)) / 13, h: R(0.14, 0.32), thick: R(4, 7),
        color: ['#1f8a4c', '#2fb36a', '#13693a'][i % 3], phase: R(0, TAU), speed: R(0.7, 1.3)
      }));
      d.bubbles = Array.from({ length: 22 }, () => ({ x: R(0, 1), y: R(0, 1), s: R(2, 7), speed: R(0.02, 0.06), wob: R(0, TAU) }));
      d.coral = Array.from({ length: 7 }, (_, i) => ({
        x: (i + R(0.15, 0.85)) / 7, s: R(16, 30), color: ['#ff7b7b', '#ffb36b', '#ff6fb5', '#b98cff', '#ffd76b'][i % 5]
      }));
      d.rocks = Array.from({ length: 5 }, () => ({ x: R(0, 1), w: R(30, 70), h: R(14, 30) }));
      d.fishShadows = Array.from({ length: 4 }, () => ({ y: R(0.15, 0.6), speed: R(0.01, 0.025), off: R(0, 1), s: R(6, 12) }));
    } else if (type === 'forest') {
      d.trees = [];
      const per = 5;
      for (let i = 0; i < per; i++) {
        d.trees.push({ x: (i + 0.5) / per + R(-0.04, 0.04), y: R(0.02, 0.09) });
        d.trees.push({ x: (i + 0.5) / per + R(-0.04, 0.04), y: R(0.91, 0.98) });
      }
      for (let i = 0; i < 3; i++) {
        d.trees.push({ x: R(0.01, 0.06), y: (i + 0.7) / 3.4 });
        d.trees.push({ x: R(0.94, 0.99), y: (i + 0.7) / 3.4 });
      }
      d.trees.forEach((t, i) => Object.assign(t, {
        s: R(30, 50), color: ['#2e8b3a', '#3aa34a', '#1f6e2c', '#4fae5b'][i % 4], phase: R(0, TAU), speed: R(0.6, 1.1)
      }));
      d.grass = Array.from({ length: 140 }, () => ({ x: R(0, 1), y: R(0, 1), h: R(4, 9) }));
      d.flowers = Array.from({ length: 26 }, () => ({ x: R(0.08, 0.92), y: R(0.12, 0.88), c: ['#fff', '#ffe066', '#ff8fab', '#a5d8ff'][Math.floor(R(0, 4))] }));
      d.mushrooms = Array.from({ length: 6 }, () => ({ x: R(0.1, 0.9), y: R(0.15, 0.85), s: R(7, 12), c: ['#e8505b', '#c97b4a', '#f2a65a'][Math.floor(R(0, 3))] }));
      d.leaves = Array.from({ length: 12 }, () => ({ x: R(0, 1), y: R(0, 1), s: R(3, 6), c: ['#ffcf3f', '#ff9f43', '#ee5a24', '#6ab04c'][Math.floor(R(0, 4))], phase: R(0, TAU) }));
      d.pond = { x: R(0.25, 0.75), y: R(0.3, 0.7), rx: R(0.07, 0.1), ry: R(0.05, 0.07) };
    } else if (type === 'space') {
      d.stars = Array.from({ length: 170 }, () => ({ x: R(0, 1), y: R(0, 1), s: R(0.5, 2), b: R(0.3, 1), phase: R(0, TAU), speed: R(0.6, 2) }));
      d.nebula = Array.from({ length: 6 }, (_, i) => ({ x: R(0, 1), y: R(0, 1), s: R(0.18, 0.35), c: ['138,43,226', '255,20,147', '0,191,255', '75,0,130'][i % 4], phase: R(0, TAU) }));
      d.planets = Array.from({ length: 3 }, (_, i) => ({
        x: (i + R(0.2, 0.8)) / 3, y: R(0.12, 0.88), s: R(18, 42), c: ['#ff7b7b', '#4ecdc4', '#ffd166', '#b388ff'][Math.floor(R(0, 4))], ring: r() > 0.5, phase: R(0, TAU)
      }));
      d.asteroids = Array.from({ length: 14 }, () => ({ x: R(0, 1), y: R(0, 1), s: R(2, 6), phase: R(0, TAU), spin: R(0.3, 1.2) }));
      d.shooting = { next: R(2, 6) };
    } else if (type === 'meadow') {
      d.clouds = Array.from({ length: 6 }, () => ({ x: R(0, 1), y: R(0.05, 0.32), s: R(0.6, 1.3), speed: R(0.004, 0.012) }));
      d.flowers = Array.from({ length: 46 }, () => ({ x: R(0, 1), y: R(0.7, 0.99), s: R(3, 6), c: ['#ff6b6b', '#ffd93d', '#ffffff', '#c77dff', '#ff9ff3'][Math.floor(R(0, 5))], phase: R(0, TAU) }));
      d.grass = Array.from({ length: 160 }, () => ({ x: R(0, 1), y: R(0.66, 1), h: R(5, 12), phase: R(0, TAU) }));
      d.trees = Array.from({ length: 3 }, () => ({ x: R(0.05, 0.95), s: R(0.8, 1.2) }));
      d.birds = Array.from({ length: 3 }, () => ({ y: R(0.1, 0.3), speed: R(0.02, 0.04), off: R(0, 1) }));
    } else if (type === 'snow') {
      d.flakes = Array.from({ length: 110 }, () => ({ x: R(0, 1), y: R(0, 1), s: R(1, 3.5), speed: R(0.02, 0.07), wob: R(0, TAU) }));
      d.stars = Array.from({ length: 70 }, () => ({ x: R(0, 1), y: R(0, 0.5), s: R(0.5, 1.6), phase: R(0, TAU) }));
      d.pines = Array.from({ length: 9 }, () => ({ x: R(0, 1), y: R(0.6, 0.7), s: R(0.6, 1.2) }));
      d.pines.sort((a, b) => a.y - b.y);
    }
    return d;
  }

  /* ---------------- renderers ---------------- */

  function ocean(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7fd3f7'); g.addColorStop(0.35, '#3b9ad9'); g.addColorStop(0.75, '#1c64b8'); g.addColorStop(1, '#0f2f6e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // light rays
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = (w / 7) * (i + 1) + Math.sin(t * 0.4 + i) * 25;
      const rw = 40 + Math.sin(t * 0.6 + i * 2) * 14;
      const rg = ctx.createLinearGradient(0, 0, 0, h * 0.9);
      rg.addColorStop(0, 'rgba(255,255,255,0.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(x - rw * 0.3, 0); ctx.lineTo(x + rw * 0.3, 0);
      ctx.lineTo(x + rw * 1.4, h * 0.9); ctx.lineTo(x - rw * 1.4, h * 0.9);
      ctx.fill();
    }
    ctx.restore();

    // distant fish silhouettes
    ctx.fillStyle = 'rgba(10,40,90,0.25)';
    d.fishShadows.forEach((f) => {
      const x = ((f.off + t * f.speed) % 1.2 - 0.1) * w;
      const y = f.y * h + Math.sin(t + f.off * 9) * 6;
      ctx.beginPath(); ctx.ellipse(x, y, f.s * 1.6, f.s * 0.7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - f.s * 1.4, y); ctx.lineTo(x - f.s * 2.4, y - f.s * 0.7); ctx.lineTo(x - f.s * 2.4, y + f.s * 0.7); ctx.fill();
    });

    // sand floor
    const floor = h - Math.max(26, h * 0.07);
    const sg = ctx.createLinearGradient(0, floor - 10, 0, h);
    sg.addColorStop(0, '#f2cf8d'); sg.addColorStop(1, '#d9a35b');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, floor + Math.sin(x * 0.02) * 5);
    ctx.lineTo(w, h); ctx.fill();

    d.rocks.forEach((rk) => {
      ctx.fillStyle = '#6b7a8f';
      ctx.beginPath(); ctx.ellipse(rk.x * w, floor + 6, rk.w * 0.5, rk.h * 0.6, 0, Math.PI, TAU); ctx.fill();
    });

    // seaweed
    ctx.lineCap = 'round';
    d.seaweed.forEach((s) => {
      const segs = 9, sh = s.h * h, bx = s.x * w;
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.thick;
      ctx.beginPath(); ctx.moveTo(bx, floor + 8);
      const pts = [];
      for (let j = 1; j <= segs; j++) {
        const k = j / segs;
        const px = bx + Math.sin(t * s.speed + s.phase + j * 0.5) * 14 * k;
        const py = floor + 8 - k * sh;
        pts.push([px, py]);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      for (let j = 1; j < pts.length - 1; j += 2) {
        const [px, py] = pts[j];
        ctx.beginPath(); ctx.ellipse(px + 7, py, 4, 10, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px - 7, py, 4, 10, -0.5, 0, TAU); ctx.fill();
      }
    });

    // coral
    d.coral.forEach((c, i) => {
      const x = c.x * w, y = floor + 4;
      ctx.strokeStyle = c.color; ctx.fillStyle = c.color; ctx.lineWidth = c.s * 0.28;
      for (let b = -2; b <= 2; b++) {
        const a = -Math.PI / 2 + b * 0.38 + Math.sin(t * 0.5 + i + b) * 0.04;
        const len = c.s * (1.2 - Math.abs(b) * 0.18);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * len, y + Math.sin(a) * len, c.s * 0.18, 0, TAU); ctx.fill();
      }
    });

    // bubbles rising
    d.bubbles.forEach((b) => {
      const y = ((1 - ((b.y + t * b.speed) % 1)) * 1.05) * h;
      const x = b.x * w + Math.sin(t * 2 + b.wob) * 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.2;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(x, y, b.s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(x - b.s * 0.35, y - b.s * 0.35, b.s * 0.25, 0, TAU); ctx.fill();
    });
  }

  function forest(ctx, w, h, t, d) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, '#7ed957'); g.addColorStop(0.6, '#4caf50'); g.addColorStop(1, '#2e7d32');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(200,255,170,0.45)';
    d.grass.forEach((gr) => {
      const sway = Math.sin(t * 1.2 + gr.x * 30) * 1.2;
      ctx.fillRect(gr.x * w + sway, gr.y * h, 1.6, gr.h);
    });

    // dirt path
    ctx.strokeStyle = 'rgba(160,110,60,0.35)'; ctx.lineWidth = Math.max(14, w * 0.025); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, h * 0.78);
    ctx.bezierCurveTo(w * 0.3, h * 0.55, w * 0.55, h * 0.95, w, h * 0.35); ctx.stroke();

    // pond
    const p = d.pond;
    ctx.fillStyle = '#3d8fd1';
    ctx.beginPath(); ctx.ellipse(p.x * w, p.y * h, p.rx * w, p.ry * w, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    const rp = (t * 0.6) % 1;
    ctx.beginPath(); ctx.ellipse(p.x * w, p.y * h, p.rx * w * rp, p.ry * w * rp, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#5cb85c';
    ctx.beginPath(); ctx.arc(p.x * w + p.rx * w * 0.4, p.y * h - p.ry * w * 0.2, 7, 0.3, TAU - 0.3); ctx.fill();

    d.flowers.forEach((f) => {
      ctx.fillStyle = f.c;
      const x = f.x * w, y = f.y * h;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.256) * 3, y + Math.sin(k * 1.256) * 3, 2.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    });

    d.mushrooms.forEach((m) => {
      const x = m.x * w, y = m.y * h;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.arc(x + 2, y + 2, m.s, 0, TAU); ctx.fill();
      ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(x, y, m.s, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 2.1) * m.s * 0.5, y + Math.sin(k * 2.1) * m.s * 0.5, m.s * 0.18, 0, TAU); ctx.fill(); }
    });

    // sunlight patches
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = (w / 7) * (i + 1) + Math.sin(t * 0.3 + i) * 30;
      const y = h * (0.25 + (i % 3) * 0.25) + Math.cos(t * 0.25 + i) * 20;
      const s = 50 + Math.sin(t * 0.4 + i) * 15;
      const lg = ctx.createRadialGradient(x, y, 0, x, y, s);
      lg.addColorStop(0, 'rgba(255,255,200,0.16)'); lg.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
    ctx.restore();

    d.leaves.forEach((l) => {
      const x = ((l.x + t * 0.01) % 1) * w + Math.sin(t + l.phase) * 10;
      const y = ((l.y + t * 0.015) % 1) * h;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.5 + l.phase));
      ctx.fillStyle = l.c; ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.restore();
    });

    // canopy trees (top-down)
    d.trees.forEach((tr) => {
      const sx = Math.sin(t * tr.speed + tr.phase) * 2.5;
      const x = tr.x * w, y = tr.y * h, s = tr.s * Math.min(1.2, Math.max(0.7, w / 900));
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(x + 6, y + 6, s, 0, TAU); ctx.fill();
      ctx.fillStyle = tr.color; ctx.beginPath(); ctx.arc(x + sx, y, s, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.beginPath(); ctx.arc(x + sx - s * 0.25, y - s * 0.25, s * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.arc(x + sx + s * 0.3, y + s * 0.3, s * 0.4, 0, TAU); ctx.fill();
    });
  }

  function space(ctx, w, h, t, d) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#24104a'); g.addColorStop(0.55, '#100626'); g.addColorStop(1, '#03010a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    d.nebula.forEach((n) => {
      const x = n.x * w + Math.sin(t * 0.1 + n.phase) * 30, y = n.y * h + Math.cos(t * 0.1 + n.phase) * 20;
      const s = n.s * Math.max(w, h);
      const ng = ctx.createRadialGradient(x, y, 0, x, y, s);
      ng.addColorStop(0, `rgba(${n.c},0.28)`); ng.addColorStop(1, `rgba(${n.c},0)`);
      ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    });

    d.stars.forEach((s) => {
      const a = s.b * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s, 0, TAU); ctx.fill();
      if (s.s > 1.6) {
        ctx.fillStyle = `rgba(255,255,255,${a * 0.2})`;
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s * 3, 0, TAU); ctx.fill();
      }
    });

    // shooting star
    const cycle = 7, ph = (t % cycle) / cycle;
    if (ph < 0.12) {
      const k = ph / 0.12;
      const sx = w * (0.2 + 0.5 * ((Math.floor(t / cycle) * 0.37) % 1)), sy = h * 0.1;
      const x = sx + k * w * 0.35, y = sy + k * h * 0.25;
      const sg = ctx.createLinearGradient(x, y, x - 90, y - 60);
      sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = sg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 90, y - 60); ctx.stroke();
    }

    d.planets.forEach((p) => {
      const x = p.x * w + Math.cos(t * 0.15 + p.phase) * 12, y = p.y * h + Math.sin(t * 0.15 + p.phase) * 12;
      const pg = ctx.createRadialGradient(x - p.s * 0.4, y - p.s * 0.4, p.s * 0.1, x, y, p.s);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.15, p.c); pg.addColorStop(1, 'rgba(0,0,0,0.85)');
      if (p.ring) {
        ctx.strokeStyle = 'rgba(255,215,120,0.55)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, p.s * 1.7, p.s * 0.38, -0.3, Math.PI, TAU); ctx.stroke();
      }
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
      if (p.ring) {
        ctx.strokeStyle = 'rgba(255,215,120,0.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y, p.s * 1.7, p.s * 0.38, -0.3, 0, Math.PI); ctx.stroke();
      }
    });

    ctx.fillStyle = '#8d7b68';
    d.asteroids.forEach((a) => {
      const x = a.x * w + Math.sin(t * 0.2 + a.phase) * 25, y = a.y * h + Math.cos(t * 0.2 + a.phase) * 15;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * a.spin);
      ctx.beginPath();
      for (let j = 0; j < 7; j++) {
        const ang = (j / 7) * TAU, rr = a.s * (0.75 + Math.sin(j * 2.3) * 0.25);
        j ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }

  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 22 * s, 0, TAU);
    ctx.arc(x + 25 * s, y - 10 * s, 26 * s, 0, TAU);
    ctx.arc(x + 52 * s, y, 20 * s, 0, TAU);
    ctx.arc(x + 26 * s, y + 8 * s, 22 * s, 0, TAU);
    ctx.fill();
  }

  function meadow(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    g.addColorStop(0, '#5ec2ff'); g.addColorStop(1, '#c9ecff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // sun
    const sx = w * 0.84, sy = h * 0.16, sr = Math.min(w, h) * 0.07;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.15);
    ctx.fillStyle = 'rgba(255,220,90,0.35)';
    for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillRect(sr * 1.15, -3, sr * 0.5, 6); }
    ctx.restore();
    ctx.fillStyle = '#ffd93d'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    d.clouds.forEach((c) => cloud(ctx, ((c.x + t * c.speed) % 1.3 - 0.15) * w, c.y * h, c.s));

    ctx.strokeStyle = '#334'; ctx.lineWidth = 2;
    d.birds.forEach((b) => {
      const x = ((b.off + t * b.speed) % 1.2 - 0.1) * w, y = b.y * h + Math.sin(t * 2 + b.off * 10) * 5;
      const flap = Math.sin(t * 8 + b.off * 20) * 4;
      ctx.beginPath(); ctx.moveTo(x - 9, y - flap); ctx.quadraticCurveTo(x - 4, y - 5, x, y); ctx.quadraticCurveTo(x + 4, y - 5, x + 9, y - flap); ctx.stroke();
    });

    // hills
    ctx.fillStyle = '#9ad07a';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h * 0.58 + Math.sin(x / w * 5 + 1) * h * 0.04);
    ctx.lineTo(w, h); ctx.fill();

    d.trees.forEach((tr) => {
      const x = tr.x * w, y = h * 0.6, s = tr.s * Math.min(w, h) * 0.06;
      ctx.fillStyle = '#8d5a3b'; ctx.fillRect(x - s * 0.15, y - s * 1.1, s * 0.3, s * 1.2);
      ctx.fillStyle = '#3f9e45';
      ctx.beginPath(); ctx.arc(x, y - s * 1.5, s * 0.8, 0, TAU); ctx.arc(x - s * 0.5, y - s * 1.1, s * 0.55, 0, TAU); ctx.arc(x + s * 0.5, y - s * 1.1, s * 0.55, 0, TAU); ctx.fill();
    });

    const gg = ctx.createLinearGradient(0, h * 0.64, 0, h);
    gg.addColorStop(0, '#6cc04a'); gg.addColorStop(1, '#3f8f2b');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h * 0.66 + Math.sin(x / w * 3) * h * 0.02);
    ctx.lineTo(w, h); ctx.fill();

    ctx.strokeStyle = '#2f7a20'; ctx.lineWidth = 1.5;
    d.grass.forEach((gr) => {
      const x = gr.x * w, y = gr.y * h, sw = Math.sin(t * 1.5 + gr.phase) * 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.5, y - gr.h * 0.5, x + sw, y - gr.h); ctx.stroke();
    });
    d.flowers.forEach((f) => {
      const x = f.x * w + Math.sin(t + f.phase) * 1.5, y = f.y * h;
      ctx.strokeStyle = '#2f7a20'; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = f.c;
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * 1.256) * f.s * 0.7, y + Math.sin(k * 1.256) * f.s * 0.7, f.s * 0.55, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(x, y, f.s * 0.4, 0, TAU); ctx.fill();
    });
  }

  function snow(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1d3f'); g.addColorStop(0.55, '#24477a'); g.addColorStop(1, '#5a7fb0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    d.stars.forEach((s) => {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 1.5 + s.phase)})`;
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s, 0, TAU); ctx.fill();
    });

    // aurora
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    [['80,255,170', 0.18, 0], ['120,160,255', 0.26, 2]].forEach(([c, yy, ph]) => {
      const ag = ctx.createLinearGradient(0, h * (yy - 0.1), 0, h * (yy + 0.14));
      ag.addColorStop(0, `rgba(${c},0)`); ag.addColorStop(0.5, `rgba(${c},0.28)`); ag.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.moveTo(0, h * (yy + 0.14));
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * yy + Math.sin(x / w * 6 + t * 0.4 + ph) * h * 0.05 - h * 0.08);
      for (let x = w; x >= 0; x -= 20) ctx.lineTo(x, h * (yy + 0.14) + Math.sin(x / w * 5 + t * 0.3 + ph) * h * 0.04);
      ctx.fill();
    });
    ctx.restore();

    // moon
    ctx.fillStyle = '#f5f3ce'; ctx.beginPath(); ctx.arc(w * 0.15, h * 0.15, Math.min(w, h) * 0.05, 0, TAU); ctx.fill();

    // back hills
    ctx.fillStyle = '#cfe0f5';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h * 0.6 + Math.sin(x / w * 4 + 2) * h * 0.05);
    ctx.lineTo(w, h); ctx.fill();

    d.pines.forEach((p) => {
      const x = p.x * w, y = p.y * h, s = p.s * Math.min(w, h) * 0.07;
      ctx.fillStyle = '#5b3b2a'; ctx.fillRect(x - s * 0.08, y - s * 0.2, s * 0.16, s * 0.3);
      for (let k = 0; k < 3; k++) {
        const ty = y - s * 0.2 - k * s * 0.42, tw = s * (0.55 - k * 0.13);
        ctx.fillStyle = '#1f5e46';
        ctx.beginPath(); ctx.moveTo(x - tw, ty); ctx.lineTo(x + tw, ty); ctx.lineTo(x, ty - s * 0.6); ctx.fill();
        ctx.fillStyle = '#f2f7ff';
        ctx.beginPath(); ctx.moveTo(x - tw * 0.35, ty - s * 0.42); ctx.lineTo(x + tw * 0.35, ty - s * 0.42); ctx.lineTo(x, ty - s * 0.6); ctx.fill();
      }
    });

    const sg = ctx.createLinearGradient(0, h * 0.65, 0, h);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#d6e6f7');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h * 0.68 + Math.sin(x / w * 3 + 1) * h * 0.02);
    ctx.lineTo(w, h); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    d.flakes.forEach((f) => {
      const y = ((f.y + t * f.speed) % 1) * h;
      const x = ((f.x + Math.sin(t * 0.8 + f.wob) * 0.01) % 1) * w;
      ctx.beginPath(); ctx.arc(x, y, f.s, 0, TAU); ctx.fill();
    });
  }

  function custom(ctx, w, h, t, d, scene) {
    const img = scene._bgImg;
    ctx.fillStyle = '#dfe7f1'; ctx.fillRect(0, 0, w, h);
    if (img && img.complete && img.naturalWidth) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
    }
  }

  const RENDER = { ocean, forest, space, meadow, snow, custom };

  DA.Env = {
    /** Prepare a scene for rendering (generates decorations, loads custom background). */
    prepare(scene) {
      if (!scene._decor) scene._decor = decor(scene.type, scene.seed || 1);
      if (scene.type === 'custom' && scene.bgImage && !scene._bgImg) {
        const img = new Image();
        img.src = scene.bgImage;
        scene._bgImg = img;
      }
    },
    render(ctx, scene, w, h, t) {
      DA.Env.prepare(scene);
      (RENDER[scene.type] || forest)(ctx, w, h, t, scene._decor, scene);
    },
    /** Shadow on the ground under walking creatures? */
    hasGroundShadow(motion) { return motion === 'walk' || motion === 'roam'; }
  };
})();
