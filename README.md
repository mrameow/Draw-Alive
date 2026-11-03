# 🎨 Draw Alive

Draw, colour in or photograph a creature – and watch it come alive in animated worlds.
Runs in the browser (GitHub Pages), on Windows (.exe) and on Android (.apk). It works fully offline:
no accounts, no servers, and nothing leaves your device.

**▶ Play online:** https://mrameow.github.io/Draw-Alive/
**⬇ Downloads (Windows .exe & Android .apk):** [Latest release](https://github.com/mrameow/Draw-Alive/releases/tag/latest)

## Features

| | |
|---|---|
| 🎨 **Draw** | Brush, 🪣 fill bucket, eraser, 18 colours + any colour, brush size, undo/redo. Enclosed areas of your outline are automatically filled white, so your creature isn't see-through. |
| 🖍️ **Colour-in outlines** | 38 black & white outlines in 7 groups: Ocean (fish, whale, shark, dolphin, turtle, octopus, crab, jellyfish, starfish, seahorse), Land (rabbit, bear, panda, lion, giraffe, elephant, dinosaur, penguin, frog, snake), Farm (cat, dog, pig, cow, sheep), Sky (bird, owl), Bugs (butterfly, bee, ladybug, snail), Fantasy (unicorn, dragon, monster) and Space (alien, robot, rocket). Colour them however you like – the app knows each outline and **cuts the animal out exactly**, even if you scribble outside. “Stay inside the lines” mode keeps every brush stroke inside the area you started in. |
| 📷 **Photo cut-out** | Pick a picture, snap one with the **in-app camera** (front/back camera, 3-second timer), or just **paste** one (Ctrl+V). The cut-out editor opens automatically. A new smart background remover cuts out the creature, and you can touch it up with **Keep / Remove** brushes, a strength slider, and an option to keep the whole photo. |
| 🌍 **Multiple environments** | 12 worlds: Ocean, Forest, Space, Meadow, Snow, Desert, Jungle, Farm, Sky, City, Candy Land, or **your own photo** as the background. Add as many as you like (even several oceans). Each one keeps its own creatures in its own tab, and adding a new one never deletes the old ones. |
| 🗺️ **All worlds at once** | The ▦ button shows every world side by side, all animating live. Tap one to jump in. |
| 🐾 **Living creatures** | 10 movement styles: walk, hop, bounce, dash, slither, roam, swim, fly and float. Animals pick a natural one (frogs hop, snakes slither, bees fly). They do tricks on their own (spin, jump, dance, nap, look around) and **play together**: they wave, chase, dance and high-five, with emoji speech bubbles. This can be switched off in the ⋮ menu. Tap a creature to rename it, resize it, change its speed or movement, flip it, copy it, bring it to the front, save it as a PNG, move it to another world, or delete it (with undo). Drag to move. |
| 📡 **Share between devices** | Make one device the **main screen** (📡 Share → Be the main screen). It shows a 6-letter code and a QR code. On other phones, tablets or computers, tap 📡 Share → Send my world, type the code (or scan the QR code) and pick which worlds to send. Each world appears on the main screen as a 📡 tab and updates live while its owner draws. Devices connect directly with WebRTC (PeerJS), so there's nothing to install or host. Shared worlds are not saved on the main screen. |
| 💾 **Saves automatically** | Everything is stored on the device (IndexedDB) and comes back next time. |
| 🖼️ **Save picture** | Export a snapshot of your world as a PNG (on Android it opens the share sheet). |
| ✨ Extras | Pause/play, full screen, “make everyone jump” party button, rename/duplicate/delete worlds, keyboard shortcuts, Android back button closes dialogs, works offline as an installable web app. |

### What changed from the original
* **Background remover rebuilt.** The old version averaged the 4 corner pixels and deleted every pixel within a fixed colour distance. That fails on gradients, textures, shadows, two-tone backgrounds (wall + table) and white paper. The new one learns the background colours from the whole border (k-means in Lab colour space), flood-fills inwards while stopping at edges, scores each pixel against foreground and background colour models, smooths the result with edge-aware diffusion, then removes specks, fills holes and feathers the edges. On test images the overlap with the true outline (IoU) went from **0.18–0.76** with the old method to **0.98** with the new one.
* Environments are now separate saved worlds (tabs), not a theme switch that hides creatures.
* Fixed bugs from the original: uploaded images weren't cropped, so tapping hit the wrong spot; background layouts broke when the window was resized; touch drawing never ended a stroke properly; the colour box redrew pixel by pixel; it loaded remote scripts that only exist on the original host.

## Sharing: how it works and troubleshooting

* Both devices need internet. They can be on different networks (school Wi-Fi and mobile data both work).
* The free PeerJS service only introduces the devices to each other; the drawings go directly from device to device. On very strict networks PeerJS sends the data through its relay servers instead.
* Sharing works between all versions: web, Windows app and Android app, in any combination.
* If a network blocks it completely, try mobile data or a hotspot on one device.
* To run your own PeerJS server, add `?peerserver=your-host:port` to the app's address (the tests use this).

## Install

* **Windows:** download `Draw-Alive-Setup-x.y.z.exe` (installer) or `Draw-Alive-Portable-x.y.z.exe` (runs without installing) from the [latest release](https://github.com/mrameow/Draw-Alive/releases/tag/latest). The app isn't code-signed, so Windows SmartScreen may warn you: click **More info → Run anyway**.
* **Android:** download `Draw-Alive.apk` on your phone, open it, and allow “Install unknown apps” for your browser or file manager when asked.
* **Web:** open the GitHub Pages link. In Chrome or Edge you can also use **Install app** to add it to your home screen or desktop.

## How the builds work

Every push to `main` runs [`.github/workflows/build.yml`](.github/workflows/build.yml), which:
1. tests the web app in headless Chromium (`tests/e2e.js`),
2. deploys `web/` to GitHub Pages,
3. builds the Windows installer and portable `.exe` with Electron on `windows-latest`,
4. builds the Android `.apk` with Capacitor + Gradle,
5. replaces the **latest** release with the new `.exe` and `.apk` files.

> **First time only:** if the Pages step fails with “Resource not accessible by integration”, open
> **Settings → Pages** in the repository, set **Source** to **GitHub Actions**, and re-run the workflow.

## Develop locally

```bash
npm install
npm start            # web app at http://localhost:8080
npm test             # end-to-end browser test (needs: npx playwright install chromium)
npm run desktop      # run the Windows/desktop app (Electron)
npm run dist:win     # build the .exe files into dist/ (on Windows)
npm run android:add  # create the android/ project (needs Android Studio / SDK)
npx cap sync android && cd android && ./gradlew assembleDebug
```

The web app is plain HTML, CSS and JavaScript with no build step, so you can also just open `web/index.html`.

```
web/                 the app (shared by web, Windows and Android)
  js/environments.js animated worlds
  js/templates.js    colour-in outlines (SVG)
  js/bgremove.js     background remover
  js/drawpad.js      drawing / colouring pad
  js/world.js        creatures & animation
  js/app.js          UI, scenes, saving
electron/main.js     Windows wrapper
capacitor.config.json, scripts/prepare-android.js   Android wrapper
resources/           icons & splash screens
original/            the original single-file version
```
