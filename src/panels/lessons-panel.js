// Onglet « Cours » : méthode, tactique, stratégie, finales, avec exercices interactifs.
import { LESSONS } from '../lessons-data.js';
import { ExerciseRunner, exStats } from '../exercise.js';
import { START_FEN } from '../core.js';

const CATS = ['Méthode', 'Tactique', 'Stratégie', 'Finales'];

export const lessonsPanel = {
  mount(el, app) {
    this.el = el;
    this.app = app;
    this.current = null;
    this.runner = new ExerciseRunner(app, {
      onStatus: (h) => { const s = this.el.querySelector('#ls-status'); if (s) s.innerHTML = h; },
      onDone: () => this.markDone(),
    });
  },
  show() { this.current ? this.renderLesson(this.current) : this.renderList(); },
  hide() { this.runner.stop(); },
  abort() { this.runner.stop(); },

  renderList() {
    this.runner.stop();
    this.current = null;
    const done = (l) => (l.exercises || []).length && l.exercises.every((_, i) => exStats[`${l.id}#${i}`] && exStats[`${l.id}#${i}`].ok);
    this.el.innerHTML = CATS.map((cat) => `
      <div class="card"><h2>${cat}</h2><div class="lesson-list">
        ${LESSONS.filter((l) => l.cat === cat).map((l) => `<div class="lesson-item" data-id="${l.id}">
          <div class="cat">${cat}${l.exercises ? ` · ${l.exercises.length} exercice(s)` : ''}${l.example ? ' · exemple' : ''}</div>
          ${done(l) ? '<span class="done">✔</span>' : ''}<b>${l.title}</b></div>`).join('')}
      </div></div>`).join('');
    this.el.querySelectorAll('.lesson-item').forEach((d) => (d.onclick = () => this.renderLesson(LESSONS.find((l) => l.id === d.dataset.id))));
  },

  renderLesson(l) {
    this.current = l;
    const ex = l.exercises || [];
    this.el.innerHTML = `
      <div class="card lesson-body">
        <div class="row" style="justify-content:space-between"><button id="ls-back" class="ghost">← Tous les cours</button><span class="small muted">${l.cat}</span></div>
        <h2 style="margin-top:8px">${l.title}</h2>
        ${l.body}
        ${l.example ? `<div class="row"><button id="ls-example" class="primary">Charger l'exemple et voir le plan</button></div>` : ''}
      </div>
      ${ex.length ? `<div class="card">
        <b>Exercices</b>
        <div class="row" style="margin:6px 0">${ex.map((e, i) => {
          const s = exStats[`${l.id}#${i}`];
          return `<button class="ex-btn" data-i="${i}">${s && s.ok ? '✔ ' : ''}${i + 1}. ${e.title}</button>`;
        }).join('')}</div>
        <div class="ex-box"><div id="ls-status" class="small">Choisissez un exercice. Jouez directement sur l'échiquier.</div>
          <div class="row" style="margin-top:6px"><button id="ls-hint">💡 Indice</button><button id="ls-sol">Solution</button><button id="ls-retry">↻ Recommencer</button><button id="ls-next">Suivant →</button></div>
        </div></div>` : ''}`;
    const $ = (s) => this.el.querySelector(s);
    $('#ls-back').onclick = () => this.renderList();
    if (l.example) $('#ls-example').onclick = () => {
      this.runner.stop();
      this.app.load(START_FEN, l.example.split(/\s+/));
      this.app.showTab('analysis');
    };
    this.el.querySelectorAll('.ex-btn').forEach((b) => (b.onclick = () => this.startEx(+b.dataset.i)));
    if (ex.length) {
      $('#ls-hint').onclick = () => this.runner.hint();
      $('#ls-sol').onclick = () => this.runner.showSolution();
      $('#ls-retry').onclick = () => this.startEx(this.exIdx ?? 0);
      $('#ls-next').onclick = () => this.startEx(((this.exIdx ?? -1) + 1) % ex.length);
    }
  },

  startEx(i) {
    const l = this.current;
    this.exIdx = i;
    this.el.querySelectorAll('.ex-btn').forEach((b) => (b.style.borderColor = +b.dataset.i === i ? 'var(--accent)' : ''));
    this.runner.start({ ...l.exercises[i], id: `${l.id}#${i}` });
  },

  markDone() {
    const l = this.current;
    if (!l) return;
    this.el.querySelectorAll('.ex-btn').forEach((b) => {
      const s = exStats[`${l.id}#${b.dataset.i}`];
      b.textContent = `${s && s.ok ? '✔ ' : ''}${+b.dataset.i + 1}. ${l.exercises[+b.dataset.i].title}`;
    });
  },
};
