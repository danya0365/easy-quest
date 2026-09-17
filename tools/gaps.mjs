// Per-piece cumulative gap ledger. Critics append gaps; builders close them; later critics must re-check them.
//   node tools/gaps.mjs open  P07 "short title" "full buildable description"
//   node tools/gaps.mjs list  P07                 # all gaps with state
//   node tools/gaps.mjs fixed P07 3 "how it was verified"     # builder claims it closed
//   node tools/gaps.mjs verify P07 3 pass|fail "what the critic measured"
import fs from 'node:fs'; import path from 'node:path';
const DIR = path.resolve(import.meta.dirname, '../docs/gaps');
const f = (id) => path.join(DIR, `${id}.json`);
const load = (id) => fs.existsSync(f(id)) ? JSON.parse(fs.readFileSync(f(id), 'utf8')) : { id, gaps: [] };
const save = (d) => fs.writeFileSync(f(d.id), JSON.stringify(d, null, 2));
const [cmd, id, ...a] = process.argv.slice(2);
if (!cmd || !id) { console.log('usage: gaps.mjs open|list|fixed|verify <PIECE> ...'); process.exit(1) }
const d = load(id);
const now = new Date().toISOString();
if (cmd === 'open') {
  const g = { n: d.gaps.length + 1, title: a[0] || '', detail: a[1] || '', state: 'open', opened: now, events: [] };
  d.gaps.push(g); save(d); console.log(`${id} gap #${g.n} opened: ${g.title}`);
} else if (cmd === 'fixed') {
  const g = d.gaps.find(x => x.n === +a[0]); if (!g) { console.log('no such gap'); process.exit(1) }
  g.state = 'claimed-fixed'; g.events.push({ at: now, by: 'builder', note: a[1] || '' }); save(d);
  console.log(`${id} gap #${g.n} marked claimed-fixed (a critic must still verify it)`);
} else if (cmd === 'verify') {
  const g = d.gaps.find(x => x.n === +a[0]); if (!g) { console.log('no such gap'); process.exit(1) }
  const pass = a[1] === 'pass'; g.state = pass ? 'verified-fixed' : 'still-open';
  g.events.push({ at: now, by: 'critic', pass, note: a[2] || '' }); save(d);
  console.log(`${id} gap #${g.n} -> ${g.state}`);
} else {
  const open = d.gaps.filter(g => g.state !== 'verified-fixed');
  console.log(`# ${id} — ${d.gaps.length} gaps ever, ${open.length} not yet verified-fixed\n`);
  for (const g of d.gaps) console.log(`#${g.n} [${g.state}] ${g.title}\n    ${g.detail.slice(0, 400)}\n    ${g.events.map(e => (e.by === 'critic' ? (e.pass ? 'VERIFIED: ' : 'REJECTED: ') : 'builder: ') + String(e.note).slice(0, 160)).join('\n    ')}`);
}
