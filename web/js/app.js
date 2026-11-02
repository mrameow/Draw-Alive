/* Draw Alive – application glue: scenes, dialogs, toolbar, persistence. */
(function () {
  'use strict';
  const DA = window.DA;
  const $ = (id) => document.getElementById(id);

  const PALETTE = ['#1f1d3a', '#ffffff', '#ff6b6b', '#ff922b', '#ffd43b', '#94d82d', '#38d9a9', '#4dabf7', '#5c7cfa',
    '#9775fa', '#f783ac', '#a0522d', '#e8590c', '#2f9e44', '#1971c2', '#868e96', '#ffc9c9', '#fff3bf'];

  let state = { version: 1, scenes: [], current: null };
  let saveTimer = null;

  /* ================= persistence ================= */
  function serialise() {
    return {
      version: 1,
      current: state.current,
      scenes: state.scenes.map((s) => ({
        id: s.id, name: s.name, type: s.type, seed: s.seed, bgImage: s.bgImage || null, motion: s.motion || null,
        creatures: s.creatures.map((c) => ({
          id: c.id, name: c.name, kind: c.kind || null, sprite: c.sprite, w: c.w, h: c.h,
          scale: c.scale, speed: c.speed, facing: c.facing, motion: c.motion, x: c.x, y: c.y
        }))
      }))
    };
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const ok = await DA.storage.set('state', serialise());
      if (!ok) DA.toast('Could not save – storage is full');
    }, 700);
  }
  async function load() {
    const saved = await DA.storage.get('state');
    if (saved && Array.isArray(saved.scenes) && saved.scenes.length) {
      state.scenes = saved.scenes.map((s) => Object.assign({ creatures: [] }, s, { creatures: (s.creatures || []).filter((c) => c && c.sprite) }));
      state.current = state.scenes.some((s) => s.id === saved.current) ? saved.current : state.scenes[0].id;
    } else {
      const s = newScene('ocean');
      state.scenes = [s];
      state.current = s.id;
    }
  }

  /* ================= scenes ================= */
  function newScene(type, extra) {
    const env = DA.ENVIRONMENTS[type];
    const same = state.scenes.filter((s) => s.type === type).length;
    return Object.assign({
      id: DA.uid(), type, seed: Math.floor(Math.random() * 1e9),
      name: env.name + (same ? ' ' + (same + 1) : ''), creatures: []
    }, extra || {});
  }
  const currentScene = () => state.scenes.find((s) => s.id === state.current) || state.scenes[0];

  function switchScene(id) {
    state.current = id;
    const s = currentScene();
    DA.World.setScene(s);
    renderTabs();
    updateEmpty();
    $('menuChangePhoto').style.display = s.type === 'custom' ? '' : 'none';
    scheduleSave();
  }

  function renderTabs() {
    const box = $('sceneTabs');
    box.innerHTML = '';
    state.scenes.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'tab' + (s.id === state.current ? ' active' : '');
      b.title = 'Double-click to rename';
      const env = DA.ENVIRONMENTS[s.type] || {};
      b.innerHTML = `<span>${env.icon || '🌍'}</span><span class="tab-name"></span><span class="count">${s.creatures.length}</span>`;
      b.querySelector('.tab-name').textContent = s.name;
      b.addEventListener('click', () => { if (s.id !== state.current) switchScene(s.id); });
      b.addEventListener('dblclick', () => renameScene(s));
      box.appendChild(b);
      if (s.id === state.current) setTimeout(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 0);
    });
  }

  async function renameScene(s) {
    const name = await DA.prompt('Rename environment', s.name);
    if (name) { s.name = name.slice(0, 28); renderTabs(); scheduleSave(); }
  }

  function addScene(s) {
    state.scenes.push(s);
    switchScene(s.id);
    DA.toast(`${DA.ENVIRONMENTS[s.type].icon} ${s.name} added – your other worlds are safe in the tabs above`, 3200);
  }

  function updateEmpty() {
    const s = currentScene();
    $('emptyState').classList.toggle('show', s.creatures.length === 0);
    $('emptyEmoji').textContent = (DA.ENVIRONMENTS[s.type] || {}).icon || '🌍';
  }

  /* environment picker */
  function buildEnvGrid() {
    const grid = $('envGrid');
    grid.innerHTML = '';
    Object.keys(DA.ENVIRONMENTS).forEach((type) => {
      const env = DA.ENVIRONMENTS[type];
      const card = document.createElement('button');
      card.className = 'env-card';
      if (type === 'custom') {
        card.innerHTML = `<div class="env-photo">🖼️</div>`;
      } else {
        const cv = DA.makeCanvas(320, 200);
        DA.Env.render(cv.getContext('2d'), { type, seed: 7, creatures: [] }, 320, 200, 3);
        card.appendChild(cv);
      }
      const info = document.createElement('div');
      info.className = 'env-info';
      info.innerHTML = `<b>${env.icon} ${env.name}</b><small>${env.desc}</small>`;
      card.appendChild(info);
      card.addEventListener('click', () => {
        if (type === 'custom') { pendingBg = 'new'; $('bgInput').click(); return; }
        DA.closeModal('sceneModal');
        addScene(newScene(type));
      });
      grid.appendChild(card);
    });
  }

  let pendingBg = null;
  async function onBgFile(file) {
    if (!file) return;
    try {
      const url = await DA.readFileAsDataURL(file);
      const img = await DA.loadImage(url);
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = DA.makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const data = cv.toDataURL('image/jpeg', 0.85);
      if (pendingBg === 'new') {
        DA.closeModal('sceneModal');
        addScene(newScene('custom', { bgImage: data, motion: $('customMotion').value }));
      } else {
        const sc = currentScene();
        sc.bgImage = data; sc._bgImg = null;
        DA.Env.prepare(sc);
        scheduleSave();
        DA.toast('Background updated');
      }
    } catch (e) {
      DA.toast('Sorry, that picture could not be opened');
    }
    pendingBg = null;
  }

  async function sceneAction(act) {
    const s = currentScene();
    if (act === 'rename') renameScene(s);
    else if (act === 'duplicate') {
      const copy = JSON.parse(JSON.stringify(serialise().scenes.find((x) => x.id === s.id)));
      copy.id = DA.uid(); copy.name = s.name + ' copy';
      copy.creatures.forEach((c) => { c.id = DA.uid(); });
      state.scenes.splice(state.scenes.indexOf(s) + 1, 0, copy);
      switchScene(copy.id);
      DA.toast('Scene duplicated');
    } else if (act === 'photo') { pendingBg = 'current'; $('bgInput').click(); }
    else if (act === 'party') { if (s.creatures.length) DA.World.celebrate(); else DA.toast('Add a creature first!'); }
    else if (act === 'clear') {
      if (!s.creatures.length) { DA.toast('There are no creatures here yet'); return; }
      if (await DA.confirm('Remove all creatures?', `All ${s.creatures.length} creatures in “${s.name}” will be removed.`, 'Remove all', true)) {
        const old = s.creatures.slice();
        s.creatures.length = 0;
        DA.World.select(null);
        onWorldChange();
        snack('Creatures removed', () => { s.creatures.push(...old); onWorldChange(); });
      }
    } else if (act === 'delete') {
      if (state.scenes.length === 1) { DA.toast('You need at least one environment'); return; }
      if (await DA.confirm('Delete this environment?', `“${s.name}” and its ${s.creatures.length} creature(s) will be deleted. Your other environments stay.`, 'Delete', true)) {
        const i = state.scenes.indexOf(s);
        state.scenes.splice(i, 1);
        switchScene(state.scenes[Math.max(0, i - 1)].id);
        snack(`“${s.name}” deleted`, () => { state.scenes.splice(i, 0, s); switchScene(s.id); });
      }
    }
  }

  /* ================= snackbar (undo) ================= */
  let snackTimer = null, snackFn = null;
  function snack(text, undoFn) {
    $('snackText').textContent = text;
    snackFn = undoFn;
    $('snackbar').classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => { $('snackbar').classList.remove('show'); snackFn = null; }, 5000);
  }

  /* ================= world events ================= */
  function onWorldChange() {
    updateEmpty();
    renderTabs();
    syncPanel();
    scheduleSave();
  }

  function syncPanel() {
    const c = DA.World.selected;
    const p = $('creaturePanel');
    if (!c) { p.classList.remove('open'); return; }
    p.classList.add('open');
    $('cpThumb').src = c.sprite;
    if (document.activeElement !== $('cpName')) $('cpName').value = c.name || '';
    $('cpSize').value = c.scale || 1;
    $('cpSpeed').value = c.speed == null ? 1 : c.speed;
    $('cpMotion').value = c.motion || 'auto';
    const auto = $('cpMotion').querySelector('option[value=auto]');
    auto.textContent = 'Auto (' + DA.MOTIONS[DA.World.motionOf(c)].label + ')';
    const mv = $('cpMoveTo');
    mv.innerHTML = '<option value="">— choose —</option>';
    state.scenes.forEach((s) => {
      if (s.id === state.current) return;
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = (DA.ENVIRONMENTS[s.type] || {}).icon + ' ' + s.name;
      mv.appendChild(o);
    });
    mv.disabled = state.scenes.length < 2;
  }

  function bindPanel() {
    const sel = () => DA.World.selected;
    $('cpClose').addEventListener('click', () => DA.World.select(null));
    $('cpName').addEventListener('input', (e) => { if (sel()) { sel().name = e.target.value; scheduleSave(); } });
    $('cpSize').addEventListener('input', (e) => { if (sel()) { sel().scale = +e.target.value; scheduleSave(); } });
    $('cpSpeed').addEventListener('input', (e) => { if (sel()) { sel().speed = +e.target.value; scheduleSave(); } });
    $('cpMotion').addEventListener('change', (e) => { if (sel()) { sel().motion = e.target.value; if (sel()._rt) sel()._rt.next = 0; syncPanel(); scheduleSave(); } });
    $('cpFlip').addEventListener('click', () => { const c = sel(); if (c) { c.facing = c.facing === 'right' ? 'left' : 'right'; scheduleSave(); } });
    $('cpCopy').addEventListener('click', () => { const c = sel(); if (c) DA.World.select(DA.World.duplicate(c)); });
    $('cpFront').addEventListener('click', () => { const c = sel(); if (c) DA.World.bringToFront(c); });
    $('cpSave').addEventListener('click', () => { const c = sel(); if (c) DA.saveDataURL(c.sprite, safeName(c.name || 'creature') + '.png'); });
    $('cpDelete').addEventListener('click', deleteSelected);
    $('cpMoveTo').addEventListener('change', (e) => {
      const c = sel(), target = state.scenes.find((s) => s.id === e.target.value);
      if (!c || !target) return;
      DA.World.remove(c);
      c._rt = null; c._new = true;
      target.creatures.push(c);
      onWorldChange();
      DA.toast(`${c.name || 'Creature'} moved to ${target.name}`);
    });
  }

  function deleteSelected() {
    const c = DA.World.selected;
    if (!c) return;
    const r = DA.World.remove(c);
    const scene = currentScene();
    snack(`${c.name || 'Creature'} removed`, () => {
      if (currentScene() !== scene) switchScene(scene.id);
      c._rt = null;
      DA.World.restore(r.c, r.i);
    });
  }

  const safeName = (s) => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'draw-alive';

  /* ================= creature creation ================= */
  let hintShown = false;
  function bringToLife(sprite, info) {
    const c = DA.World.addCreature(sprite, info);
    onWorldChange();
    const env = DA.ENVIRONMENTS[currentScene().type];
    DA.toast(`✨ ${c.name} is alive in ${currentScene().name}!`);
    if (!hintShown) {
      hintShown = true;
      const h = $('worldHint');
      h.classList.add('show');
      setTimeout(() => h.classList.remove('show'), 4500);
    }
    return env;
  }

  /* ================= drawing pad ================= */
  function setupPad() {
    DA.Pad.init();
    const pal = $('palette');
    PALETTE.forEach((col, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (col === '#ff6b6b' ? ' active' : '');
      b.style.background = col;
      b.title = col;
      b.setAttribute('aria-label', 'Colour ' + col);
      b.addEventListener('click', () => selectColor(col, b));
      pal.appendChild(b);
      if (i === 0) b.dataset.dark = '1';
    });
    function selectColor(col, btn) {
      DA.Pad.setColor(col);
      pal.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === btn));
      $('customColor').value = col.length === 7 ? col : '#000000';
      if (DA.Pad.state.tool === 'eraser') setTool('brush');
      updateSizeDot();
    }
    $('customColor').addEventListener('input', (e) => selectColor(e.target.value, null));

    function setTool(t) {
      DA.Pad.setTool(t);
      document.querySelectorAll('[data-tool]').forEach((b) => {
        const on = b.dataset.tool === t;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on);
      });
      updateSizeDot();
    }
    document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

    function updateSizeDot() {
      const d = $('sizeDot');
      d.style.setProperty('--d', Math.min(40, DA.Pad.state.size) + 'px');
      d.style.setProperty('--c', DA.Pad.state.tool === 'eraser' ? '#ffffff' : DA.Pad.state.color);
    }
    $('sizeRange').addEventListener('input', (e) => { DA.Pad.setSize(+e.target.value); updateSizeDot(); });
    updateSizeDot();

    $('stayInside').addEventListener('change', (e) => DA.Pad.setStayInside(e.target.checked));
    $('solidInside').addEventListener('change', (e) => DA.Pad.setSolidInside(e.target.checked));
    $('padUndo').addEventListener('click', () => DA.Pad.undo());
    $('padRedo').addEventListener('click', () => DA.Pad.redo());
    $('padClear').addEventListener('click', async () => {
      if (DA.Pad.hasTemplate()) {
        DA.Pad.clear(true);
        DA.toast('Colours cleared (Undo brings them back)');
      } else { DA.Pad.clear(false); }
    });
    $('padTemplatesBtn').addEventListener('click', () => DA.openModal('templatesModal'));
    $('padAnimate').addEventListener('click', () => {
      const res = DA.Pad.exportCreature();
      if (!res) { DA.toast('Draw something first! 🎨'); return; }
      const tpl = res.template ? DA.TEMPLATES.find((t) => t.id === res.template) : null;
      bringToLife(res.canvas, { name: res.name, kind: tpl ? tpl.cat : null });
      DA.Pad.reset();
      DA.closeModal('drawModal');
    });

    document.addEventListener('pad-template', (e) => {
      const t = e.detail;
      $('drawTitle').textContent = t ? `🖍️ Colour the ${t.name}` : '🎨 Draw a creature';
      $('stayInsideRow').style.display = t ? '' : 'none';
      $('solidInsideRow').style.display = t ? 'none' : '';
      $('padTip').innerHTML = t ? 'Tip: use <b>🪣 Fill</b> to colour a whole area in one tap.' : 'Draw your creature facing <b>left ←</b> so it walks the right way.';
      if (t) setTool(DA.Pad.state.tool);
    });
    document.dispatchEvent(new CustomEvent('pad-template', { detail: null }));
    $('drawModal').addEventListener('modal-open', () => requestAnimationFrame(() => DA.Pad.fit()));
  }

  /* ================= templates ================= */
  function setupTemplates() {
    const cats = $('tplCats'), grid = $('tplGrid');
    let cat = 'All';
    DA.TEMPLATE_CATS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip' + (c === cat ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => { cat = c; cats.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === b)); render(); });
      cats.appendChild(b);
    });
    function render() {
      grid.innerHTML = '';
      DA.TEMPLATES.filter((t) => cat === 'All' || t.cat === cat).forEach((t) => {
        const b = document.createElement('button');
        b.className = 'tpl-card';
        b.innerHTML = `<img src="${t.url}" alt="" loading="lazy"><span>${t.name}</span>`;
        b.addEventListener('click', async () => {
          DA.closeModal('templatesModal');
          DA.openModal('drawModal');
          await DA.Pad.setTemplate(t);
          if (DA.Pad.state.tool === 'eraser') document.querySelector('[data-tool=fill]').click();
        });
        grid.appendChild(b);
      });
    }
    render();
  }

  /* ================= photo cut-out ================= */
  const PH = { full: null, work: null, wctx: null, mask: null, hints: null, undo: [], mode: 'keep', drawing: false, last: null, file: null };

  function setupPhoto() {
    const view = $('phView'), hints = $('phHints');
    const hctx = hints.getContext('2d', { willReadFrequently: true });

    $('photoInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const img = await DA.loadImage(await DA.readFileAsDataURL(file));
        const fs = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
        PH.full = DA.makeCanvas(img.naturalWidth * fs, img.naturalHeight * fs);
        PH.full.getContext('2d').drawImage(img, 0, 0, PH.full.width, PH.full.height);
        const ws = Math.min(1, 300 / Math.max(PH.full.width, PH.full.height));
        PH.work = DA.makeCanvas(PH.full.width * ws, PH.full.height * ws);
        PH.wctx = PH.work.getContext('2d', { willReadFrequently: true });
        PH.wctx.drawImage(PH.full, 0, 0, PH.work.width, PH.work.height);
        view.width = PH.full.width; view.height = PH.full.height;
        hints.width = PH.work.width; hints.height = PH.work.height;
        hctx.clearRect(0, 0, hints.width, hints.height);
        PH.undo = [];
        PH.name = (file.name || 'Photo').replace(/\.[^.]+$/, '').slice(0, 20) || 'Photo';
        $('phStrength').value = 50; $('phOff').checked = false; $('phShowOrig').checked = false; $('phFillHoles').checked = true;
        DA.openModal('photoModal');
        requestAnimationFrame(() => { fitPhoto(); recompute(); });
      } catch (err) {
        DA.toast('Sorry, that picture could not be opened');
      }
    });

    function fitPhoto() {
      const area = $('phArea').getBoundingClientRect();
      if (!PH.full || !area.width) return;
      const s = Math.min((area.width - 16) / PH.full.width, (area.height - 16) / PH.full.height);
      $('phStage').style.width = PH.full.width * s + 'px';
      $('phStage').style.height = PH.full.height * s + 'px';
    }
    window.addEventListener('resize', fitPhoto);

    let busyTimer = null;
    function recompute() {
      if (!PH.work) return;
      $('phBusy').classList.add('show');
      clearTimeout(busyTimer);
      busyTimer = setTimeout(() => {
        try {
          const w = PH.work.width, h = PH.work.height;
          if ($('phOff').checked) {
            PH.mask = new Float32Array(w * h).fill(1);
          } else {
            const hd = hctx.getImageData(0, 0, w, h).data;
            const hint = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) if (hd[i * 4 + 3] > 40) hint[i] = hd[i * 4 + 1] > hd[i * 4] ? 1 : 2;
            PH.mask = DA.BgRemove.computeMask(PH.wctx.getImageData(0, 0, w, h), {
              strength: +$('phStrength').value, hints: hint, fillHoles: $('phFillHoles').checked
            });
          }
          PH.result = DA.BgRemove.applyMask(PH.full, PH.mask, w, h);
          drawView();
        } catch (err) {
          console.error(err);
          DA.toast('Something went wrong while cutting out the picture');
        }
        $('phBusy').classList.remove('show');
      }, 30);
    }
    function drawView() {
      const vctx = view.getContext('2d');
      vctx.clearRect(0, 0, view.width, view.height);
      if ($('phShowOrig').checked || !PH.result) vctx.drawImage(PH.full, 0, 0);
      else vctx.drawImage(PH.result, 0, 0);
    }

    ['phStrength', 'phFillHoles', 'phOff'].forEach((id) => $(id).addEventListener('change', recompute));
    $('phShowOrig').addEventListener('change', drawView);
    $('phReset').addEventListener('click', () => {
      PH.undo.push(hctx.getImageData(0, 0, hints.width, hints.height));
      hctx.clearRect(0, 0, hints.width, hints.height);
      $('phStrength').value = 50; $('phOff').checked = false; $('phFillHoles').checked = true;
      recompute();
    });
    $('phUndo').addEventListener('click', () => {
      if (!PH.undo.length) { DA.toast('Nothing to undo'); return; }
      hctx.putImageData(PH.undo.pop(), 0, 0);
      recompute();
    });
    document.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => {
      PH.mode = b.dataset.ph;
      document.querySelectorAll('[data-ph]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b); });
    }));

    const hp = (e) => {
      const r = hints.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (hints.width / r.width), y: (e.clientY - r.top) * (hints.height / r.height) };
    };
    hints.addEventListener('pointerdown', (e) => {
      if (!PH.work) return;
      e.preventDefault();
      try { hints.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      PH.undo.push(hctx.getImageData(0, 0, hints.width, hints.height));
      if (PH.undo.length > 20) PH.undo.shift();
      PH.drawing = true; PH.last = hp(e);
      if ($('phShowOrig').checked) { $('phShowOrig').checked = false; drawView(); }
      stroke(PH.last, PH.last);
    });
    hints.addEventListener('pointermove', (e) => { if (!PH.drawing) return; const p = hp(e); stroke(PH.last, p); PH.last = p; });
    const end = () => { if (PH.drawing) { PH.drawing = false; recompute(); } };
    hints.addEventListener('pointerup', end);
    hints.addEventListener('pointercancel', end);
    function stroke(a, b) {
      hctx.strokeStyle = PH.mode === 'keep' ? '#12d18e' : '#ff3355';
      hctx.lineWidth = Math.max(4, Math.min(hints.width, hints.height) * 0.04);
      hctx.lineCap = 'round';
      hctx.beginPath(); hctx.moveTo(a.x, a.y); hctx.lineTo(b.x + 0.01, b.y); hctx.stroke();
    }

    $('phAdd').addEventListener('click', () => {
      if (!PH.result) return;
      const sprite = DA.trimCanvas(PH.result, 360, 4);
      if (!sprite) { DA.toast('Nothing left to keep – try lowering the strength or use the Keep brush'); return; }
      bringToLife(sprite, { name: PH.name || 'Photo' });
      DA.closeModal('photoModal');
      PH.result = null; PH.full = null; PH.work = null;
    });
    $('photoModal').addEventListener('modal-open', () => requestAnimationFrame(fitPhoto));
  }

  /* ================= global UI ================= */
  function setupUI() {
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const what = b.dataset.open;
      if (what === 'draw') DA.openModal('drawModal');
      else if (what === 'templates') DA.openModal('templatesModal');
      else if (what === 'photo') $('photoInput').click();
    }));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => DA.closeModal(b.dataset.close)));
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('pointerdown', (e) => {
      if (e.target === m && !m.classList.contains('full')) DA.closeModal(m.id);
    }));

    $('addSceneBtn').addEventListener('click', () => DA.openModal('sceneModal'));
    $('bgInput').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; onBgFile(f); });

    const menu = $('sceneMenu');
    $('sceneMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && e.target !== $('sceneMenuBtn')) menu.classList.remove('open'); });
    menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { menu.classList.remove('open'); sceneAction(b.dataset.act); }));

    $('snackBtn').addEventListener('click', () => {
      if (snackFn) snackFn();
      snackFn = null;
      $('snackbar').classList.remove('show');
    });

    $('snapBtn').addEventListener('click', async () => {
      const s = currentScene();
      await DA.saveDataURL(DA.World.snapshot(), safeName('draw-alive-' + s.name) + '.png');
      DA.toast('📸 Picture saved!');
    });
    $('pauseBtn').addEventListener('click', togglePause);
    $('fullBtn').addEventListener('click', toggleFullscreen);
    $('helpBtn').addEventListener('click', () => DA.openModal('helpModal'));

    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') && e.target.type !== 'range' && e.target.type !== 'checkbox';
      const top = DA.topModal();
      if (e.key === 'Escape') {
        if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
        if (top) { DA.closeModal(top); return; }
        DA.World.select(null);
        return;
      }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (top === 'drawModal' && mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? DA.Pad.redo() : DA.Pad.undo(); return; }
      if (top === 'drawModal' && mod && e.key.toLowerCase() === 'y') { e.preventDefault(); DA.Pad.redo(); return; }
      if (top === 'photoModal' && mod && e.key.toLowerCase() === 'z') { e.preventDefault(); $('phUndo').click(); return; }
      if (top) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && DA.World.selected) { e.preventDefault(); deleteSelected(); }
      else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    });

    $('creaturePanel').addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('fullscreenchange', () => { $('fullBtn').querySelector('span:last-child').textContent = document.fullscreenElement ? 'Exit full' : 'Full screen'; });
  }

  function togglePause() {
    const p = !DA.World.paused;
    DA.World.setPaused(p);
    $('pauseIcon').textContent = p ? '▶️' : '⏸️';
    $('pauseLabel').textContent = p ? 'Play' : 'Pause';
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      DA.toast('Full screen is not available here');
    }
  }

  /* ================= start ================= */
  async function start() {
    DA.World.init($('world'));
    DA.World.on('change', onWorldChange);
    DA.World.on('select', syncPanel);
    bindPanel();
    setupPad();
    setupTemplates();
    setupPhoto();
    setupUI();
    buildEnvGrid();
    await load();
    switchScene(state.current);
    window.addEventListener('pagehide', () => DA.storage.set('state', serialise()));
    document.addEventListener('visibilitychange', () => { if (document.hidden) DA.storage.set('state', serialise()); });

    setupNative();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  /* Android (Capacitor) niceties: hardware back button closes dialogs first. */
  function setupNative() {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
    document.body.classList.add('native');
    const AppPlugin = cap.Plugins && cap.Plugins.App;
    if (!AppPlugin || !AppPlugin.addListener) return;
    try {
      AppPlugin.addListener('backButton', () => {
        const menu = $('sceneMenu');
        if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
        const top = DA.topModal();
        if (top) { DA.closeModal(top); return; }
        if (DA.World.selected) { DA.World.select(null); return; }
        DA.storage.set('state', serialise()).finally(() => AppPlugin.exitApp());
      });
      AppPlugin.addListener('pause', () => DA.storage.set('state', serialise()));
    } catch (e) { console.warn('Back button handler not available', e); }
  }

  // expose for tests / debugging
  DA.App = { get state() { return state; }, serialise, currentScene };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
