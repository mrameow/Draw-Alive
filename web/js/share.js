/* Draw Alive – share worlds between devices.
 *
 * One device is the MAIN SCREEN (host). It shows a room code + QR code.
 * Other devices (guests) join with that code and send one or more of their
 * worlds. Each shared world appears on the main screen as a 📡 tab and keeps
 * updating live while the guest draws.
 *
 * Devices talk directly to each other with WebRTC (PeerJS). The free public
 * PeerJS server is only used to introduce the devices to each other; for
 * strict networks PeerJS falls back to its relay (TURN) servers.
 */
(function () {
  'use strict';
  const DA = window.DA;
  const $ = (id) => document.getElementById(id);

  const PREFIX = 'drawalive-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  const PUBLIC_URL = 'https://mrameow.github.io/Draw-Alive/web/';
  const MAX_SCENES_PER_GUEST = 12, MAX_CREATURES = 80;

  const S = {
    role: null,          // 'host' | 'guest' | null
    peer: null,
    code: null,
    guests: new Map(),   // host: clientId -> { name, conn, scenes:Set }
    conn: null,          // guest: connection to host
    shared: new Set(),   // guest: ids of local scenes being shared
    sentSprites: new Set(),
    lastSent: new Map(),
    retry: null, sendTimer: null, joinCode: null, active: false
  };

  /* ---------------- helpers ---------------- */
  let libsPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(el);
    });
  }
  function loadLibs() {
    if (!libsPromise) {
      libsPromise = Promise.all([
        window.Peer ? null : loadScript('vendor/peerjs.min.js'),
        window.qrcode ? null : loadScript('vendor/qrcode.js')
      ]).catch((e) => { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  /** Peer options. ?peerserver=host:port uses your own PeerJS server (and for tests). */
  function peerOptions() {
    const p = new URLSearchParams(location.search).get('peerserver');
    const base = { debug: 0 };
    if (!p) return base;
    const [host, port] = p.split(':');
    return Object.assign(base, { host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && !/^(localhost|127\.)/.test(host), config: { iceServers: [] } });
  }

  function newCode() {
    let c = '';
    for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }
  const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  function clientId() {
    try {
      let id = localStorage.getItem('da:client');
      if (!id) { id = DA.uid(); localStorage.setItem('da:client', id); }
      return id;
    } catch (e) { return (S._cid = S._cid || DA.uid()); }
  }
  function savedName() { try { return localStorage.getItem('da:name') || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem('da:name', n); } catch (e) { /* ignore */ } }

  function joinLink(code) {
    const onWeb = /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) && !window.Capacitor;
    const base = onWeb ? location.origin + location.pathname.replace(/index\.html$/, '') : PUBLIC_URL;
    return base + '?join=' + code;
  }

  function friendlyError(err) {
    const t = err && err.type;
    if (t === 'peer-unavailable') return 'No main screen found with that code. Check the code and that the main screen is still on.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Could not reach the sharing service. Check the internet connection.';
    if (t === 'browser-incompatible') return 'This browser cannot share worlds. Try Chrome, Edge or the Draw Alive app.';
    if (t === 'webrtc') return 'The connection was blocked by this network. Try another Wi-Fi or mobile data.';
    return 'Sharing problem: ' + ((err && (err.message || t)) || 'unknown error');
  }

  /* ---------------- data validation (everything from other devices is untrusted) ---------------- */
  const isImg = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 6e6;
  const num = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? DA.clamp(v, a, b) : d);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const MOTIONS_OK = ['auto', 'swim', 'walk', 'roam', 'hop', 'bounce', 'slither', 'dash', 'fly', 'float'];

  /* ================= HOST ================= */
  async function startHost() {
    if (S.role) return;
    setHostStatus('Starting…');
    try { await loadLibs(); } catch (e) { setHostStatus('Could not load the sharing tools.'); return; }
    S.role = 'host'; S.active = true;
    openHostPeer(newCode(), 0);
    renderHost();
  }

  function openHostPeer(code, attempt) {
    S.code = code;
    const peer = new window.Peer(PREFIX + code.toLowerCase(), peerOptions());
    S.peer = peer;
    peer.on('open', () => { renderHost(); updateBadge(); });
    peer.on('connection', onGuestConnection);
    peer.on('disconnected', () => { if (S.role === 'host' && S.active && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 1500); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); openHostPeer(newCode(), attempt + 1); return; }
      if (err.type === 'peer-unavailable') return;
      setHostStatus(friendlyError(err));
    });
  }

  function onGuestConnection(conn) {
    const g = { conn, name: 'Friend', id: null, scenes: new Set(), sprites: new Map() };
    conn.on('data', (msg) => {
      try { onGuestData(g, msg); } catch (e) { console.warn('Bad message from guest', e); }
    });
    conn.on('close', () => onGuestClosed(g));
    conn.on('error', () => onGuestClosed(g));
  }

  function onGuestData(g, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      g.id = str(msg.client, 40).replace(/[^\w-]/g, '') || DA.uid();
      g.name = str(msg.name, 16).trim() || 'Friend';
      const old = S.guests.get(g.id);
      if (old && old.conn !== g.conn) { g.scenes = old.scenes; g.sprites = old.sprites; try { old.conn.close(); } catch (e) { /* ignore */ } }
      S.guests.set(g.id, g);
      g.conn.send({ t: 'welcome', name: 'Main screen' });
      setOnline(g, true);
      DA.toast(`📡 ${g.name} joined`);
      renderHost(); updateBadge();
      return;
    }
    if (!g.id) return; // must say hello first
    if (msg.t === 'scene') upsertScene(g, msg.scene);
    else if (msg.t === 'unshare') removeScene(g, str(msg.id, 60));
    else if (msg.t === 'bye') {
      [...g.scenes].forEach((sid) => removeScene(g, sid, true));
      S.guests.delete(g.id);
      DA.toast(`${g.name} stopped sharing`);
      renderHost(); updateBadge();
    }
  }

  function onGuestClosed(g) {
    if (!g.id || S.guests.get(g.id) !== g) return;
    setOnline(g, false);
    renderHost(); updateBadge();
  }

  function setOnline(g, online) {
    g.online = online;
    const st = DA.App.state;
    g.scenes.forEach((sid) => { const s = st.scenes.find((x) => x.id === remoteId(g, sid)); if (s && s.remote) s.remote.online = online; });
    DA.App.refresh();
  }

  const remoteId = (g, sid) => 'r-' + g.id + '-' + sid;

  function upsertScene(g, data) {
    if (!data || typeof data !== 'object') return;
    const sid = str(data.id, 60).replace(/[^\w-]/g, '');
    if (!sid) return;
    if (!g.scenes.has(sid) && g.scenes.size >= MAX_SCENES_PER_GUEST) return;
    const type = DA.ENVIRONMENTS[data.type] ? data.type : 'meadow';
    const st = DA.App.state;
    const id = remoteId(g, sid);
    let s = st.scenes.find((x) => x.id === id);
    const isNew = !s;
    if (!s) {
      s = { id, creatures: [], remote: {} };
      st.scenes.push(s);
      g.scenes.add(sid);
    }
    const seed = num(data.seed, 0, 1e10, 1) | 0;
    if (s.type !== type || s.seed !== seed) { s._decor = null; }
    s.type = type; s.seed = seed;
    s.name = str(data.name, 28) || 'World';
    s.motion = MOTIONS_OK.includes(data.motion) ? data.motion : null;
    if (type === 'custom' && isImg(data.bgImage) && data.bgImage !== s.bgImage) { s.bgImage = data.bgImage; s._bgImg = null; }
    s.remote = { owner: g.name, guest: g.id, online: true };

    const incoming = Array.isArray(data.creatures) ? data.creatures.slice(0, MAX_CREATURES) : [];
    const byId = new Map(s.creatures.map((c) => [c.id, c]));
    const next = [];
    incoming.forEach((c) => {
      if (!c || typeof c !== 'object') return;
      const cid = str(c.id, 40);
      if (!cid) return;
      if (isImg(c.sprite)) g.sprites.set(cid, c.sprite);
      const sprite = g.sprites.get(cid);
      if (!sprite) return;
      let cur = byId.get(cid);
      if (!cur) {
        cur = { id: cid, x: num(c.x, 0, 1, 0.5), y: num(c.y, 0, 1, 0.5), _new: true };
      }
      if (cur.sprite !== sprite) { cur.sprite = sprite; cur._img = null; cur._alpha = null; }
      cur.name = str(c.name, 24) || 'Creature';
      cur.kind = str(c.kind, 16) || null;
      cur.move = MOTIONS_OK.includes(c.move) ? c.move : null;
      cur.w = num(c.w, 1, 4000, 100); cur.h = num(c.h, 1, 4000, 100);
      cur.scale = num(c.scale, 0.2, 3, 1); cur.speed = num(c.speed, 0, 3, 1);
      cur.facing = c.facing === 'right' ? 'right' : 'left';
      cur.motion = MOTIONS_OK.includes(c.motion) ? c.motion : 'auto';
      next.push(cur);
    });
    s.creatures = next;
    if (DA.World.selected && DA.World.scene === s && !next.includes(DA.World.selected)) DA.World.select(null);
    DA.App.refresh();
    if (isNew) DA.toast(`📡 ${g.name} shared “${s.name}”`);
    renderHost();
  }

  function removeScene(g, sid, quiet) {
    const st = DA.App.state;
    const id = remoteId(g, sid);
    const i = st.scenes.findIndex((x) => x.id === id);
    g.scenes.delete(sid);
    if (i < 0) return;
    const [s] = st.scenes.splice(i, 1);
    if (st.current === id) DA.App.switchScene((st.scenes[Math.max(0, i - 1)] || st.scenes[0]).id);
    DA.App.refresh();
    if (!quiet) DA.toast(`${g.name} stopped sharing “${s.name}”`);
    renderHost();
  }

  function stopHost() {
    S.guests.forEach((g) => { try { g.conn.send({ t: 'closed' }); g.conn.close(); } catch (e) { /* ignore */ } });
    S.guests.clear();
    // shared worlds stay visible (marked offline) until the app is reloaded
    DA.App.state.scenes.forEach((s) => { if (s.remote) s.remote.online = false; });
    teardown();
    DA.App.refresh();
    renderHost();
  }

  /* ================= GUEST ================= */
  async function joinHost() {
    const code = cleanCode($('shJoinCode').value);
    const name = ($('shName').value || '').trim().slice(0, 16);
    if (code.length !== 6) { setGuestStatus('Type the 6-letter code shown on the main screen.', 'warn'); $('shJoinCode').focus(); return; }
    if (!name) { setGuestStatus('Type your name so the main screen knows who you are.', 'warn'); $('shName').focus(); return; }
    if (!S.shared.size) { setGuestStatus('Pick at least one world to share.', 'warn'); return; }
    saveName(name);
    setGuestStatus('Connecting…');
    try { await loadLibs(); } catch (e) { setGuestStatus('Could not load the sharing tools.', 'warn'); return; }
    S.role = 'guest'; S.active = true; S.joinCode = code; S.myName = name;
    S.peer = new window.Peer(peerOptions());
    S.peer.on('open', () => connectToHost());
    S.peer.on('disconnected', () => { if (S.role === 'guest' && S.active && !S.peer.destroyed) setTimeout(() => { try { S.peer.reconnect(); } catch (e) { /* ignore */ } }, 1500); });
    S.peer.on('error', (err) => {
      setGuestStatus(friendlyError(err), 'warn');
      if (err.type === 'peer-unavailable' && !S.everConnected) { teardown(); renderGuest(); }
      else scheduleRetry();
    });
    renderGuest();
  }

  function connectToHost() {
    if (S.role !== 'guest' || !S.peer || S.peer.destroyed) return;
    clearTimeout(S.retry);
    const conn = S.peer.connect(PREFIX + S.joinCode.toLowerCase(), { reliable: true });
    S.conn = conn;
    conn.on('open', () => {
      S.everConnected = true;
      S.sentSprites = new Set(); S.lastSent = new Map();
      conn.send({ t: 'hello', client: clientId(), name: S.myName, app: 1 });
      sendAll();
      setGuestStatus(`✅ Connected! Your world${S.shared.size > 1 ? 's are' : ' is'} on the main screen. Keep drawing – changes appear live.`, 'ok');
      renderGuest(); updateBadge();
    });
    conn.on('data', (msg) => {
      if (msg && msg.t === 'closed') {
        setGuestStatus('The main screen stopped sharing.', 'warn');
        teardown(); renderGuest(); updateBadge();
      }
    });
    conn.on('close', () => {
      if (S.role !== 'guest' || !S.active || S.conn !== conn) return;
      setGuestStatus('Connection lost – trying again…', 'warn');
      updateBadge();
      scheduleRetry();
    });
  }

  function scheduleRetry() {
    clearTimeout(S.retry);
    if (S.role !== 'guest' || !S.active) return;
    S.retry = setTimeout(() => {
      if (S.role !== 'guest' || !S.active) return;
      if (S.peer && S.peer.disconnected && !S.peer.destroyed) { try { S.peer.reconnect(); } catch (e) { /* ignore */ } }
      else connectToHost();
    }, 3000);
  }

  function guestConnected() { return S.role === 'guest' && S.conn && S.conn.open; }

  /** Build the message for one of my worlds. Sprites are only sent the first time. */
  function scenePayload(s) {
    const creatures = s.creatures.map((c) => {
      const o = { id: c.id, name: c.name, kind: c.kind || null, move: c.move || null, w: c.w, h: c.h, scale: c.scale, speed: c.speed, facing: c.facing, motion: c.motion };
      if (!S.sentSprites.has(c.id)) { o.sprite = c.sprite; o.x = c.x; o.y = c.y; }
      return o;
    });
    return { id: s.id, name: s.name, type: s.type, seed: s.seed, motion: s.motion || null, bgImage: s.type === 'custom' ? s.bgImage : null, creatures };
  }

  function sendScene(s) {
    if (!guestConnected()) return;
    const p = scenePayload(s);
    const key = JSON.stringify(Object.assign({}, p, { bgImage: p.bgImage ? p.bgImage.length : 0, creatures: p.creatures.map((c) => Object.assign({}, c, { sprite: undefined, x: undefined, y: undefined })) }));
    if (S.lastSent.get(s.id) === key && !p.creatures.some((c) => c.sprite)) return;
    S.conn.send({ t: 'scene', scene: p });
    S.lastSent.set(s.id, key);
    s.creatures.forEach((c) => S.sentSprites.add(c.id));
  }

  function sendAll() {
    const st = DA.App.state;
    [...S.shared].forEach((id) => {
      const s = st.scenes.find((x) => x.id === id && !x.remote);
      if (s) sendScene(s);
      else { S.shared.delete(id); if (guestConnected()) S.conn.send({ t: 'unshare', id }); }
    });
  }

  function leave() {
    if (guestConnected()) { try { S.conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } }
    setTimeout(() => { teardown(); renderGuest(); updateBadge(); }, 150);
    setGuestStatus('Stopped sharing.');
  }

  function teardown() {
    S.active = false;
    clearTimeout(S.retry); clearTimeout(S.sendTimer);
    try { if (S.conn) S.conn.close(); } catch (e) { /* ignore */ }
    try { if (S.peer) S.peer.destroy(); } catch (e) { /* ignore */ }
    S.peer = null; S.conn = null; S.role = null; S.code = null; S.everConnected = false;
    updateBadge();
  }

  /* ================= UI ================= */
  function setHostStatus(t) { const el = $('shHostStatus'); if (el) el.textContent = t || ''; }
  function setGuestStatus(t, kind) { const el = $('shStatus'); if (!el) return; el.textContent = t || ''; el.className = 'sh-status' + (kind ? ' ' + kind : ''); }

  function renderHost() {
    const live = S.role === 'host';
    $('shHostIdle').hidden = live;
    $('shHostLive').hidden = !live;
    if (!live) return;
    const ready = S.peer && S.peer.open;
    $('shCode').textContent = ready ? S.code : '······';
    const link = joinLink(S.code);
    $('shLink').textContent = ready ? link.replace(/^https?:\/\//, '') : '';
    if (ready && window.qrcode && $('shQR').dataset.code !== S.code) {
      const q = window.qrcode(0, 'M'); q.addData(link); q.make();
      $('shQR').innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      $('shQR').dataset.code = S.code;
    }
    if (ready) setHostStatus('');
    const list = $('shGuests');
    list.innerHTML = '';
    const gs = [...S.guests.values()];
    $('shCount').textContent = gs.length ? `(${gs.filter((g) => g.online).length} online)` : '';
    if (!gs.length) { list.innerHTML = '<li class="muted">Waiting for devices to join…</li>'; return; }
    gs.forEach((g) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot ${g.online ? 'on' : ''}"></span><b></b><span class="muted"></span>`;
      li.querySelector('b').textContent = g.name;
      li.querySelector('.muted').textContent = `${g.scenes.size} world${g.scenes.size === 1 ? '' : 's'}${g.online ? '' : ' · offline'}`;
      list.appendChild(li);
    });
  }

  function renderGuest() {
    const on = S.role === 'guest';
    $('shJoin').hidden = on;
    $('shLeave').hidden = !on;
    $('shJoinCode').disabled = on;
    $('shName').disabled = on;
    const box = $('shWorlds');
    box.innerHTML = '';
    DA.App.state.scenes.filter((s) => !s.remote).forEach((s) => {
      const env = DA.ENVIRONMENTS[s.type] || {};
      const lab = document.createElement('label');
      lab.className = 'sh-world';
      lab.innerHTML = `<input type="checkbox"><span>${env.icon || '🌍'}</span><span class="nm"></span><span class="count"></span>`;
      lab.querySelector('.nm').textContent = s.name;
      lab.querySelector('.count').textContent = s.creatures.length;
      const cb = lab.querySelector('input');
      cb.checked = S.shared.has(s.id);
      cb.addEventListener('change', () => {
        if (cb.checked) { S.shared.add(s.id); sendScene(s); }
        else { S.shared.delete(s.id); if (guestConnected()) S.conn.send({ t: 'unshare', id: s.id }); }
      });
      box.appendChild(lab);
    });
  }

  function updateBadge() {
    const btn = $('shareBtn');
    if (!btn) return;
    let label = 'Share', live = false;
    if (S.role === 'host') { const n = [...S.guests.values()].filter((g) => g.online).length; label = n ? `Live · ${n}` : 'Live'; live = true; }
    else if (S.role === 'guest') { live = guestConnected(); label = live ? 'Sharing' : 'Joining…'; }
    btn.classList.toggle('live', live);
    btn.querySelector('.lbl').textContent = label;
  }

  function setTab(which) {
    document.querySelectorAll('[data-shtab]').forEach((b) => { const on = b.dataset.shtab === which; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $('shHost').hidden = which !== 'host';
    $('shGuest').hidden = which !== 'guest';
    if (which === 'guest') {
      if (!S.shared.size && DA.App.currentScene() && !DA.App.currentScene().remote) S.shared.add(DA.App.currentScene().id);
      renderGuest();
    } else renderHost();
  }

  function open(tab) {
    DA.openModal('shareModal');
    setTab(tab || (S.role === 'guest' ? 'guest' : 'host'));
  }

  function init() {
    document.querySelectorAll('[data-shtab]').forEach((b) => b.addEventListener('click', () => {
      if (S.role === 'host' && b.dataset.shtab === 'guest') { DA.toast('This device is the main screen. Stop it first to send your world somewhere else.'); return; }
      if (S.role === 'guest' && b.dataset.shtab === 'host') { DA.toast('Stop sharing first to make this device the main screen.'); return; }
      setTab(b.dataset.shtab);
    }));
    $('shareBtn').addEventListener('click', () => open());
    $('shStart').addEventListener('click', startHost);
    $('shStop').addEventListener('click', async () => {
      if (await DA.confirm('Stop the main screen?', 'Connected devices will be disconnected. Their worlds stay on this screen until you close the app.', 'Stop')) stopHost();
    });
    $('shShowAll').addEventListener('click', () => { DA.closeModal('shareModal'); DA.App.openOverview(); });
    $('shCopy').addEventListener('click', async () => {
      const link = joinLink(S.code);
      try { await navigator.clipboard.writeText(link); DA.toast('🔗 Link copied'); }
      catch (e) { DA.prompt('Copy this link', link); }
    });
    $('shJoin').addEventListener('click', joinHost);
    $('shLeave').addEventListener('click', leave);
    $('shJoinCode').addEventListener('input', (e) => { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
    $('shJoinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinHost(); });
    $('shName').value = savedName();

    // opened from a QR code / link: ?join=CODE
    const params = new URLSearchParams(location.search);
    const join = cleanCode(params.get('join'));
    if (join.length === 6) {
      $('shJoinCode').value = join;
      params.delete('join');
      const q = params.toString();
      try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* ignore */ }
      setTimeout(() => {
        open('guest');
        setGuestStatus('Pick the world(s) to send, type your name and tap Connect.');
        if (!$('shName').value) $('shName').focus();
      }, 300);
    }
    window.addEventListener('pagehide', () => { if (S.role === 'guest' && guestConnected()) { try { S.conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } } });
  }

  DA.Share = {
    init,
    open,
    /** Called by the app whenever anything changes (debounced). */
    localChanged() {
      if (S.role !== 'guest' || !S.shared.size) return;
      clearTimeout(S.sendTimer);
      S.sendTimer = setTimeout(sendAll, 500);
    },
    get role() { return S.role; },
    get code() { return S.code; },
    get guestCount() { return [...S.guests.values()].filter((g) => g.online).length; }
  };
})();
