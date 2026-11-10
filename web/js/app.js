/* Draw Alive – application glue: scenes, dialogs, toolbar, persistence. */
(function () {
  'use strict';
  const DA = window.DA;
  const $ = (id) => document.getElementById(id);

  const PALETTE = ['#1f1d3a', '#ffffff', '#ff6b6b', '#ff922b', '#ffd43b', '#94d82d', '#38d9a9', '#4dabf7', '#5c7cfa',
    '#9775fa', '#f783ac', '#a0522d', '#e8590c', '#2f9e44', '#1971c2', '#868e96', '#ffc9c9', '#fff3bf'];

  let state = { version: 1, scenes: [], current: null, settings: { interact: true } };
  let saveTimer = null;

  /* ================= persistence ================= */
  function serialise() {
    return {
      version: 1,
      current: (state.scenes.find((s) => s.id === state.current && !s.remote) || state.scenes.find((s) => !s.remote) || {}).id || null,
      settings: state.settings,
      kidsScene: state.kidsScene || null,
      scenes: state.scenes.filter((s) => !s.remote).map((s) => ({
        id: s.id, name: s.name, type: s.type, seed: s.seed, bgImage: s.bgImage || null, motion: s.motion || null,
        creatures: s.creatures.map((c) => ({
          id: c.id, name: c.name, kind: c.kind || null, move: c.move || null, sprite: c.sprite, w: c.w, h: c.h,
          scale: c.scale, speed: c.speed, facing: c.facing, motion: c.motion, x: c.x, y: c.y
        }))
      }))
    };
  }
  function scheduleSave() {
    if (DA.Share) DA.Share.localChanged();
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
      state.settings = Object.assign({ interact: true }, saved.settings || {});
      state.kidsScene = saved.kidsScene || null;
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
    if (isKids()) renderKidWorld();
    renderWorldBtn();
    const box = $('sceneTabs');
    box.innerHTML = '';
    state.scenes.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'tab' + (s.id === state.current ? ' active' : '') + (s.remote ? ' remote' + (s.remote.online ? '' : ' offline') : '');
      b.title = s.remote ? `Shared live by ${s.remote.owner}${s.remote.online ? '' : ' (offline)'}` : 'Double-click to rename';
      const env = DA.ENVIRONMENTS[s.type] || {};
      b.innerHTML = `<span>${s.remote ? '📡' : env.icon || '🌍'}</span><span class="tab-name"></span><span class="count">${s.creatures.length}</span>`;
      b.querySelector('.tab-name').textContent = s.remote ? `${s.remote.owner} · ${s.name}` : s.name;
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
    $('emptyState').classList.toggle('show', s.creatures.length === 0 && !$('overview').classList.contains('open'));
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
        if (type === 'custom') { pendingBg = isKids() ? 'kids' : 'new'; $('bgInput').click(); return; }
        DA.closeModal('sceneModal');
        if (isKids()) setKidsWorld(type);
        else addScene(newScene(type));
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
      if (pendingBg === 'kids') {
        DA.closeModal('sceneModal');
        setKidsWorld('custom', data);
      } else if (pendingBg === 'new') {
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
      const copy = {
        id: DA.uid(), name: (s.remote ? s.remote.owner + ' · ' : '') + s.name + ' copy', type: s.type, seed: s.seed, bgImage: s.bgImage || null, motion: s.motion || null,
        creatures: s.creatures.map((c) => ({
          id: DA.uid(), name: c.name, kind: c.kind || null, move: c.move || null, sprite: c.sprite, w: c.w, h: c.h,
          scale: c.scale, speed: c.speed, facing: c.facing, motion: c.motion, x: c.x, y: c.y
        }))
      };
      state.scenes.splice(state.scenes.indexOf(s) + 1, 0, copy);
      switchScene(copy.id);
      DA.toast(s.remote ? 'Saved a copy of the shared world on this device' : 'Scene duplicated');
    } else if (act === 'photo') { pendingBg = 'current'; $('bgInput').click(); }
    else if (act === 'names') { state.settings.showNames = !state.settings.showNames; syncInteractLabel(); scheduleSave(); DA.toast(state.settings.showNames ? '🏷️ Names are shown under the creatures' : 'Names hidden'); }
    else if (act === 'interact') { state.settings.interact = !state.settings.interact; syncInteractLabel(); scheduleSave(); DA.toast(state.settings.interact ? '🤝 Creatures will play together' : 'Creatures will keep to themselves'); }
    else if (act === 'focus') setFocus(true);
    else if (act === 'share') DA.Share.open();
    else if (act === 'snap') $('snapBtn').click();
    else if (act === 'overview') openOverview();
    else if (act === 'pause') togglePause();
    else if (act === 'help') DA.openModal('helpModal');
    else if (act === 'kids') setKids(true);
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
      if (state.scenes.filter((x) => !x.remote).length === 1 && !s.remote) { DA.toast('You need at least one environment'); return; }
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
    $('cpKidName').textContent = c.name || '';
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
    $('cpTrick').addEventListener('click', () => { const c = sel(); if (c) DA.World.trick(c); });
    $('cpEdit').addEventListener('click', () => { const c = sel(); if (c) editCreature(c); });
    $('cpSave').addEventListener('click', () => { const c = sel(); if (c) DA.saveDataURL(c.sprite, safeName(c.name || 'creature') + '.png'); });
    $('cpDelete').addEventListener('click', deleteSelected);
    const resize = (k) => { const c = sel(); if (!c) return; c.scale = DA.clamp((c.scale || 1) * k, 0.5, 2.5); DA.Sound.play(k > 1 ? 'pop' : 'boing'); scheduleSave(); };
    $('cpBigger').addEventListener('click', () => resize(1.2));
    $('cpSmaller').addEventListener('click', () => resize(1 / 1.2));
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

  async function deleteSelected() {
    const c = DA.World.selected;
    if (!c) return;
    if (isKids() && !(await DA.confirm(`Say bye-bye to ${c.name || 'this creature'}?`, '', 'Bye-bye 👋', true))) return;
    DA.Sound.play('whoosh');
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
    if (isKids() && currentScene().creatures.length >= KIDS_MAX) {
      DA.Sound.play('nope');
      DA.toast(`Your world is full (${KIDS_MAX})! Tap a creature and press 🗑️ to make room.`, 3500);
      return null;
    }
    const c = DA.World.addCreature(sprite, info);
    DA.Sound.play('magic');
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

  /* ================= editing a creature in the drawing pad ================= */
  let editing = null; // { c, scene }
  async function editCreature(c) {
    try {
      const img = await DA.loadImage(c.sprite);
      editing = { c, scene: currentScene() };
      DA.World.select(null);
      DA.Pad.loadSprite(img);
      $('padAnimate').textContent = '✅ Save changes';
      $('drawTitle').textContent = `✏️ Edit ${c.name || 'creature'}`;
      DA.openModal('drawModal');
    } catch (e) {
      DA.toast('Sorry, this creature cannot be edited');
    }
  }
  function stopEditing() {
    editing = null;
    $('padAnimate').textContent = '✨ Bring to life!';
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
      if (isKids() && !(await DA.confirm('Start again?', 'Your picture will be wiped clean.', 'Start again', true))) return;
      if (DA.Pad.hasTemplate()) {
        DA.Pad.clear(true);
        DA.toast('Colours cleared (Undo brings them back)');
      } else { DA.Pad.clear(false); }
    });
    $('padTemplatesBtn').addEventListener('click', () => DA.openModal('templatesModal'));
    $('padAnimate').addEventListener('click', () => {
      const res = DA.Pad.exportCreature();
      if (!res) { DA.toast('Draw something first! 🎨'); return; }
      if (editing) {
        const { c, scene } = editing;
        stopEditing();
        if (scene.creatures.includes(c)) {
          DA.World.updateSprite(c, res.canvas);
          DA.Sound.play('magic');
          DA.toast(`✨ ${c.name || 'Your creature'} is updated!`);
        }
        DA.Pad.reset();
        DA.closeModal('drawModal');
        return;
      }
      const tpl = res.template ? DA.TEMPLATES.find((t) => t.id === res.template) : null;
      bringToLife(res.canvas, { name: res.name, kind: tpl ? tpl.cat : null, move: tpl ? tpl.move : null, speed: tpl && tpl.speed });
      DA.Pad.reset();
      DA.closeModal('drawModal');
    });

    document.addEventListener('pad-template', (e) => {
      const t = e.detail;
      $('drawTitle').textContent = editing ? `✏️ Edit ${editing.c.name || 'creature'}` : t ? `🖍️ Colour the ${t.name}` : '🎨 Draw a creature';
      $('stayInsideRow').style.display = t ? '' : 'none';
      $('solidInsideRow').style.display = t ? 'none' : '';
      $('padTip').innerHTML = t ? 'Tip: use <b>🪣 Fill</b> to colour a whole area in one tap.' : 'Draw your creature facing <b>left ←</b> so it walks the right way.';
      if (t) setTool(DA.Pad.state.tool);
    });
    document.dispatchEvent(new CustomEvent('pad-template', { detail: null }));
    $('drawModal').addEventListener('modal-open', () => requestAnimationFrame(() => DA.Pad.fit()));
    // closing the pad while editing cancels the edit (the creature stays as it was)
    $('drawModal').addEventListener('modal-close', () => { if (editing) { stopEditing(); DA.Pad.reset(); } });
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

    async function onPhotoInput(e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) openPhoto(file, file.name);
    }
    $('photoInput').addEventListener('change', onPhotoInput);
    $('cameraInput').addEventListener('change', onPhotoInput);

    /** Open the cut-out editor for a File/Blob, data URL or canvas. */
    DA.openPhoto = openPhoto;
    async function openPhoto(source, name) {
      try {
        let img = source;
        if (source instanceof Blob) img = await DA.loadImage(await DA.readFileAsDataURL(source));
        else if (typeof source === 'string') img = await DA.loadImage(source);
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) throw new Error('empty image');
        DA.closeModal('photoChooser');
        const fs = Math.min(1, 640 / Math.max(iw, ih));
        PH.full = DA.makeCanvas(iw * fs, ih * fs);
        PH.full.getContext('2d').drawImage(img, 0, 0, PH.full.width, PH.full.height);
        const ws = Math.min(1, 300 / Math.max(PH.full.width, PH.full.height));
        PH.work = DA.makeCanvas(PH.full.width * ws, PH.full.height * ws);
        PH.wctx = PH.work.getContext('2d', { willReadFrequently: true });
        PH.wctx.drawImage(PH.full, 0, 0, PH.work.width, PH.work.height);
        view.width = PH.full.width; view.height = PH.full.height;
        hints.width = PH.work.width; hints.height = PH.work.height;
        hctx.clearRect(0, 0, hints.width, hints.height);
        PH.undo = [];
        PH.ai = {}; PH.token = (PH.token || 0) + 1;
        PH.name = String(name || 'Photo').replace(/\.[^.]+$/, '').replace(/^image$/i, 'Photo').slice(0, 20) || 'Photo';
        $('phStrength').value = 50; $('phOff').checked = false; $('phShowOrig').checked = false; $('phFillHoles').checked = true;
        DA.openModal('photoModal');
        requestAnimationFrame(() => { fitPhoto(); recompute(); });
      } catch (err) {
        DA.toast('Sorry, that picture could not be opened');
      }
    }

    function fitPhoto() {
      const area = $('phArea').getBoundingClientRect();
      if (!PH.full || !area.width) return;
      const s = Math.min((area.width - 16) / PH.full.width, (area.height - 16) / PH.full.height);
      $('phStage').style.width = PH.full.width * s + 'px';
      $('phStage').style.height = PH.full.height * s + 'px';
    }
    window.addEventListener('resize', fitPhoto);

    let busyTimer = null;
    /* ---- which background remover (the user can try each one) ---- */
    const engineSel = $('phEngine');
    function engineList() {
      engineSel.innerHTML = '';
      Object.keys(DA.AI.ENGINES).forEach((id) => {
        const o = document.createElement('option'); o.value = id; o.textContent = DA.AI.ENGINES[id].label; engineSel.appendChild(o);
      });
      engineSel.value = DA.AI.ENGINES[state.settings.remover] ? state.settings.remover : 'u2netp';
    }
    async function engineInfo() {
      const id = engineSel.value, e = DA.AI.ENGINES[id];
      if (!e) { $('phEngineInfo').textContent = ''; return; }
      const have = await DA.AI.isDownloaded(id);
      $('phEngineInfo').textContent = e.bundled ? '✓ Built in, works offline.' : have ? '✓ Downloaded – works offline.' : `Downloads ${e.mb} MB once (needs internet), then works offline.${e.slow ? ' Slow: up to ~30 s on phones.' : ''}`;
    }
    engineList(); engineInfo();
    $('photoModal').addEventListener('modal-open', () => {
      const want = state.settings.remover;
      engineSel.value = DA.AI.ENGINES[want] ? want : 'u2netp';
      engineInfo();
    });
    engineSel.addEventListener('change', () => {
      state.settings.remover = engineSel.value;
      scheduleSave();
      engineInfo();
      recompute();
    });

    function busyText(t) { $('phBusyText').textContent = t; }
    /** The AI guess is computed once per photo and engine, and reused while the user touches it up. */
    async function aiMaskFor(id, w, h) {
      if (PH.ai[id] === undefined) {
        const e = DA.AI.ENGINES[id];
        PH.ai[id] = await DA.AI.mask(id, PH.work, w, h, (f) => {
          if (f === null) busyText(e.slow ? `✨ ${e.label.replace(/^\S+\s/, '')} is thinking… (can take a while)` : '✨ Finding your creature…');
          else busyText(`⬇️ Downloading ${e.label.replace(/^\S+\s/, '')}… ${Math.round(f * e.mb)} / ${e.mb} MB`);
        });
      }
      return PH.ai[id];
    }
    function recompute() {
      if (!PH.work) return;
      busyText('✨ Finding your creature…');
      $('phBusy').classList.add('show');
      clearTimeout(busyTimer);
      const token = PH.token;
      busyTimer = setTimeout(async () => {
        try {
          const w = PH.work.width, h = PH.work.height;
          const id = engineSel.value;
          const useAI = !$('phOff').checked && !!DA.AI.ENGINES[id];
          let ai = useAI ? await aiMaskFor(id, w, h) : null;
          if (token !== PH.token || !PH.work) return; // a newer photo was opened meanwhile
          if (useAI && !ai) {
            const e = DA.AI.ENGINES[id];
            DA.toast(e.bundled ? 'AI is not available on this device – using Classic.' : `Could not download ${e.label.replace(/^\S+\s/, '')} (check the internet). Using Quick AI.`, 3600);
            if (!e.bundled) { engineSel.value = 'u2netp'; state.settings.remover = 'u2netp'; engineInfo(); ai = await aiMaskFor('u2netp', w, h); }
          }
          if ($('phOff').checked) {
            PH.mask = new Float32Array(w * h).fill(1);
          } else {
            const hd = hctx.getImageData(0, 0, w, h).data;
            const hint = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) if (hd[i * 4 + 3] > 40) hint[i] = hd[i * 4 + 1] > hd[i * 4] ? 1 : 2;
            const opts = { strength: +$('phStrength').value, hints: hint, fillHoles: $('phFillHoles').checked };
            PH.mask = ai ? DA.BgRemove.refineAI(ai, w, h, opts) : DA.BgRemove.computeMask(PH.wctx.getImageData(0, 0, w, h), opts);
          }
          PH.result = DA.BgRemove.applyMask(PH.full, PH.mask, w, h);
          drawView();
          engineInfo();
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
      if (what === 'draw') { if (DA.Pad.hasTemplate()) DA.Pad.reset(); DA.openModal('drawModal'); }
      else if (what === 'templates') DA.openModal('templatesModal');
      else if (what === 'photo') DA.openModal('photoChooser');
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
        if (document.body.classList.contains('focus')) { setFocus(false); return; }
        if (overviewOpen()) { closeOverview(); return; }
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
      else if (e.key === ' ' && !isKids()) { e.preventDefault(); togglePause(); }
    });

    $('creaturePanel').addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('fullscreenchange', () => { $('fullBtn').querySelector('span:last-child').textContent = document.fullscreenElement ? 'Exit full' : 'Full screen'; });
  }

  function togglePause() {
    const p = !DA.World.paused;
    DA.World.setPaused(p);
    $('pauseIcon').textContent = p ? '▶️' : '⏸️';
    $('pauseLabel').textContent = p ? 'Play' : 'Pause';
    $('menuPause').innerHTML = p ? '<span>▶️</span>Play' : '<span>⏸️</span>Pause';
  }

  /* ================= phones: world button + world switcher sheet ================= */
  function renderWorldBtn() {
    const s = currentScene();
    if (!s) return;
    const env = DA.ENVIRONMENTS[s.type] || {};
    const b = $('worldBtn');
    b.querySelector('.wb-icon').textContent = s.remote ? '📡' : env.icon || '🌍';
    b.querySelector('.wb-name').textContent = s.remote ? `${s.remote.owner} · ${s.name}` : s.name;
    b.querySelector('.wb-count').textContent = s.creatures.length;
    b.title = `${state.scenes.length} world${state.scenes.length === 1 ? '' : 's'} – tap to switch`;
  }
  function openWorldList() {
    const list = $('worldList');
    list.innerHTML = '';
    state.scenes.forEach((s) => {
      const row = document.createElement('button');
      row.className = 'wl-row' + (s.id === state.current ? ' current' : '') + (s.remote ? ' remote' : '');
      const cv = DA.makeCanvas(128, 80);
      try { DA.Env.render(cv.getContext('2d'), s, 128, 80, 3); } catch (e) { /* preview only */ }
      row.appendChild(cv);
      const nm = document.createElement('span'); nm.className = 'nm';
      nm.textContent = s.remote ? `${s.remote.owner} · ${s.name}` : s.name;
      const ct = document.createElement('span'); ct.className = 'count'; ct.textContent = s.creatures.length;
      row.append(nm, ct);
      row.addEventListener('click', () => { DA.closeModal('worldsModal'); if (s.id !== state.current) switchScene(s.id); });
      list.appendChild(row);
    });
    DA.openModal('worldsModal');
  }
  function setupPhone() {
    $('worldBtn').addEventListener('click', openWorldList);
    $('wlAll').addEventListener('click', () => { DA.closeModal('worldsModal'); openOverview(); });
    $('wlNew').addEventListener('click', () => { DA.closeModal('worldsModal'); DA.openModal('sceneModal'); });
    // the ⋮ menu is a bottom sheet on phones: dim the screen behind it
    const menu = $('sceneMenu'), back = $('menuBackdrop');
    new MutationObserver(() => back.classList.toggle('show', menu.classList.contains('open'))).observe(menu, { attributes: true, attributeFilter: ['class'] });
    back.addEventListener('click', () => menu.classList.remove('open'));
    // "More options" start open on big screens, folded away on phones
    if (window.matchMedia('(min-width: 641px)').matches) { $('padMore').open = true; $('phMore').open = true; }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      DA.toast('Full screen is not available here');
    }
  }


  /* ================= photo sources: chooser, paste, camera ================= */
  function setupPhotoSources() {
    $('photoChooser').addEventListener('modal-open', () => DA.AI && DA.AI.warmUp(state.settings.remover));
    $('pcFile').addEventListener('click', () => $('photoInput').click());
    $('pcCamera').addEventListener('click', openCamera);
    $('pcPaste').addEventListener('click', pasteFromClipboard);

    // Ctrl+V / Cmd+V anywhere (except while typing) opens the cut-out editor
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && (/INPUT|TEXTAREA/.test(t.tagName) && t.type !== 'range' && t.type !== 'checkbox' || t.isContentEditable)) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && /^image\//.test(it.type)) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); closeOtherModals(); DA.openPhoto(f, 'Pasted'); return; }
        }
      }
      const files = (e.clipboardData && e.clipboardData.files) || [];
      if (files[0] && /^image\//.test(files[0].type)) { e.preventDefault(); closeOtherModals(); DA.openPhoto(files[0], 'Pasted'); return; }
      if (!DA.topModal()) DA.toast('There is no picture on the clipboard – copy an image first');
    });
  }

  function closeOtherModals() {
    ['photoChooser', 'templatesModal', 'sceneModal', 'helpModal', 'cameraModal'].forEach((id) => DA.closeModal(id));
  }

  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('unsupported');
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((tp) => /^image\//.test(tp));
        if (type) { DA.openPhoto(await it.getType(type), 'Pasted'); return; }
      }
      DA.toast('No picture on the clipboard – copy an image first');
    } catch (e) {
      DA.toast('Press Ctrl+V (or long-press → Paste) to paste your picture', 3200);
    }
  }

  /* camera */
  const CAM = { stream: null, facing: 'environment', timer: false, busy: false };
  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('cameraInput').click(); // fall back to the phone's own camera app
      return;
    }
    DA.closeModal('photoChooser');
    DA.openModal('cameraModal');
    await startStream();
  }
  async function startStream() {
    stopStream();
    const v = $('camVideo');
    $('camMsg').textContent = 'Starting camera…';
    $('camShoot').disabled = true;
    try {
      CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: CAM.facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      v.srcObject = CAM.stream;
      const track = CAM.stream.getVideoTracks()[0];
      const set = track && track.getSettings ? track.getSettings() : {};
      v.classList.toggle('mirror', set.facingMode === 'user' || (!set.facingMode && CAM.facing === 'user'));
      await v.play().catch(() => {});
      $('camMsg').textContent = '';
      $('camShoot').disabled = false;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      $('camSwitch').style.display = devices.filter((d) => d.kind === 'videoinput').length > 1 ? '' : 'none';
    } catch (e) {
      const denied = e && /NotAllowed|Permission|Security/i.test(e.name || e.message);
      $('camMsg').textContent = denied
        ? 'Camera permission was blocked. Allow the camera in your browser or phone settings, or use “Choose a picture”.'
        : 'No camera was found. You can still choose a picture instead.';
    }
  }
  function stopStream() {
    if (CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop());
    CAM.stream = null;
    const v = $('camVideo'); if (v) v.srcObject = null;
  }
  async function shoot() {
    if (CAM.busy || !CAM.stream) return;
    const v = $('camVideo');
    if (!v.videoWidth) return;
    CAM.busy = true;
    if (CAM.timer) {
      const area = document.querySelector('.cam-area');
      for (let n = 3; n > 0; n--) {
        const el = document.createElement('div'); el.className = 'cam-count'; el.textContent = n; area.appendChild(el);
        await new Promise((r) => setTimeout(r, 900)); el.remove();
        if (!CAM.stream) { CAM.busy = false; return; }
      }
    }
    const f = $('camFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const c = DA.makeCanvas(v.videoWidth, v.videoHeight);
    const cx = c.getContext('2d');
    if (v.classList.contains('mirror')) { cx.translate(c.width, 0); cx.scale(-1, 1); }
    cx.drawImage(v, 0, 0);
    CAM.busy = false;
    DA.closeModal('cameraModal');
    DA.openPhoto(c, 'Snapshot');
  }
  function setupCamera() {
    $('camShoot').addEventListener('click', shoot);
    $('camSwitch').addEventListener('click', () => { CAM.facing = CAM.facing === 'user' ? 'environment' : 'user'; startStream(); });
    $('camTimer').addEventListener('click', () => { CAM.timer = !CAM.timer; $('camTimer').classList.toggle('btn-primary', CAM.timer); $('camTimer').classList.toggle('btn-ghost', !CAM.timer); });
    $('cameraModal').addEventListener('modal-close', stopStream);
    document.addEventListener('visibilitychange', () => { if (document.hidden && CAM.stream) DA.closeModal('cameraModal'); });
  }

  /* ================= all worlds overview ================= */
  const OV = { tiles: [], ro: null };
  function openOverview() {
    if (isKids()) return;
    if (OV.ro) OV.ro.disconnect();
    DA.World.select(null);
    const grid = $('ovGrid');
    grid.innerHTML = '';
    OV.tiles = [];
    const n = state.scenes.length + 1;
    const r = $('stage').getBoundingClientRect();
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (r.width / Math.max(1, r.height)) * 0.75)) || 1));
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const tdpr = Math.min(1.5, window.devicePixelRatio || 1);
    OV.ro = window.ResizeObserver ? new ResizeObserver((entries) => entries.forEach((en) => sizeTile(en.target._tile))) : null;
    function sizeTile(t) {
      if (!t) return;
      const b = t.el.getBoundingClientRect();
      t.w = b.width; t.h = b.height; t.dpr = tdpr;
      t.canvas.width = Math.max(1, Math.round(b.width * tdpr)); t.canvas.height = Math.max(1, Math.round(b.height * tdpr));
    }
    state.scenes.forEach((s) => {
      const el = document.createElement('button');
      el.className = 'ov-tile' + (s.id === state.current ? ' current' : '');
      const cv = document.createElement('canvas');
      el.appendChild(cv);
      const env = DA.ENVIRONMENTS[s.type] || {};
      const lab = document.createElement('div');
      lab.className = 'ov-label';
      lab.innerHTML = `<span>${env.icon || '🌍'}</span><span class="nm"></span><span class="count">${s.creatures.length}</span>`;
      lab.querySelector('.nm').textContent = s.remote ? `📡 ${s.remote.owner} · ${s.name}` : s.name;
      el.appendChild(lab);
      el.setAttribute('aria-label', `Open ${s.name}`);
      el.addEventListener('click', () => { closeOverview(); if (s.id !== state.current) switchScene(s.id); });
      grid.appendChild(el);
      DA.Env.prepare(s);
      const t = { scene: s, el, canvas: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: tdpr };
      el._tile = t;
      OV.tiles.push(t);
      if (OV.ro) OV.ro.observe(el);
    });
    const add = document.createElement('button');
    add.className = 'ov-tile ov-add';
    add.innerHTML = '<span>＋</span>New world';
    add.addEventListener('click', () => { closeOverview(); DA.openModal('sceneModal'); });
    grid.appendChild(add);
    $('ovCount').textContent = `· ${state.scenes.length} world${state.scenes.length === 1 ? '' : 's'}, ${state.scenes.reduce((a, s) => a + s.creatures.length, 0)} creatures`;
    $('overview').classList.add('open');
    document.body.classList.add('in-overview');
    $('emptyState').classList.remove('show');
    requestAnimationFrame(() => { OV.tiles.forEach(sizeTile); DA.World.setOverview(OV.tiles); });
  }
  function closeOverview() {
    if (!$('overview').classList.contains('open')) return;
    $('overview').classList.remove('open');
    document.body.classList.remove('in-overview');
    if (OV.ro) OV.ro.disconnect();
    OV.tiles = [];
    DA.World.setOverview(null);
    updateEmpty();
  }
  const overviewOpen = () => $('overview').classList.contains('open');

  function syncInteractLabel() {
    $('menuNames').textContent = '🏷️ Show creature names: ' + (state.settings.showNames ? 'On' : 'Off');
    DA.World.setShowNames(state.settings.showNames);
    $('menuInteract').textContent = '🤝 Creatures play together: ' + (state.settings.interact ? 'On' : 'Off');
    DA.World.setInteract(state.settings.interact);
  }


  /* ================= kids mode ================= */
  const KIDS_MAX = 25;
  const isKids = () => document.body.classList.contains('kids');

  function setKids(on, quiet) {
    if (on) {
      if (DA.Share.role === 'host') { DA.toast('Stop the main screen first (📡 Share → Stop)'); return; }
      closeOverview();
      setFocus(false);
      $('sceneMenu').classList.remove('open');
      // Use the world that is on screen right now (after a restart: the one kids mode was using).
      let s = quiet ? state.scenes.find((x) => x.id === state.kidsScene && !x.remote) : null;
      if (!s) s = currentScene() && !currentScene().remote ? currentScene() : state.scenes.find((x) => !x.remote);
      if (!s) { s = newScene('meadow', { name: 'My World' }); state.scenes.push(s); }
      state.kidsScene = s.id;
      document.body.classList.add('kids');
      state.settings.kids = true;
      DA.Sound.setEnabled(state.settings.sound !== false);
      syncSoundIcon();
      switchScene(s.id);
      if (!quiet) { DA.Sound.play('yay'); DA.toast('🧒 Kids mode is on!'); }
    } else {
      document.body.classList.remove('kids');
      state.settings.kids = false;
      DA.Sound.setEnabled(false);
      renderTabs();
      DA.toast('Kids mode is off');
    }
    renderKidWorld();
    scheduleSave();
  }

  /** Kids have exactly one world – picking an environment changes it. */
  function setKidsWorld(type, bgImage) {
    const s = currentScene();
    s.type = type;
    s.seed = Math.floor(Math.random() * 1e9);
    s._decor = null;
    if (type === 'custom') { s.bgImage = bgImage; s._bgImg = null; s.motion = 'walk'; }
    s.name = type === 'custom' ? 'My Photo' : DA.ENVIRONMENTS[type].name;
    s.creatures.forEach((c) => { if (c._rt) c._rt.next = 0; });
    DA.Env.prepare(s);
    DA.Sound.play('magic');
    onWorldChange();
    renderKidWorld();
  }

  function renderKidWorld() {
    const s = currentScene();
    const env = DA.ENVIRONMENTS[s.type] || {};
    $('kidWorld').innerHTML = `<span class="kw-icon">${env.icon || '🌍'}</span><span class="kw-name"></span>`;
    $('kidWorld').querySelector('.kw-name').textContent = s.name;
  }

  function syncSoundIcon() {
    const on = state.settings.sound !== false;
    $('kidSound').textContent = on ? '🔊' : '🔇';
    $('kidSound').setAttribute('aria-pressed', on);
  }

  /* leaving kids mode: a simple yes / no */
  async function askLeaveKids() {
    if (await DA.confirm('Leave kids mode?', 'All buttons and worlds will come back.', 'Yes', false, 'No')) setKids(false);
  }

  /* ================= "only worlds" view ================= */
  let focusTimer = null;
  function setFocus(on) {
    if (on && isKids()) return;
    document.body.classList.toggle('focus', on);
    DA.World.select(null);
    $('sceneMenu').classList.remove('open');
    if (on) { pokeFocus(); DA.toast('Move the mouse or tap the screen to show the buttons again', 2600); }
    else { clearTimeout(focusTimer); document.querySelectorAll('.focus-exit').forEach((b) => b.classList.remove('show')); document.body.classList.remove('idle'); }
  }
  function pokeFocus() {
    if (!document.body.classList.contains('focus')) return;
    document.body.classList.toggle('in-overview', overviewOpen());
    document.querySelectorAll('.focus-exit').forEach((b) => b.classList.add('show'));
    document.body.classList.remove('idle');
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => { document.querySelectorAll('.focus-exit').forEach((b) => b.classList.remove('show')); document.body.classList.add('idle'); }, 2500);
  }

  function setupModes() {
    // kids
    $('kidExit').addEventListener('click', askLeaveKids);
    $('kidSound').addEventListener('click', () => {
      state.settings.sound = state.settings.sound === false;
      DA.Sound.setEnabled(state.settings.sound);
      syncSoundIcon();
      DA.Sound.play('pop');
      scheduleSave();
    });
    $('kidWorldBtn').addEventListener('click', () => DA.openModal('sceneModal'));
    $('kidSendBtn').addEventListener('click', () => DA.Share.open('guest'));
    $('sceneModal').addEventListener('modal-open', () => {
      $('sceneTitle').textContent = isKids() ? '🌍 Pick your world' : '🌍 Add a new environment';
    });
    DA.World.on('tap', () => DA.Sound.play('boing'));
    document.querySelector('.dock').addEventListener('click', (e) => { if (isKids() && e.target.closest('.dock-btn')) DA.Sound.play('pop'); });
    // only worlds
    $('kidsBtn').addEventListener('click', () => setKids(true));
    $('focusBtn').addEventListener('click', () => setFocus(true));
    $('ovFocus').addEventListener('click', () => setFocus(true));
    $('focusExit').addEventListener('click', () => setFocus(false));
    $('focusAll').addEventListener('click', () => { openOverview(); pokeFocus(); });
    ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, pokeFocus, { passive: true }));
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
    setupPhotoSources();
    setupCamera();
    setupUI();
    DA.Share.init();
    $('overviewBtn').addEventListener('click', () => (overviewOpen() ? closeOverview() : openOverview()));
    $('ovClose').addEventListener('click', closeOverview);
    setupModes();
    setupPhone();
    buildEnvGrid();
    await load();
    switchScene(state.current);
    syncInteractLabel();
    if (state.settings.kids || new URLSearchParams(location.search).get('kids') === '1') setKids(true, true);
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
        if (overviewOpen()) { closeOverview(); return; }
        if (DA.World.selected) { DA.World.select(null); return; }
        if (document.body.classList.contains('focus')) { setFocus(false); return; }
        if (isKids()) { askLeaveKids(); return; }
        DA.storage.set('state', serialise()).finally(() => AppPlugin.exitApp());
      });
      AppPlugin.addListener('pause', () => DA.storage.set('state', serialise()));
    } catch (e) { console.warn('Back button handler not available', e); }
  }

  // expose for tests / debugging
  DA.App = {
    get state() { return state; }, serialise, currentScene, switchScene, openOverview, isKids, setKids, setFocus,
    /** Re-render after outside changes (e.g. a shared world arrived). */
    refresh() {
      onWorldChange();
      if ($('overview').classList.contains('open') && OV.tiles.length !== state.scenes.length) openOverview();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
