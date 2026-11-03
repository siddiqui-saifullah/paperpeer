import { html } from '../core/html.js';
import { icon } from './icons.js';

// Editable list of questions (label, topic, marks) with a running total.
// Used when creating an exam and on the exam's Questions tab.

const row = (q, i) => html`<div class="qb-row" data-q>
  <input type="text" class="input-sm" data-f="label" value="${q.label || `Q${i + 1}`}" maxlength="40" aria-label="Question label" />
  <input type="text" class="input-sm" data-f="topic" value="${q.topic || ''}" maxlength="60" placeholder="Topic, e.g. Quadratic equations" aria-label="Topic" list="topic-names" />
  <input type="number" class="input-sm" data-f="maxMarks" value="${q.maxMarks ?? ''}" min="0.5" step="any" inputmode="decimal" placeholder="Marks" aria-label="Marks" />
  <button class="icon-btn" type="button" data-remove-q aria-label="Remove question">${icon('x')}</button>
</div>`;

export const questionBuilder = (questions, { locked = false } = {}) => html`
  <div class="qbuilder" id="qbuilder">
    <div class="qb-row qb-head"><span>Label</span><span>Topic</span><span>Marks</span><span></span></div>
    <div class="stack tight" data-q-list>${questions.map(row)}</div>
    ${!locked && html`<div><button class="btn sm" type="button" data-add-q>${icon('plus')}Add question</button></div>`}
    <div class="qb-total"><span class="muted">Total marks</span><b class="num" data-q-total>0</b></div>
    <datalist id="topic-names"></datalist>
  </div>`;

export function readQuestions(scope) {
  return [...scope.querySelectorAll('[data-q]')].map((r) => ({
    label: r.querySelector('[data-f=label]').value.trim(),
    topic: r.querySelector('[data-f=topic]').value.trim(),
    maxMarks: r.querySelector('[data-f=maxMarks]').value,
  }));
}

export function bindQuestionBuilder(scope, { locked = false, onTotal } = {}) {
  const box = scope.querySelector('#qbuilder');
  if (!box) return;
  const list = box.querySelector('[data-q-list]');
  const total = () => {
    const sum = readQuestions(box).reduce((n, q) => n + (Number(q.maxMarks) || 0), 0);
    box.querySelector('[data-q-total]').textContent = Math.round(sum * 100) / 100;
    // Topics typed so far become suggestions for the next rows.
    box.querySelector('#topic-names').innerHTML = html`${[...new Set(readQuestions(box).map((q) => q.topic).filter(Boolean))].map((t) => html`<option value="${t}"></option>`)}`;
    onTotal?.(sum);
  };
  if (locked) box.querySelectorAll('input, [data-remove-q]').forEach((el) => { el.disabled = true; });
  box.addEventListener('input', total);
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-q]')) {
      e.target.closest('[data-q]').remove();
      total();
    }
    if (e.target.closest('[data-add-q]')) {
      const n = list.children.length;
      const last = readQuestions(box).at(-1);
      list.insertAdjacentHTML('beforeend', row({ label: `Q${n + 1}`, topic: '', maxMarks: last?.maxMarks || '' }, n));
      list.lastElementChild.querySelector('[data-f=topic]').focus();
      total();
    }
  });
  total();
}
