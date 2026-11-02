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
    desert: { name: 'Desert', icon: '🌵', motion: 'walk',  desc: 'Sand dunes and cacti' },
    jungle: { name: 'Jungle', icon: '🌴', motion: 'walk',  desc: 'Vines, leaves and fireflies' },
    farm:   { name: 'Farm',   icon: '🚜', motion: 'walk',  desc: 'Barn, fence and hay bales' },
    sky:    { name: 'Sky',    icon: '☁️', motion: 'fly',   desc: 'Everyone flies in the clouds', bounds: { minX: 0.06, maxX: 0.94, minY: 0.1, maxY: 0.88 } },
    city:   { name: 'City',   icon: '🏙️', motion: 'walk',  desc: 'Night city with lights', bounds: { minX: 0.05, maxX: 0.95, minY: 0.76, maxY: 0.93 } },
    candy:  { name: 'Candy Land', icon: '🍭', motion: 'walk', desc: 'Lollipops and gumdrops' },
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
  const GROUND = { walk: 1, hop: 1, bounce: 1, slither: 1, dash: 1 };
  /** Movement area for a creature's motion inside an environment.
   *  sceneMotion is the environment's own movement (custom photo scenes choose theirs). */
  DA.motionBounds = function (motion, type, sceneMotion) {
    const env = DA.ENVIRONMENTS[type] || {};
    const sm = sceneMotion || env.motion || 'roam';
    if (GROUND[motion]) {
      if (GROUND[sm]) return env.bounds || BOUNDS.walk;
      if (sm === 'roam') return BOUNDS.roam;
      return { minX: 0.05, maxX: 0.95, minY: 0.8, maxY: 0.9 }; // along the floor of sea / sky / space
    }
    if (env.bounds && sm === motion) return env.bounds;
    return BOUNDS[motion] || BOUNDS.roam;
  };

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
    } else if (type === 'desert') {
      d.dunes = [0, 1, 2].map((i) => ({ off: R(0, 6), amp: R(0.02, 0.05), y: 0.5 + i * 0.07 }));
      d.cacti = Array.from({ length: 5 }, (_, i) => ({ x: (i + R(0.1, 0.9)) / 5, s: R(0.7, 1.2), arms: r() > 0.3 }));
      d.rocks = Array.from({ length: 6 }, () => ({ x: R(0, 1), y: R(0.7, 0.98), s: R(4, 10) }));
      d.weeds = Array.from({ length: 2 }, () => ({ off: R(0, 1), y: R(0.75, 0.9), s: R(12, 18), speed: R(0.03, 0.06) }));
      d.birds = Array.from({ length: 2 }, () => ({ y: R(0.1, 0.25), speed: R(0.015, 0.03), off: R(0, 1) }));
    } else if (type === 'jungle') {
      d.trunks = Array.from({ length: 5 }, () => ({ x: R(0, 1), w: R(18, 34) }));
      d.vines = Array.from({ length: 9 }, () => ({ x: R(0, 1), len: R(0.2, 0.55), phase: R(0, TAU) }));
      d.leaves = Array.from({ length: 26 }, () => ({ x: R(0, 1), y: R(0, 0.3), s: R(30, 70), a: R(0, TAU), c: ['#1e7a3c', '#2c9a4b', '#14612f', '#3fb35d'][Math.floor(R(0, 4))] }));
      d.ferns = Array.from({ length: 14 }, () => ({ x: R(0, 1), s: R(26, 50), c: ['#2f9e44', '#37b24d', '#2b8a3e'][Math.floor(R(0, 3))], phase: R(0, TAU) }));
      d.flies = Array.from({ length: 22 }, () => ({ x: R(0, 1), y: R(0.2, 0.9), phase: R(0, TAU), speed: R(0.5, 1.4) }));
      d.flowers = Array.from({ length: 8 }, () => ({ x: R(0, 1), y: R(0.72, 0.95), c: ['#ff6b6b', '#ff922b', '#f783ac', '#ffd43b'][Math.floor(R(0, 4))] }));
    } else if (type === 'farm') {
      d.clouds = Array.from({ length: 5 }, () => ({ x: R(0, 1), y: R(0.05, 0.25), s: R(0.6, 1.1), speed: R(0.004, 0.01) }));
      d.bales = Array.from({ length: 3 }, () => ({ x: R(0.45, 0.95), s: R(0.8, 1.1) }));
      d.grass = Array.from({ length: 120 }, () => ({ x: R(0, 1), y: R(0.66, 1), h: R(4, 9), phase: R(0, TAU) }));
      d.flowers = Array.from({ length: 20 }, () => ({ x: R(0, 1), y: R(0.7, 0.98), c: ['#ffffff', '#ffd43b', '#ff8787'][Math.floor(R(0, 3))] }));
      d.barnX = R(0.06, 0.2);
    } else if (type === 'sky') {
      d.clouds = Array.from({ length: 12 }, (_, i) => ({ x: R(0, 1), y: R(0.05, 0.95), s: R(0.6, 1.6), speed: R(0.006, 0.02) * (i % 2 ? 1 : 0.6), a: R(0.7, 1) }));
      d.balloon = { x: R(0.1, 0.9), y: R(0.2, 0.6), c: ['#ff6b6b', '#4dabf7', '#ffd43b', '#9775fa'][Math.floor(R(0, 4))], phase: R(0, TAU) };
      d.birds = Array.from({ length: 4 }, () => ({ y: R(0.1, 0.8), speed: R(0.02, 0.04), off: R(0, 1) }));
    } else if (type === 'city') {
      d.stars = Array.from({ length: 60 }, () => ({ x: R(0, 1), y: R(0, 0.4), s: R(0.5, 1.6), phase: R(0, TAU) }));
      d.far = []; d.near = [];
      for (let x = -0.02; x < 1.02;) { const w = R(0.05, 0.09); d.far.push({ x, w, h: R(0.2, 0.42) }); x += w + R(0, 0.01); }
      for (let x = -0.02; x < 1.02;) { const w = R(0.08, 0.14); d.near.push({ x, w, h: R(0.18, 0.45), c: ['#2b2f55', '#33386a', '#262a4d', '#3a2f5c'][Math.floor(R(0, 4))], seed: Math.floor(R(1, 1e6)) }); x += w + R(0.005, 0.02); }
      d.cars = Array.from({ length: 3 }, (_, i) => ({ off: R(0, 1), speed: R(0.05, 0.1) * (i % 2 ? -1 : 1), c: ['#ff6b6b', '#ffd43b', '#4dabf7', '#ffffff'][Math.floor(R(0, 4))] }));
      d.lamps = Array.from({ length: 5 }, (_, i) => ({ x: (i + 0.5) / 5 }));
    } else if (type === 'candy') {
      d.clouds = Array.from({ length: 6 }, () => ({ x: R(0, 1), y: R(0.05, 0.35), s: R(0.6, 1.2), speed: R(0.004, 0.012), c: ['#ffd6f0', '#e3d5ff', '#fff0f6'][Math.floor(R(0, 3))] }));
      d.lollis = Array.from({ length: 5 }, (_, i) => ({ x: (i + R(0.1, 0.9)) / 5, h: R(0.14, 0.26), s: R(18, 30), c1: ['#ff6b9d', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc'][i % 5] }));
      d.drops = Array.from({ length: 12 }, () => ({ x: R(0, 1), y: R(0.72, 0.98), s: R(8, 16), c: ['#ff6b9d', '#69db7c', '#ffd43b', '#4dabf7', '#b197fc', '#ff922b'][Math.floor(R(0, 6))] }));
      d.sprinkles = Array.from({ length: 70 }, () => ({ x: R(0, 1), y: R(0, 1), a: R(0, TAU), speed: R(0.02, 0.05), c: ['#ff6b9d', '#69db7c', '#ffd43b', '#4dabf7', '#ffffff'][Math.floor(R(0, 5))] }));
      d.canes = Array.from({ length: 2 }, () => ({ x: R(0.05, 0.95), s: R(0.8, 1.1) }));
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


  function hillPath(ctx, w, h, base, amp, freq, off) {
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, h * base + Math.sin(x / w * freq + off) * h * amp);
    ctx.lineTo(w, h); ctx.closePath();
  }

  function desert(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    g.addColorStop(0, '#ffcf8a'); g.addColorStop(1, '#ffe9c4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sr = Math.min(w, h) * 0.09;
    ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.22, sr * 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(w * 0.78, h * 0.22, sr, 0, TAU); ctx.fill();
    // mesas
    ctx.fillStyle = '#e8a46b';
    ctx.beginPath(); ctx.moveTo(w * 0.05, h * 0.56); ctx.lineTo(w * 0.09, h * 0.4); ctx.lineTo(w * 0.25, h * 0.4); ctx.lineTo(w * 0.3, h * 0.56); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.6, h * 0.56); ctx.lineTo(w * 0.63, h * 0.45); ctx.lineTo(w * 0.72, h * 0.45); ctx.lineTo(w * 0.76, h * 0.56); ctx.fill();
    ctx.strokeStyle = '#4a3b30'; ctx.lineWidth = 2;
    d.birds.forEach((b) => {
      const x = ((b.off + t * b.speed) % 1.2 - 0.1) * w, y = b.y * h, f = Math.sin(t * 6 + b.off * 9) * 4;
      ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 4, y - 5, x, y); ctx.quadraticCurveTo(x + 4, y - 5, x + 9, y - f); ctx.stroke();
    });
    ['#f6c58a', '#f0b673', '#e9a75f'].forEach((c, i) => { ctx.fillStyle = c; const dn = d.dunes[i]; hillPath(ctx, w, h, dn.y + 0.04 * i, dn.amp, 4 + i, dn.off); ctx.fill(); });
    d.cacti.forEach((c) => {
      const x = c.x * w, base = h * 0.74, s = c.s * Math.min(w, h) * 0.12;
      ctx.fillStyle = '#3f9d4f'; ctx.strokeStyle = '#2f7a3b'; ctx.lineWidth = 2;
      const rr = (X, Y, W2, H2) => { ctx.beginPath(); ctx.moveTo(X + W2 / 2, Y); ctx.arcTo(X + W2, Y, X + W2, Y + H2, W2 / 2); ctx.lineTo(X + W2, Y + H2); ctx.lineTo(X, Y + H2); ctx.arcTo(X, Y, X + W2, Y, W2 / 2); ctx.fill(); ctx.stroke(); };
      rr(x - s * 0.13, base - s, s * 0.26, s);
      if (c.arms) { rr(x - s * 0.45, base - s * 0.75, s * 0.18, s * 0.38); ctx.fillRect(x - s * 0.36, base - s * 0.44, s * 0.3, s * 0.13); rr(x + s * 0.28, base - s * 0.85, s * 0.18, s * 0.45); ctx.fillRect(x + s * 0.08, base - s * 0.5, s * 0.3, s * 0.13); }
    });
    ctx.fillStyle = '#c98b52';
    d.rocks.forEach((r) => { ctx.beginPath(); ctx.ellipse(r.x * w, r.y * h, r.s * 1.4, r.s, 0, Math.PI, TAU); ctx.fill(); });
    ctx.strokeStyle = '#9c6b3c'; ctx.lineWidth = 1.5;
    d.weeds.forEach((wd) => {
      const x = ((wd.off + t * wd.speed) % 1.2 - 0.1) * w, y = wd.y * h - Math.abs(Math.sin(t * 3 + wd.off * 7)) * 14;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3);
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(0, 0, wd.s, wd.s * 0.6, k, 0, TAU); ctx.stroke(); }
      ctx.restore();
    });
  }

  function jungle(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0f4d2a'); g.addColorStop(0.6, '#1c7a3e'); g.addColorStop(1, '#2b6b2f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = w * (0.15 + i * 0.25) + Math.sin(t * 0.3 + i) * 20;
      const rg = ctx.createLinearGradient(0, 0, 0, h);
      rg.addColorStop(0, 'rgba(255,255,190,0.16)'); rg.addColorStop(1, 'rgba(255,255,190,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 90, h); ctx.lineTo(x - 50, h); ctx.fill();
    }
    ctx.restore();
    d.trunks.forEach((tr) => {
      ctx.fillStyle = '#5a3d2b'; ctx.fillRect(tr.x * w - tr.w / 2, 0, tr.w, h * 0.75);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(tr.x * w, 0, tr.w / 2, h * 0.75);
    });
    // ground
    ctx.fillStyle = '#3d7a2a'; hillPath(ctx, w, h, 0.7, 0.015, 7, 1); ctx.fill();
    ctx.fillStyle = '#4c8f32'; hillPath(ctx, w, h, 0.8, 0.01, 9, 2); ctx.fill();
    d.flowers.forEach((f) => { ctx.fillStyle = f.c; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(f.x * w + Math.cos(k * 1.256) * 5, f.y * h + Math.sin(k * 1.256) * 5, 3.5, 0, TAU); ctx.fill(); } });
    // ferns
    d.ferns.forEach((f) => {
      const x = f.x * w, y = h * 0.74 + (f.x * 50) % 20;
      ctx.fillStyle = f.c;
      for (let k = -2; k <= 2; k++) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(k * 0.45 + Math.sin(t + f.phase) * 0.05);
        ctx.beginPath(); ctx.ellipse(0, -f.s * 0.5, f.s * 0.14, f.s * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    });
    // canopy
    d.leaves.forEach((l) => {
      ctx.fillStyle = l.c;
      ctx.save(); ctx.translate(l.x * w, l.y * h); ctx.rotate(l.a + Math.sin(t * 0.5 + l.a) * 0.05);
      ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * 0.38, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-l.s, 0); ctx.lineTo(l.s, 0); ctx.stroke();
      ctx.restore();
    });
    // vines
    ctx.lineWidth = 3; ctx.strokeStyle = '#2e6b2a';
    d.vines.forEach((v) => {
      const x = v.x * w, len = v.len * h, sw = Math.sin(t * 0.8 + v.phase) * 10;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + sw, len * 0.5, x + sw * 0.6, len); ctx.stroke();
      ctx.fillStyle = '#40a040';
      for (let k = 1; k < 5; k++) { const u = k / 5; ctx.beginPath(); ctx.ellipse(x + sw * u * 0.9 + (k % 2 ? 6 : -6), len * u, 6, 3, k % 2 ? 0.6 : -0.6, 0, TAU); ctx.fill(); }
    });
    // fireflies
    d.flies.forEach((f) => {
      const x = f.x * w + Math.sin(t * f.speed + f.phase) * 20, y = f.y * h + Math.cos(t * f.speed * 0.8 + f.phase) * 14;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + f.phase));
      ctx.fillStyle = `rgba(255,250,160,${a * 0.25})`; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,250,170,${a})`; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    });
  }

  function farm(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    g.addColorStop(0, '#74c7ff'); g.addColorStop(1, '#d4f0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(w * 0.88, h * 0.14, Math.min(w, h) * 0.06, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    d.clouds.forEach((c) => cloud(ctx, ((c.x + t * c.speed) % 1.3 - 0.15) * w, c.y * h, c.s));
    ctx.fillStyle = '#a5d66f'; hillPath(ctx, w, h, 0.56, 0.035, 4, 0.5); ctx.fill();
    // field stripes
    ctx.fillStyle = '#e0c45c'; hillPath(ctx, w, h, 0.6, 0.02, 3, 2); ctx.fill();
    // barn
    const bx = d.barnX * w, s = Math.min(w, h) * 0.22, by = h * 0.64;
    ctx.fillStyle = '#d6453d'; ctx.fillRect(bx, by - s * 0.8, s, s * 0.8);
    ctx.fillStyle = '#a8322c'; ctx.beginPath(); ctx.moveTo(bx - s * 0.08, by - s * 0.8); ctx.lineTo(bx + s / 2, by - s * 1.25); ctx.lineTo(bx + s * 1.08, by - s * 0.8); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, s * 0.03);
    ctx.strokeRect(bx + s * 0.32, by - s * 0.45, s * 0.36, s * 0.45);
    ctx.beginPath(); ctx.moveTo(bx + s * 0.32, by - s * 0.45); ctx.lineTo(bx + s * 0.68, by); ctx.moveTo(bx + s * 0.68, by - s * 0.45); ctx.lineTo(bx + s * 0.32, by); ctx.stroke();
    ctx.strokeRect(bx + s * 0.4, by - s * 0.72, s * 0.2, s * 0.14);
    // ground
    const gg = ctx.createLinearGradient(0, h * 0.64, 0, h);
    gg.addColorStop(0, '#7cc95a'); gg.addColorStop(1, '#4e9a36');
    ctx.fillStyle = gg; hillPath(ctx, w, h, 0.66, 0.01, 3, 0); ctx.fill();
    // fence
    ctx.fillStyle = '#fff4e0'; ctx.strokeStyle = '#c9a77c'; ctx.lineWidth = 1.5;
    const fy = h * 0.66;
    ctx.fillRect(0, fy - 22, w, 5); ctx.fillRect(0, fy - 12, w, 5);
    for (let x = 6; x < w; x += 34) { ctx.fillRect(x, fy - 30, 7, 30); ctx.strokeRect(x, fy - 30, 7, 30); }
    // hay bales
    d.bales.forEach((b) => {
      const x = b.x * w, s2 = Math.min(w, h) * 0.06 * b.s, y = h * 0.7;
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.ellipse(x, y, s2 * 1.2, s2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c99a2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x + s2 * 0.6, y, s2 * 0.45, s2 * 0.85, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + s2 * 0.6, y, s2 * 0.2, s2 * 0.4, 0, 0, TAU); ctx.stroke();
    });
    ctx.strokeStyle = '#3c8a26'; ctx.lineWidth = 1.5;
    d.grass.forEach((gr) => { const x = gr.x * w, y = gr.y * h, sw = Math.sin(t * 1.5 + gr.phase) * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sw, y - gr.h); ctx.stroke(); });
    d.flowers.forEach((f) => { ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x * w, f.y * h, 3, 0, TAU); ctx.fill(); });
  }

  function sky(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4fb3ff'); g.addColorStop(0.7, '#a9dcff'); g.addColorStop(1, '#ffe3f1');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // rainbow
    const cx = w * 0.25, cy = h * 1.05, R0 = Math.max(w, h) * 0.55;
    ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'].forEach((c, i) => {
      ctx.strokeStyle = c; ctx.globalAlpha = 0.35; ctx.lineWidth = R0 * 0.035;
      ctx.beginPath(); ctx.arc(cx, cy, R0 - i * R0 * 0.035, Math.PI, TAU); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff2a8'; ctx.beginPath(); ctx.arc(w * 0.85, h * 0.15, Math.min(w, h) * 0.07, 0, TAU); ctx.fill();
    d.clouds.forEach((c, i) => {
      if (i === 6) balloon();
      ctx.fillStyle = `rgba(255,255,255,${c.a})`;
      cloud(ctx, ((c.x + t * c.speed) % 1.4 - 0.2) * w, c.y * h, c.s);
    });
    function balloon() {
      const b = d.balloon, x = b.x * w + Math.sin(t * 0.2 + b.phase) * 30, y = b.y * h + Math.sin(t * 0.5 + b.phase) * 12, s = Math.min(w, h) * 0.06;
      ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(x, y, s, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, y + s * 1.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, s * 0.35, s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - s * 0.5, y + s * 1.1); ctx.lineTo(x - s * 0.25, y + s * 1.75); ctx.moveTo(x + s * 0.5, y + s * 1.1); ctx.lineTo(x + s * 0.25, y + s * 1.75); ctx.stroke();
      ctx.fillStyle = '#a0703d'; ctx.fillRect(x - s * 0.3, y + s * 1.75, s * 0.6, s * 0.4);
    }
    ctx.strokeStyle = '#3a4a6b'; ctx.lineWidth = 2;
    d.birds.forEach((b) => {
      const x = ((b.off + t * b.speed) % 1.2 - 0.1) * w, y = b.y * h, f = Math.sin(t * 7 + b.off * 9) * 4;
      ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 4, y - 5, x, y); ctx.quadraticCurveTo(x + 4, y - 5, x + 9, y - f); ctx.stroke();
    });
  }

  function city(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d1033'); g.addColorStop(0.6, '#3a2c6b'); g.addColorStop(1, '#5c3d7a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    d.stars.forEach((s) => { ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 1.7 + s.phase)})`; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.s, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#fff6d5'; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.16, Math.min(w, h) * 0.06, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2c6b'; ctx.beginPath(); ctx.arc(w * 0.82 + Math.min(w, h) * 0.025, h * 0.16 - Math.min(w, h) * 0.015, Math.min(w, h) * 0.05, 0, TAU); ctx.fill();
    const ground = h * 0.72;
    ctx.fillStyle = '#1f1a45';
    d.far.forEach((b) => ctx.fillRect(b.x * w, ground - b.h * h, b.w * w + 1, b.h * h));
    d.near.forEach((b) => {
      const x = b.x * w, bw = b.w * w, bh = b.h * h * 0.9, y = ground - bh;
      ctx.fillStyle = b.c; ctx.fillRect(x, y, bw, bh);
      const r = DA.rng(b.seed), cw = Math.max(5, bw / 6), ch = Math.max(6, cw * 1.2);
      for (let wy = y + ch * 0.6; wy < ground - ch; wy += ch * 1.6) for (let wx = x + cw * 0.6; wx < x + bw - cw; wx += cw * 1.6) {
        const v = r(), on = v > 0.45 && (Math.sin(t * 0.3 + v * 50) > -0.85);
        ctx.fillStyle = on ? (v > 0.8 ? '#ffd8a8' : '#ffe9a0') : 'rgba(255,255,255,0.06)';
        ctx.fillRect(wx, wy, cw, ch);
      }
    });
    // pavement + road
    ctx.fillStyle = '#6c6f8f'; ctx.fillRect(0, ground, w, h * 0.22);
    ctx.fillStyle = '#585b78'; for (let x = 0; x < w; x += 40) ctx.fillRect(x, ground, 2, h * 0.22);
    ctx.fillStyle = '#2b2d3f'; ctx.fillRect(0, h * 0.94, w, h * 0.06);
    // lamps
    d.lamps.forEach((l) => {
      const x = l.x * w, top = ground - h * 0.16;
      const lg = ctx.createRadialGradient(x, top, 0, x, top, h * 0.18);
      lg.addColorStop(0, 'rgba(255,230,150,0.45)'); lg.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, top, h * 0.18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20223a'; ctx.fillRect(x - 2, top, 4, ground - top + h * 0.03);
      ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(x, top, 5, 0, TAU); ctx.fill();
    });
    d.cars.forEach((c) => {
      const u = ((c.off + t * c.speed) % 1.3 + 1.3) % 1.3 - 0.15;
      const x = u * w, y = h * 0.955, s = Math.min(w, h) * 0.03;
      ctx.fillStyle = c.c; ctx.fillRect(x - s * 2, y - s, s * 4, s); ctx.fillRect(x - s * 1.2, y - s * 1.7, s * 2.4, s * 0.8);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - s * 1.2, y, s * 0.45, 0, TAU); ctx.arc(x + s * 1.2, y, s * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,170,0.9)'; ctx.fillRect(c.speed > 0 ? x + s * 1.9 : x - s * 2.1, y - s * 0.8, s * 0.25, s * 0.35);
    });
  }

  function candy(ctx, w, h, t, d) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffb8de'); g.addColorStop(0.6, '#d9c2ff'); g.addColorStop(1, '#fff0f8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    d.clouds.forEach((c) => { ctx.fillStyle = c.c; cloud(ctx, ((c.x + t * c.speed) % 1.3 - 0.15) * w, c.y * h, c.s); });
    ctx.fillStyle = '#ffc9e5'; hillPath(ctx, w, h, 0.6, 0.04, 5, 1); ctx.fill();
    // lollipop trees
    d.lollis.forEach((l, i) => {
      const x = l.x * w, base = h * 0.66, top = base - l.h * h, s = l.s * Math.min(1.3, Math.max(0.7, w / 900));
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, top, 6, base - top);
      ctx.save(); ctx.translate(x, top); ctx.rotate(t * 0.4 * (i % 2 ? 1 : -1));
      ctx.fillStyle = l.c1; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = s * 0.18;
      ctx.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r2 = a / 12 * s * 0.85; ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } ctx.stroke();
      ctx.restore();
    });
    d.canes.forEach((c) => {
      const x = c.x * w, base = h * 0.7, s = Math.min(w, h) * 0.12 * c.s;
      ctx.lineCap = 'round'; ctx.lineWidth = s * 0.16;
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - s); ctx.arc(x + s * 0.22, base - s, s * 0.22, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = '#ff4d6d'; ctx.setLineDash([s * 0.1, s * 0.12]);
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - s); ctx.arc(x + s * 0.22, base - s, s * 0.22, Math.PI, 0); ctx.stroke();
      ctx.setLineDash([]);
    });
    const gg = ctx.createLinearGradient(0, h * 0.68, 0, h);
    gg.addColorStop(0, '#ff9ccf'); gg.addColorStop(1, '#f06aa9');
    ctx.fillStyle = gg; hillPath(ctx, w, h, 0.7, 0.015, 6, 0); ctx.fill();
    // chocolate drip edge
    ctx.fillStyle = '#7b4a2e';
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, h * 0.95 - Math.abs(Math.sin(x * 0.07)) * h * 0.02);
    ctx.lineTo(w, h); ctx.fill();
    d.drops.forEach((p) => {
      const x = p.x * w, y = p.y * h * 0.97;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, y, p.s, Math.PI, TAU); ctx.lineTo(x + p.s, y + p.s * 0.3); ctx.lineTo(x - p.s, y + p.s * 0.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x - p.s * 0.35, y - p.s * 0.45, p.s * 0.2, 0, TAU); ctx.fill();
    });
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    d.sprinkles.forEach((p) => {
      const y = ((p.y + t * p.speed) % 1) * h, x = p.x * w;
      ctx.strokeStyle = p.c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.a + t) * 5, y + Math.sin(p.a + t) * 5); ctx.stroke();
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

  const RENDER = { ocean, forest, space, meadow, snow, desert, jungle, farm, sky, city, candy, custom };

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
