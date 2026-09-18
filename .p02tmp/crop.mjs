import { chromium } from 'playwright';
import fs from 'node:fs';
const [,, src, out, x, y, w, h, scale] = process.argv;
const b = fs.readFileSync(src).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body style="margin:0"><canvas id=c></canvas></body>');
const data = await page.evaluate(async ({ b, x, y, w, h, s }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b;
  await img.decode();
  const c = document.getElementById('c'); c.width = w * s; c.height = h * s;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, w, h, 0, 0, w * s, h * s);
  return c.toDataURL('image/png');
}, { b, x: +x, y: +y, w: +w, h: +h, s: +(scale || 3) });
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', out);
