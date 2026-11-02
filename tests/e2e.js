/* End-to-end smoke test: node tests/e2e.js  (needs playwright + a static server) */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'web');
const OUT = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const URL_ = `http://127.0.0.1:${server.address().port}/`;
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) failures++; };

async function makePhoto(page) {
  // a fake "photo": coloured cat on a two-tone background
  return page.evaluate(async () => {
    const t = DA.TEMPLATES.find((x) => x.id === 'cat');
    const img = await DA.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.full.replace('fill="#fff"', 'fill="#f4a261"')));
    const c = DA.makeCanvas(640, 480), x = c.getContext('2d');
    x.fillStyle = '#e9e4d8'; x.fillRect(0, 0, 640, 300); x.fillStyle = '#7d5a3c'; x.fillRect(0, 300, 640, 180);
    x.drawImage(img, 100, 60, 440, 330);
    return c.toDataURL('image/png').split(',')[1];
  });
}

async function run(viewport, tag) {
  const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args } : { args });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: tag === 'mobile', isMobile: tag === 'mobile', permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  console.log(`\n[${tag}] ${viewport.width}x${viewport.height}`);
  await page.goto(URL_);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-1-start.png` });
  check(await page.isVisible('#emptyState'), 'empty state shown for a new world');

  // ---- freehand drawing ----
  await page.click('.dock [data-open=draw]');
  await page.waitForTimeout(300);
  const box = await page.locator('#padPaint').boundingBox();
  const P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  await page.mouse.move(...P(0.3, 0.5)); await page.mouse.down();
  for (let a = 0; a <= 6.4; a += 0.2) await page.mouse.move(...P(0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.25));
  await page.mouse.up();
  await page.click('[data-tool=fill]');
  await page.mouse.click(...P(0.5, 0.5));
  await page.mouse.click(...P(0.02, 0.02)); // outside → refused with a toast
  await page.waitForTimeout(200);
  check((await page.textContent('#toast')).includes('Close the shape'), 'fill outside a closed shape is refused');
  await page.screenshot({ path: `${OUT}/${tag}-2-draw.png` });
  await page.click('#padUndo'); await page.click('#padRedo');
  await page.click('#padAnimate');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 1, 'drawing became a creature');

  // ---- colour-in template ----
  await page.click('.dock [data-open=templates]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${tag}-3-templates.png` });
  await page.click('.tpl-card:has-text("Fish")');
  await page.waitForTimeout(500);
  const b2 = await page.locator('#padPaint').boundingBox();
  await page.click('[data-tool=fill]');
  await page.click('.swatch[title="#ff922b"]');
  await page.mouse.click(b2.x + b2.width * 0.45, b2.y + b2.height * 0.5);
  await page.click('.swatch[title="#4dabf7"]');
  await page.mouse.click(b2.x + b2.width * 0.84, b2.y + b2.height * 0.5);
  // brush scribble that goes far outside the outline – must be cropped away
  await page.click('[data-tool=brush]');
  await page.click('#stayInsideRow'); // turn off "stay inside"
  await page.mouse.move(b2.x + 5, b2.y + 5); await page.mouse.down(); await page.mouse.move(b2.x + b2.width * 0.5, b2.y + b2.height * 0.5, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${tag}-4-colour.png` });
  const sz = await page.evaluate(() => { const r = DA.Pad.exportCreature(); return [r.canvas.width, r.canvas.height]; });
  check(sz[0] / sz[1] > 1.45, `template creature cropped to outline (${sz})`);
  await page.click('#padAnimate');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 2, 'coloured template became a creature');

  // ---- photo with background removal ----
  const b64 = await makePhoto(page);
  await page.setInputFiles('#photoInput', { name: 'my-cat.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${tag}-5-photo.png` });
  const cut = await page.evaluate(() => { const m = document.getElementById('phView').getContext('2d').getImageData(0, 0, 640, 480).data; let t = 0; for (let i = 3; i < m.length; i += 4) if (m[i] < 10) t++; return t / (640 * 480); });
  check(cut > 0.35, `photo background removed (${Math.round(cut * 100)}% transparent)`);
  await page.click('#phAdd');
  await page.waitForTimeout(500);
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 3, 'photo became a creature');

  // ---- select creature & panel ----
  const sel = await page.evaluate(() => { const c = DA.App.currentScene().creatures[0]; DA.World.select(c); return !!DA.World.selected; });
  await page.waitForTimeout(200);
  check(sel && await page.isVisible('#creaturePanel'), 'creature panel opens');
  await page.screenshot({ path: `${OUT}/${tag}-6-world.png` });
  await page.click('#cpCopy');
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 4, 'duplicate creature');
  await page.click('#cpDelete');
  await page.click('#snackBtn');
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 4, 'delete + undo');

  // ---- add more environments without losing the old one ----
  for (const env of ['Forest', 'Space', 'Meadow', 'Ocean']) {
    await page.click('#addSceneBtn');
    await page.waitForTimeout(200);
    if (env === 'Forest') await page.screenshot({ path: `${OUT}/${tag}-7-envs.png` });
    await page.click(`.env-card:has-text("${env}")`);
    await page.waitForTimeout(300);
  }
  const scenes = await page.evaluate(() => DA.App.state.scenes.map((s) => [s.name, s.creatures.length]));
  check(scenes.length === 5 && scenes[0][1] === 4, `5 environments, first still has its creatures: ${JSON.stringify(scenes)}`);
  check(scenes.filter((s) => s[0].startsWith('Ocean')).length === 2, 'same environment type can be added twice');
  // custom photo environment
  await page.click('#addSceneBtn');
  await page.evaluate(() => { document.querySelector('#customMotion').value = 'walk'; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.env-card:has-text("My Photo")')]);
  await chooser.setFiles({ name: 'bg.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.waitForTimeout(600);
  check(await page.evaluate(() => DA.App.currentScene().type) === 'custom', 'custom photo environment');

  // put a creature into meadow and take a picture
  await page.click('.tab:has-text("Meadow")');
  await page.click('.dock [data-open=templates]');
  await page.click('.tpl-card:has-text("Bird")');
  await page.waitForTimeout(300);
  await page.click('#padAnimate');
  await page.click('.dock [data-open=templates]');
  await page.click('.tpl-card:has-text("Rabbit")');
  await page.waitForTimeout(300);
  await page.click('#padAnimate');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${tag}-8-meadow.png` });
  check(await page.evaluate(() => DA.World.motionOf(DA.App.currentScene().creatures[0])) === 'fly', 'bird flies in the meadow');
  const dl = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await page.click('#snapBtn');
  check(!!(await dl), 'save picture downloads a PNG');

  // ---- paste a picture from the clipboard → cut-out editor opens ----
  await page.click('.tab:has-text("Ocean") >> nth=0');
  await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], 'clip.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, b64);
  await page.waitForTimeout(1200);
  check(await page.isVisible('#photoModal'), 'pasting a picture opens the cut-out editor');
  await page.click('#phAdd');
  await page.waitForTimeout(300);

  // ---- camera ----
  await page.click('.dock [data-open=photo]');
  await page.waitForTimeout(200);
  check(await page.isVisible('#photoChooser'), 'photo chooser opens');
  await page.click('#pcCamera');
  await page.waitForFunction(() => document.getElementById('camVideo').videoWidth > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${tag}-11-camera.png` });
  await page.click('#camShoot');
  await page.waitForTimeout(1500);
  check(await page.isVisible('#photoModal') && !(await page.isVisible('#cameraModal')), 'camera snapshot opens the cut-out editor');
  check(await page.evaluate(() => !document.getElementById('camVideo').srcObject), 'camera is switched off after the snapshot');
  await page.click('[data-close=photoModal]');

  // ---- new environments ----
  for (const env of ['Desert', 'Jungle', 'Farm', 'Sky', 'City', 'Candy Land']) {
    await page.click('#addSceneBtn');
    await page.click(`.env-card:has-text("${env}")`);
    await page.waitForTimeout(150);
  }
  check(await page.evaluate(() => DA.App.state.scenes.length) === 12, 'six new environments added');
  // a hopping frog + slithering snake + flying bee on the farm, plus more friends
  for (const t of ['Frog', 'Snake', 'Bee', 'Pig', 'Unicorn']) {
    await page.click('.dock [data-open=templates]');
    await page.click(`.tpl-card:has-text("${t}")`);
    await page.waitForTimeout(250);
    await page.click('#padAnimate');
    await page.waitForTimeout(150);
  }
  await page.click('.tab:has-text("Farm")');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => DA.App.currentScene().creatures.length) === 0, 'farm is empty before');
  await page.click('.tab:has-text("Candy")');
  const motions = await page.evaluate(() => DA.App.currentScene().creatures.map((c) => DA.World.motionOf(c)));
  check(JSON.stringify(motions) === JSON.stringify(['hop', 'slither', 'fly', 'walk', 'hop']), 'creatures get their own movement: ' + motions);
  // interactions: speed time up by waiting; at least one bubble / interaction should appear
  await page.waitForFunction(() => DA.App.currentScene().creatures.some((c) => c._rt && (c._rt.ix || c._rt.bubble || c._rt.trick)), null, { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => DA.App.currentScene().creatures.some((c) => c._rt && (c._rt.ix || c._rt.bubble || c._rt.trick))), 'creatures do tricks / interact');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${tag}-12-candy.png` });

  // ---- all worlds at once ----
  await page.click('#overviewBtn');
  await page.waitForTimeout(1200);
  const tiles = await page.locator('.ov-tile:not(.ov-add)').count();
  check(tiles === 12, `overview shows all ${tiles} worlds`);
  const painted = await page.evaluate(() => [...document.querySelectorAll('.ov-tile canvas')].every((c) => { const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return d[3] > 0; }));
  check(painted, 'every world is drawn live in the overview');
  await page.screenshot({ path: `${OUT}/${tag}-13-overview.png` });
  await page.click('.ov-tile:has-text("Meadow")');
  await page.waitForTimeout(300);
  check(!(await page.isVisible('#overview')) && await page.evaluate(() => DA.App.currentScene().type) === 'meadow', 'tapping a world opens it');

  // ---- persistence ----
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => DA.App.state.scenes.map((s) => s.creatures.length));
  check(after.length === 12 && after[0] === 5, `state restored after reload ${JSON.stringify(after)}`);
  await page.click('.tab >> nth=0');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${tag}-9-reloaded.png` });
  await page.click('#helpBtn');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${tag}-10-help.png` });
  await page.keyboard.press('Escape');

  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
}

(async () => {
  try {
    await run({ width: 1280, height: 800 }, 'desktop');
    await run({ width: 390, height: 844 }, 'mobile');
  } catch (e) { console.error(e); failures++; }
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
