// Onglet « Mon répertoire » : construction automatique, arbre, export PGN, entraînement par répétition espacée.
import { Chess } from 'chess.js';
import { START_FEN } from '../core.js';
import { settings, bandLabel, myBand, higherBands } from '../settings.js';
import { buildRepertoire, treeOf, toPgn, clearRep, pickLine, lineId, srsUpdate, srsStats, linesOf } from '../repertoire.js';
import { ExplorerError } from '../explorer.js';

const pct = (x) => (x == null ? '' : (x * 100).toFixed(0) + '%');

export const repertoirePanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.color = settings.color;
    this.drill = null;
  },
  show() { this.render(); },
  hide() { this.stopDrill(); },
  abort() { this.stopDrill(); },

  render() {
    const st = srsStats(this.color);
    this.el.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Mon répertoire</h2>
          <select id="rp-color"><option value="w" ${this.color === 'w' ? 'selected' : ''}>avec les Blancs</option><option value="b" ${this.color === 'b' ? 'selected' : ''}>avec les Noirs</option></select>
        </div>
        <p class="small muted">Arbre généré depuis Lichess : à votre tour, le coup qui marque le mieux chez les ${bandLabel(higherBands())} (et à votre niveau) ; au tour adverse, les réponses qui couvrent la majorité des parties à votre niveau (${bandLabel([myBand()])}).</p>
        <details ${linesOf(this.color).length ? '' : 'open'}><summary><b>⚙ Construire / compléter automatiquement</b></summary>
          <div class="row" style="margin-top:8px">
            <label class="small">Profondeur (demi-coups) <input id="rp-ply" type="number" min="4" max="30" value="14" style="width:60px"></label>
            <label class="small">Couverture adverse <input id="rp-cov" type="number" min="50" max="99" value="80" style="width:60px">%</label>
            <label class="small">Réponses max <input id="rp-max" type="number" min="1" max="8" value="3" style="width:50px"></label>
            <label class="small">Positions max <input id="rp-nodes" type="number" min="10" max="600" value="120" style="width:60px"></label>
          </div>
          <label class="small"><input type="checkbox" id="rp-fromcur"> partir de la position actuelle de l'échiquier (sinon : position initiale)</label>
          <div class="row" style="margin-top:6px">
            <button class="primary" id="rp-build">Construire</button>
            <button id="rp-stop" disabled>Arrêter</button>
            <button id="rp-clear" class="ghost">Effacer ce répertoire</button>
          </div>
          <div class="progress"><div id="rp-prog"></div></div>
          <div id="rp-status" class="small muted"></div>
          <p class="small muted">Astuce : dans l'onglet Ouvertures, le bouton « + » d'une ligne force votre propre choix ; la construction le respecte.</p>
        </details>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <b>Entraînement (répétition espacée)</b>
          <span class="small muted">${st.total} lignes · ${st.due} à réviser · ${st.mastered} maîtrisées</span>
        </div>
        <p class="small">L'adversaire joue ses coups fréquents ; vous devez retrouver le vôtre. Les lignes ratées reviennent plus souvent.</p>
        <div class="row"><button class="primary" id="rp-drill" ${st.total ? '' : 'disabled'}>${this.drill ? 'Ligne suivante' : 'Commencer'}</button><button id="rp-drill-stop" ${this.drill ? '' : 'disabled'}>Stop</button></div>
        <div id="rp-drill-msg" class="ex-box" style="display:${this.drill ? 'block' : 'none'}"></div>
      </div>
      <div class="card">
        <div class="row" style="justify-content:space-between"><b>Arbre</b><span class="row"><button id="rp-pgn">Exporter PGN</button><button id="rp-copy">Copier</button></span></div>
        <div id="rp-tree" class="tree"></div>
      </div>`;
    const $ = (s) => this.el.querySelector(s);
    $('#rp-color').onchange = (e) => { this.color = e.target.value; this.app.board.setOrientation(this.color); this.render(); };
    $('#rp-build').onclick = () => this.build();
    $('#rp-stop').onclick = () => this.ctrl && this.ctrl.abort();
    $('#rp-clear').onclick = () => { if (confirm('Effacer tout le répertoire ' + (this.color === 'w' ? 'Blancs' : 'Noirs') + ' ?')) { clearRep(this.color); this.render(); } };
    $('#rp-pgn').onclick = () => {
      const blob = new Blob([toPgn(this.color)], { type: 'application/x-chess-pgn' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `repertoire-${this.color === 'w' ? 'blancs' : 'noirs'}.pgn`;
      a.click();
    };
    $('#rp-copy').onclick = async () => { try { await navigator.clipboard.writeText(toPgn(this.color)); this.app.toast('PGN copié'); } catch { this.app.toast('Copie impossible'); } };
    $('#rp-drill').onclick = () => this.startDrill();
    $('#rp-drill-stop').onclick = () => { this.stopDrill(); this.render(); };
    this.renderTree();
  },

  renderTree() {
    const roots = treeOf(this.color);
    const box = this.el.querySelector('#rp-tree');
    if (!roots.length) { box.innerHTML = '<p class="muted small">Vide : lancez une construction ou ajoutez des coups depuis l\'onglet Ouvertures.</p>'; return; }
    const path = [];
    const li = (n, ply) => {
      const num = ply % 2 === 0 ? `${ply / 2 + 1}.` : `${(ply + 1) / 2}…`;
      const meta = n.mine
        ? (n.info.highScore != null ? `sup. ${pct(n.info.highScore)}` : 'choix perso')
        : `${pct(n.info.share)} des parties${n.info.score != null && n.info.score < 0.45 ? ' · <span style="color:var(--good)">erreur fréquente !</span>' : ''}`;
      const kids = n.children.length ? `<ul>${n.children.map((c) => li(c, ply + 1)).join('')}</ul>` : '';
      const moves = JSON.stringify(n._path).replace(/"/g, '&quot;');
      return `<li><span class="node ${n.mine ? 'mine' : ''}" data-path="${moves}">${num} ${n.san}</span><span class="meta">${meta}</span>${kids}</li>`;
    };
    const annotate = (nodes, p) => { for (const n of nodes) { n._path = [...p, n.san]; annotate(n.children, n._path); } };
    annotate(roots, path);
    box.innerHTML = `<ul>${roots.map((r) => li(r, 0)).join('')}</ul>`;
    box.querySelectorAll('.node').forEach((s) => (s.onclick = () => { if (!this.drill) this.app.load(START_FEN, JSON.parse(s.dataset.path)); }));
  },

  async build() {
    const $ = (s) => this.el.querySelector(s);
    const opts = {
      maxPly: +$('#rp-ply').value, coverage: +$('#rp-cov').value / 100, maxReplies: +$('#rp-max').value, maxNodes: +$('#rp-nodes').value,
      startFen: $('#rp-fromcur').checked ? this.app.fen() : START_FEN,
    };
    this.ctrl = new AbortController();
    $('#rp-build').disabled = true; $('#rp-stop').disabled = false;
    try {
      const n = await buildRepertoire(this.color, opts, (p) => {
        $('#rp-prog').style.width = Math.min(100, (p.done / p.maxNodes) * 100) + '%';
        $('#rp-status').textContent = `${p.done} positions analysées, ${p.queued} en attente…`;
        if (p.done % 5 === 0) this.renderTree();
      }, this.ctrl.signal);
      this.app.toast(`Répertoire construit (${n} positions)`);
    } catch (e) {
      $('#rp-status').innerHTML = `<span class="err">${e instanceof ExplorerError ? e.message : e.message}</span>`;
      return;
    } finally {
      $('#rp-build').disabled = false; $('#rp-stop').disabled = true;
    }
    this.render();
  },

  // --- Entraînement ---
  startDrill() {
    const line = pickLine(this.color);
    if (!line) return;
    this.app.claimEngine('repertoire');
    this.drill = { line, i: 0, errors: 0, id: lineId(this.color, line) };
    this.app.board.setOrientation(this.color);
    this.app.load(START_FEN);
    this.app.interceptor = (uci) => this.onDrillMove(uci);
    this.render();
    this.msg(`Ligne de ${line.length} demi-coups. À vous !`);
    this.advance();
  },
  msg(html) { const m = this.el.querySelector('#rp-drill-msg'); if (m) { m.style.display = 'block'; m.innerHTML = html; } },
  advance() {
    const d = this.drill;
    if (!d) return;
    if (d.i >= d.line.length) {
      const ok = d.errors === 0;
      srsUpdate(d.id, ok);
      this.msg(ok ? '<span class="status-ok">✔ Ligne parfaite !</span> Elle reviendra plus tard.' : `<span class="status-ko">${d.errors} erreur(s)</span> : cette ligne reviendra vite.`);
      this.app.interceptor = null;
      this.app.claimEngine(null);
      this.drill = null;
      setTimeout(() => this.render(), 50);
      setTimeout(() => this.msg(ok ? '<span class="status-ok">✔ Ligne parfaite !</span>' : `<span class="status-ko">${d.errors} erreur(s)</span> : à revoir.`), 60);
      return;
    }
    const n = d.line[d.i];
    if (!n.mine) {
      setTimeout(() => { if (this.drill !== d) return; this.app.play(n.uci); d.i++; this.advance(); }, 450);
    }
  },
  onDrillMove(uci) {
    const d = this.drill;
    const n = d.line[d.i];
    if (!n || !n.mine) { this.app.refresh(); return; }
    const c = new Chess(this.app.fen());
    let san = null;
    try { san = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { /* illégal */ }
    if (san === n.san) {
      this.app.play(uci);
      d.i++;
      this.msg('✔ ' + san);
      this.advance();
    } else {
      d.errors++;
      this.app.refresh();
      this.app.setShapes([{ orig: n.uci.slice(0, 2), dest: n.uci.slice(2, 4), brush: 'green' }]);
      this.msg(`<span class="status-ko">✘ ${san || 'coup'}</span> — votre répertoire joue <b>${n.san}</b>. Jouez-le pour continuer.`);
    }
  },
  stopDrill() {
    if (!this.drill) return;
    this.drill = null;
    this.app.interceptor = null;
    this.app.claimEngine(null);
  },
};
