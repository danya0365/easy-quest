/**
 * audio-probe.mjs — "ears" for agents that cannot hear.
 * Loads a page, calls  await window.__DQ.renderAudio(id, seconds)  which must return an AudioBuffer
 * (render it with an OfflineAudioContext), then writes:
 *   <out>/<id>.wav            — so a human can actually listen
 *   <out>/<id>-spectrogram.png — log-frequency spectrogram + waveform strip (Read it!)
 *   <out>/<id>.json           — peak/RMS dBFS, clipping %, silence %, loop-seam click, onset density
 * Usage: node tools/audio-probe.mjs --url http://localhost:8177/demos/P27.html --ids town,battle --seconds 30 --out shots/P27-audio
 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const URL_ = arg('url'); const OUT = path.resolve(arg('out', 'shots/audio'));
const IDS = String(arg('ids', '')).split(',').filter(Boolean); const SECS = Number(arg('seconds', 20));
if (!URL_ || !IDS.length) { console.log('need --url and --ids'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 520 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__DQ && window.__DQ.ready && typeof window.__DQ.renderAudio === "function"', null, { timeout: 30000 });
let fail = false;
for (const id of IDS) {
  const r = await page.evaluate(async ({ id, SECS }) => {
    const buf = await window.__DQ.renderAudio(id, SECS);
    if (!buf || !buf.getChannelData) return { error: 'renderAudio did not return an AudioBuffer' };
    const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels;
    const L = buf.getChannelData(0), R = ch > 1 ? buf.getChannelData(1) : L;
    const mono = new Float32Array(n); let peak = 0, sum = 0, clip = 0, silent = 0;
    for (let i = 0; i < n; i++) { const v = (L[i] + R[i]) / 2; mono[i] = v; const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (a > peak) peak = a; if (a >= 0.999) clip++; sum += v * v; }
    const win = Math.floor(sr * 0.05); let quietWins = 0, wins = 0; const env = [];
    for (let i = 0; i + win <= n; i += win) { let s = 0; for (let j = 0; j < win; j++) s += mono[i + j] ** 2; const rms = Math.sqrt(s / win);
      env.push(rms); wins++; if (rms < 0.003) quietWins++; }
    let onsets = 0; for (let i = 2; i < env.length; i++) if (env[i] > env[i - 1] * 1.6 && env[i] > 0.02) onsets++;
    const edge = Math.floor(sr * 0.02); let a = 0, b = 0; for (let j = 0; j < edge; j++) { a += mono[j] ** 2; b += mono[n - 1 - j] ** 2; }
    const seam = { firstVsLastSampleJump: +Math.abs(mono[0] - mono[n - 1]).toFixed(4), rmsStart20ms: +Math.sqrt(a / edge).toFixed(4), rmsEnd20ms: +Math.sqrt(b / edge).toFixed(4) };
    // spectrogram (log-frequency) + waveform
    const W = 1200, H = 520, SH = 420, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
    const N = 2048, hann = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    const fft = (re, im) => { const m = re.length; for (let i = 1, j = 0; i < m; i++) { let bit = m >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= m; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < m; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j];
          const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } };
    const img = g.createImageData(W, SH); const fMin = 40, fMax = Math.min(12000, sr / 2);
    for (let x = 0; x < W; x++) { const start = Math.floor((n - N) * x / W); if (start < 0) break;
      const re = new Float32Array(N), im = new Float32Array(N); for (let i = 0; i < N; i++) re[i] = mono[start + i] * hann[i]; fft(re, im);
      for (let y = 0; y < SH; y++) { const f = fMin * Math.pow(fMax / fMin, 1 - y / SH); const k = Math.round(f * N / sr);
        const mag = Math.hypot(re[k] || 0, im[k] || 0); const db = 20 * Math.log10(mag + 1e-9); const t = Math.max(0, Math.min(1, (db + 20) / 70));
        const p = (y * W + x) * 4; img.data[p] = 255 * Math.min(1, t * 2.2); img.data[p + 1] = 255 * Math.max(0, t * 1.6 - 0.45); img.data[p + 2] = 255 * (0.35 + 0.65 * (1 - t)) * (t > 0.02 ? 1 : 0.2); img.data[p + 3] = 255; } }
    g.putImageData(img, 0, 0);
    g.fillStyle = '#9fb4ff'; g.font = '12px monospace';
    for (const f of [110, 220, 440, 880, 1760, 3520, 7040]) { const y = SH * (1 - Math.log(f / fMin) / Math.log(fMax / fMin)); g.fillText(f + 'Hz', 4, y); g.fillRect(52, y, 6, 1); }
    g.strokeStyle = '#7ee08a'; g.beginPath(); for (let x = 0; x < W; x++) { let m = 0; const s0 = Math.floor(n * x / W), s1 = Math.floor(n * (x + 1) / W);
      for (let i = s0; i < s1; i++) m = Math.max(m, Math.abs(mono[i])); g.moveTo(x, SH + 50 - m * 48); g.lineTo(x, SH + 50 + m * 48); } g.stroke();
    g.fillStyle = '#fff'; g.fillText(`${id} · ${(n / sr).toFixed(1)}s · peak ${(20 * Math.log10(peak + 1e-9)).toFixed(1)} dBFS`, 70, 16);
    // wav (16-bit stereo)
    const bytes = new DataView(new ArrayBuffer(44 + n * 4)); const ws = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
    ws(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); ws(8, 'WAVEfmt '); bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
    bytes.setUint32(24, sr, true); bytes.setUint32(28, sr * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true); ws(36, 'data'); bytes.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    let bin = ''; const u8 = new Uint8Array(bytes.buffer); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    return { stats: { seconds: +(n / sr).toFixed(2), sampleRate: sr, peakDbfs: +(20 * Math.log10(peak + 1e-9)).toFixed(2), rmsDbfs: +(10 * Math.log10(sum / n + 1e-12)).toFixed(2),
      clippingPct: +(100 * clip / n).toFixed(3), silentPct: +(100 * quietWins / Math.max(1, wins)).toFixed(1), onsetsPerSec: +(onsets / (n / sr)).toFixed(2), seam },
      png: cv.toDataURL('image/png').split(',')[1], wav: btoa(bin) };
  }, { id, SECS }).catch(e => ({ error: String(e) }));
  if (r.error) { console.log(`✗ ${id}: ${r.error}`); fail = true; continue; }
  fs.writeFileSync(path.join(OUT, `${id}.wav`), Buffer.from(r.wav, 'base64'));
  fs.writeFileSync(path.join(OUT, `${id}-spectrogram.png`), Buffer.from(r.png, 'base64'));
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(r.stats, null, 2));
  const s = r.stats; const warn = [];
  if (s.clippingPct > 0.01) warn.push('CLIPPING'); if (s.peakDbfs > -0.5) warn.push('too hot'); if (s.rmsDbfs < -36) warn.push('very quiet');
  if (s.silentPct > 25) warn.push('lots of silence'); if (s.seam.firstVsLastSampleJump > 0.25 && s.seam.rmsStart20ms < 0.02) warn.push('possible loop click');
  console.log(`${warn.length ? '⚠' : '✓'} ${id}: ${JSON.stringify(s)} ${warn.join(', ')}\n   ${path.join(OUT, id + '-spectrogram.png')}\n   ${path.join(OUT, id + '.wav')}`);
}
if (errors.length) { console.log('page errors:\n - ' + errors.slice(0, 8).join('\n - ')); fail = true; }
await browser.close(); process.exit(fail ? 1 : 0);
