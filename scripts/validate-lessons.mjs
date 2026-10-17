// Vérifie chaque exercice : légalité (chess.js) et qualité des coups de solution (Stockfish).
// Usage : npm run validate
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { ALL_EXERCISES, LESSONS } from '../src/lessons-data.js';

const SF = fileURLToPath(new URL('../node_modules/stockfish/bin/stockfish-19-lite-single.js', import.meta.url));

class UciEngine {
  constructor() {
    this.p = spawn(process.execPath, [SF], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.waiters = [];
    createInterface({ input: this.p.stdout }).on('line', (l) => { for (const w of [...this.waiters]) w(l); });
  }
  send(c) { this.p.stdin.write(c + '\n'); }
  waitFor(pred) {
    return new Promise((res) => { const w = (l) => { if (pred(l)) { this.waiters.splice(this.waiters.indexOf(w), 1); res(l); } }; this.waiters.push(w); });
  }
  async init() { this.send('uci'); await this.waitFor((l) => l === 'uciok'); this.send('isready'); await this.waitFor((l) => l === 'readyok'); }
  /** Renvoie {best, score:{cp|mate}} du point de vue du camp au trait. */
  async analyse(fen, depth = 16, multipv = 1) {
    const lines = [];
    const collect = (l) => {
      if (!l.startsWith('info') || !l.includes(' pv ')) return;
      const t = l.split(' ');
      const mpv = +(t[t.indexOf('multipv') + 1] || 1);
      const si = t.indexOf('score');
      lines[mpv - 1] = { pv: t.slice(t.indexOf('pv') + 1), score: t[si + 1] === 'mate' ? { mate: +t[si + 2] } : { cp: +t[si + 2] } };
    };
    this.waiters.push(collect);
    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    const bm = await this.waitFor((l) => l.startsWith('bestmove'));
    this.waiters.splice(this.waiters.indexOf(collect), 1);
    return { best: bm.split(' ')[1], lines };
  }
  quit() { this.send('quit'); this.p.kill(); }
}

const cp = (s) => (s.mate != null ? (s.mate > 0 ? 10000 - s.mate : -10000 - s.mate) : s.cp);

function startPosition(ex) {
  const c = new Chess(ex.fen || undefined);
  if (ex.moves) for (const m of ex.moves.split(/\s+/)) c.move(m);
  return c;
}

const eng = new UciEngine();
await eng.init();
let failures = 0;

for (const l of LESSONS) {
  if (!l.example) continue;
  try { const c = new Chess(); for (const m of l.example.split(/\s+/)) c.move(m); } catch (e) { failures++; console.log(`✘ exemple ${l.id} : ${e.message}`); }
}

for (const ex of ALL_EXERCISES) {
  let c;
  try { c = startPosition(ex); } catch (e) { failures++; console.log(`✘ ${ex.id} position invalide : ${e.message}`); continue; }
  const problems = [];
  if (ex.type === 'line') {
    for (let i = 0; i < ex.solution.length; i++) {
      const fen = c.fen();
      let m;
      try { m = c.move(ex.solution[i]); } catch { problems.push(`coup illégal ${ex.solution[i]} (n°${i + 1})`); break; }
      if (i % 2 === 1) continue; // coup adverse : on ne juge pas
      const r = await eng.analyse(fen, 18);
      const best = r.lines[0];
      const uci = m.from + m.to + (m.promotion || '');
      if (r.best === uci) continue;
      // Coup différent du moteur : on tolère s'il est presque aussi bon.
      const after = await eng.analyse(c.fen(), 16);
      const mine = -cp(after.lines[0]?.score ?? { cp: 0 });
      const diff = cp(best.score) - mine;
      if (m.san.includes('#')) continue;
      if (diff > 60 && !(cp(best.score) > 9000 && mine > 9000)) problems.push(`${m.san} n'est pas le meilleur (moteur : ${r.best}, écart ${diff}cp)`);
    }
    if (!problems.length && ex.solution.at(-1).includes('#') && !c.isCheckmate()) problems.push('la ligne devait finir par un mat');
  } else if (ex.type === 'best') {
    const r = await eng.analyse(c.fen(), 18, 3);
    console.log(`  · ${ex.id} meilleurs coups : ${r.lines.map((x) => x.pv[0] + ' (' + (x.score.mate != null ? '#' + x.score.mate : x.score.cp) + ')').join(', ')}`);
  } else if (ex.type === 'play') {
    const r = await eng.analyse(c.fen(), 20);
    const s = cp(r.lines[0].score);
    if (ex.goal === 'draw' && Math.abs(s) > 150) problems.push(`objectif nulle mais éval ${s}`);
    if ((ex.goal === 'win' || ex.goal === 'mate') && s < 300) problems.push(`objectif gain mais éval ${s}`);
    console.log(`  · ${ex.id} éval initiale ${s}`);
  }
  if (problems.length) { failures++; console.log(`✘ ${ex.id} « ${ex.title} » : ${problems.join(' ; ')}`); }
  else console.log(`✔ ${ex.id} « ${ex.title} »`);
}
eng.quit();
console.log(failures ? `\n${failures} problème(s)` : '\nTous les exercices sont valides.');
process.exit(failures ? 1 : 0);
