// Onglet « Ouvertures » : coups les plus joués à mon niveau vs niveau supérieur, avec recommandations.
import { compare, explore, total, scoreFor, ExplorerError } from '../explorer.js';
import { settings, myBand, higherBands, bandLabel } from '../settings.js';
import { setMine, mineAt, removeMine } from '../repertoire.js';
import { fmtScore } from '../engine.js';
import { SIDE } from '../core.js';

const pct = (x) => (x == null ? '—' : (x * 100).toFixed(0) + '%');
const wdl = (x) => {
  const n = total(x);
  if (!n) return '<div class="wdl"></div>';
  const w = (x.white / n) * 100, d = (x.draws / n) * 100, b = (x.black / n) * 100;
  return `<div class="wdl"><span class="w" style="width:${w}%">${w > 14 ? w.toFixed(0) : ''}</span><span class="d" style="width:${d}%">${d > 14 ? d.toFixed(0) : ''}</span><span class="b" style="width:${b}%">${b > 14 ? b.toFixed(0) : ''}</span></div>`;
};
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n));
const BADGE = {
  best: '<span class="badge best" title="Meilleur compromis score/popularité aux niveaux supérieurs">★ conseillé</span>',
  trap: '<span class="badge trap" title="Souvent joué à votre niveau mais il perd des points : apprenez la punition">piège</span>',
  weapon: '<span class="badge weapon" title="Peu joué à votre niveau mais il marque beaucoup : effet de surprise">arme</span>',
  'pop-high': '<span class="badge pop" title="Bien plus joué par les joueurs plus forts">choix des forts</span>',
};

export const explorerPanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.mode = 'compare';
    this.req = 0;
  },
  show() { this.position(this.app.fen()); },
  position(fen) { this.render(fen); },
  eval() { this.paintEngine(); },

  async render(fen) {
    const id = ++this.req;
    const color = fen.split(' ')[1];
    const myColor = settings.color;
    this.el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Explorateur d'ouvertures</h2>
          <div class="row">
            <select id="ex-mode">
              <option value="compare" ${this.mode === 'compare' ? 'selected' : ''}>Mon niveau vs supérieur</option>
              <option value="masters" ${this.mode === 'masters' ? 'selected' : ''}>Parties de maîtres</option>
            </select>
          </div>
        </div>
        <p class="small muted">Mon niveau : <b>${bandLabel([myBand()])}</b> · supérieur : <b>${bandLabel(higherBands())}</b> · cadences : ${settings.speeds.join(', ')} · je joue les <b>${SIDE[myColor]}</b> (⚙ pour changer)</p>
        <div id="ex-advice"></div>
        <div id="ex-body"><p class="muted">Chargement…</p></div>
      </div>
      <div class="card small">
        <b>Comment lire ce tableau ?</b>
        <ul style="margin:4px 0;padding-left:18px">
          <li><b>% joué</b> : fréquence du coup dans la tranche Elo. À votre tour, ce que les forts jouent ; au tour adverse, ce que <i>vos</i> adversaires joueront.</li>
          <li><b>Score</b> : points marqués par le camp qui joue le coup (victoire 1, nulle ½).</li>
          <li><b>★ conseillé</b> : bon score au niveau supérieur ET à votre niveau, avec assez de parties. <b>piège</b> : coup populaire chez vous qui perd des points, c'est là que vous gagnerez des parties.</li>
        </ul>
      </div>`;
    this.el.querySelector('#ex-mode').onchange = (e) => { this.mode = e.target.value; this.render(this.app.fen()); };

    try {
      if (this.mode === 'masters') {
        const data = await explore(fen, { db: 'masters' });
        if (id !== this.req) return;
        this.renderMasters(data, fen);
      } else {
        const cmp = await compare(fen);
        if (id !== this.req) return;
        this.cmp = cmp;
        this.renderCompare(cmp, fen, myColor);
      }
    } catch (e) {
      if (id !== this.req) return;
      this.el.querySelector('#ex-body').innerHTML = `<p class="err">${e instanceof ExplorerError ? e.message : 'Erreur : ' + e.message}</p>
        <p class="small muted">L'explorateur a besoin d'internet (explorer.lichess.ovh). Le scanner, le moteur et les cours fonctionnent hors ligne.</p>`;
    }
  },

  renderCompare(cmp, fen, myColor) {
    const { my, high, rows, color } = cmp;
    const opening = (high && high.opening) || my.opening;
    document.getElementById('opening-name').textContent = opening ? `${opening.eco} · ${opening.name}` : '';
    const mine = mineAt(myColor, fen);
    const body = this.el.querySelector('#ex-body');
    if (!rows.length) {
      body.innerHTML = `<p class="muted">Aucune partie dans cette position pour ces filtres : vous êtes sorti de la théorie pratique. Passez à l'onglet <b>Scanner &amp; Plan</b> pour savoir quoi faire.</p>`;
      this.app.setShapes([]);
      return;
    }
    body.innerHTML = `
      <p class="small">Parties : <b>${fmtN(total(my))}</b> à mon niveau · <b>${fmtN(total(high))}</b> au niveau supérieur</p>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Coup</th><th title="Fréquence à mon niveau">% moi</th><th>Score moi</th><th title="Fréquence au niveau supérieur">% sup.</th><th>Score sup.</th><th>Blancs/Nulles/Noirs (sup.)</th><th>SF</th>${color === myColor ? '<th></th>' : ''}</tr></thead>
        <tbody>${rows.slice(0, 14).map((r) => `
          <tr data-uci="${r.uci}">
            <td><b>${r.san}</b>${r.badges.map((b) => BADGE[b]).join('')}${mine && mine.uci === r.uci ? '<span class="badge rep">répertoire</span>' : ''}</td>
            <td>${pct(r.myShare)}</td><td>${pct(r.myScore)}</td>
            <td>${pct(r.highShare)}</td><td>${pct(r.highScore)}</td>
            <td>${wdl(r.high || r.my)}</td>
            <td class="sf" data-uci="${r.uci}"></td>
            ${color === myColor ? `<td><button class="ghost add" data-uci="${r.uci}" data-san="${r.san}" title="Mettre ce coup dans mon répertoire">${mine && mine.uci === r.uci ? '✓' : '+'}</button></td>` : ''}
          </tr>`).join('')}
        </tbody></table></div>`;
    body.querySelectorAll('tbody tr').forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('button')) this.app.play(tr.dataset.uci); }));
    body.querySelectorAll('button.add').forEach((b) => (b.onclick = () => {
      if (mine && mine.uci === b.dataset.uci) removeMine(myColor, fen);
      else setMine(myColor, fen, b.dataset.uci, b.dataset.san);
      this.render(fen);
    }));
    this.renderAdvice(cmp, fen, myColor);
    this.paintEngine();
    // Flèches : coup conseillé en vert, pièges en rouge, autres fréquents en bleu pâle
    const shapes = [];
    for (const r of rows.slice(0, 5)) {
      const brush = r.badges.includes('best') ? 'green' : r.badges.includes('trap') ? 'red' : 'paleBlue';
      shapes.push({ orig: r.uci.slice(0, 2), dest: r.uci.slice(2, 4), brush });
    }
    this.app.setShapes(shapes);
  },

  renderAdvice(cmp, fen, myColor) {
    const { rows, best, color } = cmp;
    const adv = this.el.querySelector('#ex-advice');
    const hb = bandLabel(higherBands());
    let html = '';
    if (color === myColor) {
      if (best) {
        html += `<p>👉 <b>Coup conseillé : ${best.san}</b> — les ${hb} marquent ${pct(best.highScore)} avec, vous (${bandLabel([myBand()])}) ${pct(best.myScore)}.</p>`;
      }
      const popularBad = rows.filter((r) => r.badges.includes('trap'));
      if (popularBad.length) html += `<p class="small">⚠ À éviter : ${popularBad.map((r) => `<b>${r.san}</b> (${pct(r.myScore)})`).join(', ')} : populaire à votre niveau mais il perd des points.</p>`;
    } else {
      const top = rows.filter((r) => r.myShare >= 0.05).slice(0, 4);
      html += `<p>🎯 <b>Ce que vos adversaires jouent ici :</b> ${top.map((r) => `${r.san} (${pct(r.myShare)})`).join(', ') || '—'}.</p>`;
      const errors = rows.filter((r) => r.myShare >= 0.05 && r.myScore != null && r.myScore < 0.45 && total(r.my) >= settings.minGames);
      if (errors.length) html += `<p class="small">💡 <b>Erreurs fréquentes adverses</b> : ${errors.map((r) => `<b>${r.san}</b> (ils ne marquent que ${pct(r.myScore)})`).join(', ')}. Cliquez dessus pour apprendre la punition.</p>`;
    }
    adv.innerHTML = html;
  },

  renderMasters(data, fen) {
    const color = fen.split(' ')[1];
    const body = this.el.querySelector('#ex-body');
    document.getElementById('opening-name').textContent = data.opening ? `${data.opening.eco} · ${data.opening.name}` : '';
    const n = total(data);
    body.innerHTML = `<p class="small">Parties de maîtres (OTB, 2200+ FIDE) : <b>${fmtN(n)}</b></p>
      <table class="tbl"><thead><tr><th>Coup</th><th>Parties</th><th>%</th><th>Score</th><th>B/N/N</th><th>Elo moy.</th></tr></thead>
      <tbody>${data.moves.map((m) => `<tr data-uci="${m.uci}"><td><b>${m.san}</b></td><td>${fmtN(total(m))}</td><td>${pct(total(m) / n)}</td><td>${pct(scoreFor(m, color))}</td><td>${wdl(m)}</td><td>${m.averageRating || ''}</td></tr>`).join('')}</tbody></table>`;
    body.querySelectorAll('tbody tr').forEach((tr) => (tr.onclick = () => this.app.play(tr.dataset.uci)));
    this.app.setShapes(data.moves.slice(0, 3).map((m, i) => ({ orig: m.uci.slice(0, 2), dest: m.uci.slice(2, 4), brush: i ? 'paleBlue' : 'blue' })));
  },

  paintEngine() {
    const ev = this.app.lastEval;
    if (!ev || ev.fen !== this.app.fen()) return;
    for (const td of this.el.querySelectorAll('td.sf')) {
      const l = ev.lines.find((x) => x.pv[0] === td.dataset.uci);
      td.textContent = l ? fmtScore(l.score) : '';
    }
  },
};
