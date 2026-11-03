import { icon } from '../components/icons.js';
import { barCell, empty, pageHeader, pill, staffStage, subjectIcon, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { api } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { isStaff } from '../core/session.js';
import { formatDate, on, percent, root, store } from '../core/ui.js';
import { renderId } from '../core/view.js';
import { studentStatus } from './student-home.js';

const STAFF_FILTERS = [['all', 'All'], ['draft', 'Draft'], ['collecting', 'Collecting'], ['marking', 'Marking'], ['ready', 'Ready'], ['released', 'Released']];

export async function examsPage(token) {
  const [{ exams }, { classes }] = await Promise.all([api('/exams'), api('/classes')]);
  if (token !== renderId) return;
  if (isStaff()) staffList(exams, classes);
  else studentList(exams);
  bindFilters();
}

// Rows carry their search text and filter keys, so filtering never redraws the page.
function bindFilters() {
  const rows = [...root.querySelectorAll('[data-row]')];
  const apply = () => {
    const q = (root.querySelector('#exam-search')?.value || '').trim().toLowerCase();
    const stage = root.querySelector('[data-stage].active')?.dataset.stage || 'all';
    const cls = root.querySelector('#exam-class')?.value || '';
    let shown = 0;
    rows.forEach((r) => {
      const ok = (!q || r.dataset.text.includes(q)) && (stage === 'all' || r.dataset.stageKey === stage) && (!cls || r.dataset.classId === cls);
      r.classList.toggle('hidden', !ok);
      shown += ok;
    });
    root.querySelector('#no-match')?.classList.toggle('hidden', shown > 0);
  };
  on('#exam-search', 'input', apply);
  on('[data-stage]', 'click', (e) => {
    root.querySelectorAll('[data-stage]').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
    store.set('examStage', e.currentTarget.dataset.stage);
    apply();
  });
  on('#exam-class', 'change', (e) => { store.set('classFilter', e.target.value); apply(); });
  on('[data-href]', 'click', (e) => {
    if (!e.target.closest('a, button, input')) location.hash = e.currentTarget.dataset.href;
  });
  apply();
}

const toolbar = (filters, classes) => {
  const stage = store.get('examStage') || 'all';
  const cls = store.get('classFilter');
  return html`<div class="toolbar">
    <label class="search">${icon('search')}<input type="search" id="exam-search" placeholder="Search exams…" aria-label="Search exams" /></label>
    <div class="segmented" role="group" aria-label="Filter by status">
      ${filters.map(([key, label]) => html`<button type="button" class="${stage === key ? 'active' : ''}" data-stage="${key}">${label}</button>`)}
    </div>
    ${classes.length > 1 && html`<select id="exam-class" class="input-sm" aria-label="Class">
      <option value="">All classes</option>
      ${classes.map((c) => html`<option value="${c.id}" ${String(c.id) === cls ? new Safe('selected') : ''}>${c.name}</option>`)}
    </select>`}
  </div>`;
};

const noMatch = html`<div id="no-match" class="hidden">${empty({ iconName: 'search', title: 'No matching exams', text: 'Try another search or filter.' })}</div>`;

function staffList(exams, classes) {
  shell('exams', html`
    ${pageHeader({
      title: 'Exams',
      sub: 'Every paper, hand-in and result across your school.',
      actions: html`<a class="btn primary" href="#/exams/new">${icon('plus')}New exam</a>`,
    })}
    <section class="card">
      ${exams.length
        ? html`${toolbar(STAFF_FILTERS, classes)}
          <div class="table-wrap"><table>
            <thead><tr><th>Exam</th><th>Status</th><th class="hide-sm">Handed in</th><th class="hide-sm">Marked</th><th class="right">Average</th><th class="hide-sm">Date</th></tr></thead>
            <tbody>${exams.map((e) => {
              const stage = staffStage(e);
              return html`<tr class="clickable" data-row data-href="#/exams/${e.id}" data-stage-key="${stage.key}" data-class-id="${e.classId}"
                data-text="${`${e.title} ${e.subject} ${e.className}`.toLowerCase()}">
                <td><a class="cell-title" href="#/exams/${e.id}">${subjectIcon(e.subject)}<div><b>${e.title}</b><span>${e.subject} · ${e.className}</span></div></a></td>
                <td>${pill(stage.label, stage.tone)}</td>
                <td class="hide-sm">${e.status === 'draft' ? html`<span class="faint">–</span>` : barCell(e.submitted, e.classSize, `${e.submitted}/${e.classSize}`)}</td>
                <td class="hide-sm">${e.submitted ? barCell(e.graded, e.submitted, `${e.graded}/${e.submitted}`, e.graded === e.submitted ? 'good' : 'warn') : html`<span class="faint">–</span>`}</td>
                <td class="right">${e.averagePct === null ? html`<span class="faint">–</span>` : html`<span class="pill no-dot ${toneFor(e.averagePct)}">${e.averagePct}%</span>`}</td>
                <td class="hide-sm muted">${formatDate(e.examDate)}</td>
              </tr>`;
            })}</tbody>
          </table></div>${noMatch}`
        : empty({ iconName: 'exams', title: 'Create your first exam', text: 'Upload the question paper, split it into questions, and publish it to a class.', action: html`<a class="btn primary" href="#/exams/new">${icon('plus')}New exam</a>` })}
    </section>`, 'Exams');
}

function studentList(exams) {
  const filters = [['all', 'All'], ['todo', 'To do'], ['waiting', 'Being marked'], ['results', 'Results out']];
  const key = (e) => {
    const s = studentStatus(e).label;
    return s === 'To do' ? 'todo' : s === 'Results out' ? 'results' : 'waiting';
  };
  shell('exams', html`
    ${pageHeader({ title: 'My exams', sub: 'Papers, your answers, results and classmates’ approaches.' })}
    <section class="card">
      ${exams.length
        ? html`${toolbar(filters, [])}
          <div class="table-wrap"><table>
            <thead><tr><th>Exam</th><th>Status</th><th class="right">Your score</th><th class="right hide-sm">Class avg</th><th class="hide-sm">Date</th></tr></thead>
            <tbody>${exams.map((e) => {
              const s = studentStatus(e);
              const score = e.marks !== null ? percent(e.marks, e.maxMarks) : null;
              return html`<tr class="clickable" data-row data-href="#/exams/${e.id}" data-stage-key="${key(e)}" data-class-id=""
                data-text="${`${e.title} ${e.subject}`.toLowerCase()}">
                <td><a class="cell-title" href="#/exams/${e.id}">${subjectIcon(e.subject)}<div><b>${e.title}</b><span>${e.subject}</span></div></a></td>
                <td>${pill(s.label, s.tone)}</td>
                <td class="right num">${score === null ? html`<span class="faint">–</span>` : html`<span class="pill no-dot ${toneFor(score)}">${e.marks}/${e.maxMarks}</span>`}</td>
                <td class="right hide-sm num muted">${e.classAverage === null ? '–' : `${percent(e.classAverage, e.maxMarks)}%`}</td>
                <td class="hide-sm muted">${formatDate(e.examDate)}</td>
              </tr>`;
            })}</tbody>
          </table></div>${noMatch}`
        : empty({ title: 'No exams yet', text: 'Your exams will appear here when your teacher publishes them.' })}
    </section>`, 'My exams');
}
