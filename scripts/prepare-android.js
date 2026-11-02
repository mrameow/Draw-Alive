// Copies the Draw Alive launcher icons into the generated Android project and
// applies small manifest tweaks. Run after `npx cap add android`.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(res)) { console.error('android/ project not found – run "npx cap add android" first'); process.exit(1); }
const src = path.join(root, 'resources', 'android');
for (const dir of fs.readdirSync(src)) {
  fs.mkdirSync(path.join(res, dir), { recursive: true });
  for (const f of fs.readdirSync(path.join(src, dir))) fs.copyFileSync(path.join(src, dir, f), path.join(res, dir, f));
}
// adaptive icon background colour
const bgFile = path.join(res, 'values', 'ic_launcher_background.xml');
fs.writeFileSync(bgFile, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFD23F</color>\n</resources>\n');
// keep the app from restarting when the phone rotates or the keyboard appears
const manifest = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let xml = fs.readFileSync(manifest, 'utf8');
// camera access for the in-app camera (the WebView asks the user at runtime)
if (!/android.permission.CAMERA/.test(xml)) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
}
if (!/android:hardwareAccelerated/.test(xml)) xml = xml.replace('<application', '<application\n        android:hardwareAccelerated="true"');
fs.writeFileSync(manifest, xml);
console.log('Android resources prepared.');
