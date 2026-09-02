// Progress ledger. Usage:
//   node tools/progress.mjs set P07 building 0 "note"
//   node tools/progress.mjs score P07 74 "critic gap text"
//   node tools/progress.mjs wave 3 "Wave 3: battle + monsters"
//   node tools/progress.mjs log "free text event"
import fs from 'node:fs'; import path from 'node:path';
const F = path.resolve(import.meta.dirname, '../docs/progress.json');
const db = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8'))
  : { updated: '', wave: 0, waveTitle: '', pieces: {}, events: [] };
const [cmd, ...a] = process.argv.slice(2);
const now = new Date().toISOString();
const P = (id) => (db.pieces[id] ||= { id, status: 'todo', score: 0, best: 0, rounds: 0, gap: '', note: '', history: [] });
if (cmd === 'set') { const p = P(a[0]); p.status = a[1] || p.status; if (a[2]) p.score = +a[2]; if (a[3]) p.note = a[3]; }
else if (cmd === 'score') {
  const p = P(a[0]); p.score = +a[1]; p.best = Math.max(p.best, +a[1]); p.rounds++;
  p.gap = a[2] || ''; p.status = +a[1] >= 85 ? 'passed' : 'iterating';
  p.history.push({ at: now, score: +a[1], gap: (a[2] || '').slice(0, 200) });
} else if (cmd === 'name') { P(a[0]).name = a.slice(1).join(' '); }
else if (cmd === 'wave') { db.wave = +a[0]; db.waveTitle = a.slice(1).join(' '); db.events.push({ at: now, t: `— Wave ${a[0]}: ${a.slice(1).join(' ')} —` }); }
else if (cmd === 'log') { db.events.push({ at: now, t: a.join(' ') }); }
else { console.log('cmds: set|score|name|wave|log'); process.exit(1); }
db.updated = now;
db.events = db.events.slice(-300);
fs.writeFileSync(F, JSON.stringify(db, null, 2));
console.log('progress updated:', cmd, a[0] || '');
