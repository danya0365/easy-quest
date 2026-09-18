// Luminance statistics in a screen rect: macro SD and micro (3x3 high-pass) SD — the numbers the critic used.
import { chromium } from 'playwright';
import fs from 'node:fs';
const args = process.argv.slice(2);
const src = args[0];
const rects = JSON.parse(args[1]);   // [{name,x,y,w,h}, ...]
const b = fs.readFileSync(src).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body><canvas id=c></canvas></body>');
const out = await page.evaluate(async ({ b, rects }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
  const c = document.getElementById('c'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const res = [];
  for (const r of rects) {
    const d = g.getImageData(r.x, r.y, r.w, r.h).data;
    const L = new Float64Array(r.w * r.h);
    for (let i = 0; i < r.w * r.h; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    let m = 0; for (const v of L) m += v; m /= L.length;
    let s = 0; for (const v of L) s += (v - m) * (v - m); s = Math.sqrt(s / L.length);
    // micro: 3x3 box high-pass
    let ms = 0, mm = 0, n = 0;
    const hp = [];
    for (let y = 1; y < r.h - 1; y++) for (let x = 1; x < r.w - 1; x++) {
      let a = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += L[(y + j) * r.w + (x + i)];
      const v = L[y * r.w + x] - a / 9; hp.push(v); mm += v; n++;
    }
    mm /= n || 1; for (const v of hp) ms += (v - mm) * (v - mm); ms = Math.sqrt(ms / (n || 1));
    res.push({ name: r.name, mean: +m.toFixed(2), macroSD: +s.toFixed(2), microSD: +ms.toFixed(2) });
  }
  return res;
}, { b, rects });
await browser.close();
console.log(JSON.stringify(out, null, 1));
