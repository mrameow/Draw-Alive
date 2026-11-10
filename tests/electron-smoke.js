/* Desktop (Windows .exe) smoke test: loads the app from file:// in real Electron,
 * exactly like the packaged app, cuts out a photo and checks the offline AI ran.
 * Run on Linux CI with:  xvfb-run -a npx electron tests/electron-smoke.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.disableHardwareAcceleration();
const fail = (m) => { console.log('✘ ' + m); app.exit(1); };
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const errors = [];
  w.webContents.on('console-message', (e) => { const level = e.level, msg = e.message; if (level === 'error' || level === 3) errors.push(msg); });
  setTimeout(() => fail('timed out'), 90000);
  await w.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));
  const res = await w.webContents.executeJavaScript(`(async () => {
    const t = DA.TEMPLATES.find((x) => x.id === 'cat');
    const img = await DA.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.full.replace('fill="#fff"', 'fill="#f4a261"')));
    const c = DA.makeCanvas(640, 480), x = c.getContext('2d');
    x.fillStyle = '#c9b79c'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#6d4c35'; x.fillRect(0, 330, 640, 150);
    x.drawImage(img, 100, 60, 440, 330);
    DA.openPhoto(c, 'Electron test');
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (window.ort && !document.getElementById('phBusy').classList.contains('show') && document.getElementById('photoModal').classList.contains('open')) break;
    }
    const v = document.getElementById('phView'); const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data;
    let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 10) clear++;
    return { ort: !!window.ort, aiBroken: DA.AI.broken, transparent: clear / (v.width * v.height), protocol: location.protocol };
  })()`);
  console.log('electron:', JSON.stringify(res));
  if (res.protocol !== 'file:') return fail('not loaded from file://');
  if (!res.ort || res.aiBroken) return fail('offline AI did not load in the desktop app');
  if (res.transparent < 0.3) return fail('photo background was not removed');
  const bad = errors.filter((m) => !/Security Warning/.test(m));
  if (bad.length) return fail('console errors: ' + bad.join(' | '));
  console.log('✔ desktop app: offline AI cut-out works from file://');
  app.exit(0);
});
