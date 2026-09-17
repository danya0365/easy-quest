# How to run and SEE the game (every agent must do this)

A static server is already running: **http://localhost:8177/**  (project root = document root).
If a fetch to it fails, start one yourself: `node tools/server.mjs 8177 &` (safe to fail if already bound).

- Full game:  http://localhost:8177/index.html
- Your piece's isolated demo: http://localhost:8177/demos/<PIECE_ID>.html
- Live progress page: http://localhost:8177/progress.html

## Look at it with real eyes
```bash
node tools/shoot.mjs --url http://localhost:8177/demos/P07.html --out shots/P07-r1 --script scenarios/P07.json
```
Then **actually Read the .png files** with the Read tool. You are not allowed to conclude anything about how
the game looks without having opened the images. `report.json` in the out dir has console errors, page errors,
failed requests, fps, failed assertions, and the final `__DQ.state()` dump.

Scenario file (`scenarios/<ID>.json`) — you own yours, never edit another's:
```json
{ "name":"P07 characters", "steps":[
  {"waitFor":"window.__DQ && __DQ.ready","timeout":30000},
  {"wait":700}, {"shot":"hero-front"},
  {"eval":"__DQ.pose('walk')"}, {"burst":{"name":"walk","count":8,"interval":90}},
  {"eval":"__DQ.cameraOrbit(180)"}, {"wait":400}, {"shot":"hero-back"},
  {"assert":"__DQ.errors.length===0","msg":"no runtime errors"} ]}
```
Steps: `wait` `waitFor` `eval` `key`(+`hold`) `press`(+`times`,`delay`) `shot` `burst` `assert` `note`.
Exit code is non-zero if there were console/page errors or failed assertions — **that means you are not done.**

## Your definition of done
1. `node tools/shoot.mjs` on your demo AND on `/index.html` exits 0.
2. You have opened the screenshots and they look like Dragon Quest V, not like a tech demo.
3. `docs/DQV-RUBRIC.md` checkboxes for your dimension are honestly all ticked.
4. You updated the ledger: `node tools/progress.mjs set <ID> building 0 "<one line>"`.

## Report format (your final text IS the return value — return JSON only)
```json
{ "id":"P07", "summary":"one paragraph of what now exists",
  "files":["src/art/chars.js","demos/P07.html","scenarios/P07.json"],
  "demoUrl":"http://localhost:8177/demos/P07.html",
  "shots":["shots/P07-r1/01-hero-front.png"],
  "selfScore":72, "knownGaps":["..."], "needs":["field.js should call Chars.build(...)"] }
```

## Hearing it (audio pieces) — agents cannot hear, so measure and LOOK
A page that makes sound must expose `__DQ.renderAudio(id, seconds) -> Promise<AudioBuffer>` (render with an
OfflineAudioContext using the exact same synth graph the game uses live).
```bash
node tools/audio-probe.mjs --url http://localhost:8177/demos/P27.html --ids town,battle --seconds 30 --out shots/P27-audio
```
Writes `<id>.wav` (a human can listen), `<id>-spectrogram.png` (log-frequency + waveform — **Read it**), and
`<id>.json` (peak/RMS dBFS, clipping %, silence %, loop-seam jump, onset density). Judge melody by reading the note
data itself; judge timbre/mix/dynamics by the spectrogram (harmonic ladders, vibrato wiggle, reverb tails, where
the energy sits) and the numbers.
