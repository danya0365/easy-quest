// How much of the frame is SKY: blue dome, haze, or cloud. Sky = blue-dominant, or a near-neutral bright cloud.
import { chromium } from 'playwright';
import fs from 'node:fs';
const files = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body><canvas id=c></canvas></body>');
for (const f of files) {
  const b = fs.readFileSync(f).toString('base64');
  const r = await page.evaluate(async ({ b }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
    const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let sky = 0, n = img.width * img.height, lowest = 0;
    const rows = new Int32Array(img.height);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
      const blue = B > G + 6 && B > R + 14 && B > 110;
      const cloud = Math.min(R, G, B) > 196 && Math.max(R, G, B) - Math.min(R, G, B) < 34;
      if (blue || cloud) { sky++; rows[y]++; if (y > lowest) lowest = y; }
    }
    let hz = 0;
    for (let y = 0; y < img.height; y++) if (rows[y] > img.width * 0.06) hz = y;
    return { pct: +(sky / n * 100).toFixed(2), skyBottom: hz, h: img.height };
  }, { b });
  console.log(f.split('/').slice(-2).join('/').padEnd(42), 'sky', String(r.pct).padStart(6) + '%', 'lowest sky row', r.skyBottom, '/', r.h);
}
await browser.close();
