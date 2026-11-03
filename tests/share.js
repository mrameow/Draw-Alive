/* Two-device sharing test: a main screen (host) and a guest connect through a
 * local PeerJS server. Run: node tests/share.js */
const { chromium } = require('playwright');
const { PeerServer } = require('peer');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'web');
const OUT = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const web = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let failures = 0;
const check = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) failures++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const PEER_PORT = 9000 + Math.floor(Math.random() * 500);
  const peerServer = PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await wait(500);
  const base = `http://127.0.0.1:${web.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];
  try {
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = await hostCtx.newPage();
    host.on('pageerror', (e) => errors.push('host: ' + e.message));
    await host.goto(base + '?peerserver=127.0.0.1:' + PEER_PORT);
    await host.waitForTimeout(600);
    console.log('\n[share] main screen + guest');

    await host.click('#shareBtn');
    await host.click('#shStart');
    await host.waitForFunction(() => /^[A-Z2-9]{4}$/.test(document.getElementById('shCode').textContent), null, { timeout: 10000 });
    const code = await host.textContent('#shCode');
    check(/^[A-Z2-9]{4}$/.test(code), 'main screen shows a room code: ' + code);
    check(await host.locator('#shQR svg').count() === 1, 'main screen shows a QR code');
    await host.screenshot({ path: `${OUT}/share-1-host.png` });

    // guest opens the join link (as from the QR code)
    const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const guest = await guestCtx.newPage();
    guest.on('pageerror', (e) => errors.push('guest: ' + e.message));
    await guest.goto(base + `?join=${code}&peerserver=127.0.0.1:${PEER_PORT}`);
    await guest.waitForTimeout(900);
    check(await guest.isVisible('#shareModal') && (await guest.inputValue('#shJoinCode')) === code, 'join link opens "Send my world" with the code filled in');
    // guest makes a creature in their Ocean first
    await guest.click('[data-close=shareModal]');
    await guest.click('.dock [data-open=templates]');
    await guest.click('.tpl-card:has-text("Shark")');
    await guest.waitForTimeout(300);
    await guest.click('#padAnimate');
    await guest.waitForTimeout(300);
    await guest.click('#shareBtn');
    await guest.click('[data-shtab=guest]');
    await guest.fill('#shName', 'Aisyah');
    await guest.click('#shJoin');
    await guest.waitForFunction(() => /Connected/.test(document.getElementById('shStatus').textContent), null, { timeout: 15000 }).catch(() => {});
    check(/Connected/.test(await guest.textContent('#shStatus')), 'guest connects to the main screen');
    await guest.screenshot({ path: `${OUT}/share-2-guest.png` });

    await host.waitForFunction(() => DA.App.state.scenes.some((s) => s.remote), null, { timeout: 10000 }).catch(() => {});
    let remote = await host.evaluate(() => DA.App.state.scenes.filter((s) => s.remote).map((s) => ({ name: s.name, owner: s.remote.owner, n: s.creatures.length, type: s.type })));
    check(remote.length === 1 && remote[0].owner === 'Aisyah' && remote[0].n === 1 && remote[0].type === 'ocean', 'guest world appears on the main screen: ' + JSON.stringify(remote));
    check(/Aisyah/.test(await host.textContent('#shGuests')), 'main screen lists the connected device');

    // live update: guest adds another creature
    await guest.click('[data-close=shareModal]');
    await guest.click('.dock [data-open=templates]');
    await guest.click('.tpl-card:has-text("Octopus")');
    await guest.waitForTimeout(300);
    await guest.click('#padAnimate');
    await host.waitForFunction(() => DA.App.state.scenes.some((s) => s.remote && s.creatures.length === 2), null, { timeout: 8000 }).catch(() => {});
    check(await host.evaluate(() => DA.App.state.scenes.some((s) => s.remote && s.creatures.length === 2)), 'new creature appears live on the main screen');

    // live update: guest resizes a creature
    await guest.evaluate(() => { const c = DA.App.currentScene().creatures[0]; c.scale = 2; DA.World.changed(); });
    await host.waitForFunction(() => DA.App.state.scenes.some((s) => s.remote && s.creatures.some((c) => c.scale === 2)), null, { timeout: 8000 }).catch(() => {});
    check(await host.evaluate(() => DA.App.state.scenes.some((s) => s.remote && s.creatures.some((c) => c.scale === 2))), 'edits sync live');

    // host looks at everything
    await host.click('[data-close=shareModal]');
    await host.click('.tab.remote');
    await host.waitForTimeout(1200);
    await host.screenshot({ path: `${OUT}/share-3-host-tab.png` });
    await host.click('#overviewBtn');
    await host.waitForTimeout(1000);
    await host.screenshot({ path: `${OUT}/share-4-host-overview.png` });
    check(await host.locator('.ov-tile:has-text("Aisyah")').count() === 1, 'shared world is in the all-worlds overview');
    await host.click('#ovClose');

    // shared worlds are not saved on the main screen
    const saved = await host.evaluate(() => DA.App.serialise().scenes.some((s) => String(s.id).startsWith('r-')));
    check(!saved, 'shared worlds are not stored on the main screen');

    // guest stops sharing → world removed from main screen
    await guest.click('#shareBtn');
    await guest.click('#shLeave');
    await host.waitForFunction(() => !DA.App.state.scenes.some((s) => s.remote), null, { timeout: 8000 }).catch(() => {});
    check(await host.evaluate(() => !DA.App.state.scenes.some((s) => s.remote)), 'when the guest stops, its world leaves the main screen');

    // wrong code gives a clear message
    await guest.fill('#shJoinCode', 'ZZZZ');
    await guest.click('#shJoin');
    await guest.waitForFunction(() => /No main screen/.test(document.getElementById('shStatus').textContent), null, { timeout: 10000 }).catch(() => {});
    check(/No main screen/.test(await guest.textContent('#shStatus')), 'a wrong code shows a friendly message');
  } catch (e) { console.error(e); failures++; }
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  web.close();
  try { peerServer.close && peerServer.close(); } catch (e) { /* ignore */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll sharing checks passed');
  process.exit(failures ? 1 : 0);
})();
