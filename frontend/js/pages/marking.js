import { bindDrop, bindFileDelete, dropzone, fileList, viewer } from '../components/files.js';
import { icon } from '../components/icons.js';
import { MISTAKES, avatar, bar } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { api, uploadForm } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { bindForm, errorLine, on, root, toast } from '../core/ui.js';
import { renderId } from '../core/view.js';

const QUICK_FEEDBACK = ['Excellent work.', 'Show all your steps.', 'Check your calculation.', 'Read the question carefully.', 'Revise this chapter.'];

const checked = (on) => (on ? new Safe('checked') : '');

const questionRow = (q) => html`<div class="qrow ${q.marks !== null && q.marks >= q.maxMarks ? 'full' : ''}" data-qrow="${q.id}" data-max="${q.maxMarks}">
  <div class="qhead">
    <div><b>${q.label}</b>${q.topic && html` <span>· ${q.topic}</span>`}</div>
    <input class="marks-input" type="number" min="0" max="${q.maxMarks}" step="any" inputmode="decimal" value="${q.marks ?? ''}" data-qmarks aria-label="Marks for ${q.label}" />
    <span class="qmax">/ ${q.maxMarks}</span>
  </div>
  <div class="mistake-picker" role="radiogroup" aria-label="Mistake in ${q.label}">
    ${Object.entries(MISTAKES).map(([key, m]) => html`<label title="${m.hint}"><input type="radio" name="mistake-${q.id}" value="${key}" ${checked(q.mistake === key)} /><span class="m-${key}">${m.label}</span></label>`)}
  </div>
</div>`;

export async function submissionPage(token, id) {
  const { exam, submission: s, nextId, total, marked } = await api(`/submissions/${id}`);
  if (token !== renderId) return;
  const byQuestion = s.breakdown.length > 0;
  shell('exams', html`
    <div class="page-header">
      <div class="row nowrap">
        ${avatar(s.studentName, 'lg')}
        <div>
          <p class="eyebrow">Marking · ${exam.title}</p>
          <h1>${s.studentName}</h1>
          <p class="sub">${s.rollNo ? `Roll ${s.rollNo} · ` : ''}${marked} of ${total} answers marked</p>
        </div>
      </div>
      <div class="row">
        <div class="hide-sm">${bar(marked, total, 'good')}</div>
        <a class="btn" href="#/exams/${exam.id}">${icon('back')}Back to exam</a>
      </div>
    </div>
    <div class="workspace-split">
      <section class="stack">${s.files.length ? viewer(s.files) : html`<div class="card pad muted">No pages uploaded.</div>`}</section>
      <form class="card grader" id="grade">
        <div class="total">
          <div><div class="small muted">Total score</div><div class="big"><span data-total>${s.marks ?? '–'}</span> <small>/ ${exam.maxMarks}</small></div></div>
          ${s.isModel && html`<span class="pill gold">★ Best answer</span>`}
        </div>
        <div class="scroll">
          ${byQuestion
            ? html`<div class="stack tight">
                <p class="tiny muted">Score each question. If marks were lost, tag why. It builds the Mistake Map and this student’s Peer Bridge.</p>
                ${s.breakdown.map(questionRow)}
              </div>`
            : html`<label class="field">Marks out of ${exam.maxMarks}
                <input class="marks-big" type="number" name="marks" min="0" max="${exam.maxMarks}" step="any" inputmode="decimal" value="${s.marks ?? ''}" autofocus />
              </label>`}
          <label class="field">Feedback <small>Only this student sees it</small>
            <textarea name="feedback" maxlength="5000" placeholder="What went well, and one thing to work on">${s.feedback}</textarea>
          </label>
          <div class="chips">${QUICK_FEEDBACK.map((text) => html`<button class="chip" type="button" data-chip>${text}</button>`)}</div>
          <label class="switch"><div><b>Best answer</b><span>Shown first to classmates as a model</span></div><input type="checkbox" name="isModel" ${checked(s.isModel)} /></label>
          <details class="more">
            <summary>${icon('settings')} More options</summary>
            <label class="switch"><div><b>Hide from classmates</b><span>For example, if a name is written on the sheet</span></div><input type="checkbox" name="hiddenFromPeers" ${checked(s.hiddenFromPeers)} /></label>
            <p class="small muted gap-below gap-above">Pages</p>
            ${fileList(s.files, { removable: true })}
            ${dropzone('pages', 'Add more pages')}
          </details>
          ${errorLine}
        </div>
        <div class="card-foot row between">
          <span class="tiny muted"><kbd>Enter</kbd> next field</span>
          <button class="btn primary" type="submit">${nextId ? 'Save & next' : 'Save & finish'}${icon('arrow')}</button>
        </div>
      </form>
    </div>`, s.studentName, [['Exams', '#/exams'], [exam.title, `#/exams/${exam.id}`]]);

  const rows = [...root.querySelectorAll('[data-qrow]')];
  const recount = () => {
    if (!byQuestion) return;
    let sum = 0;
    let complete = true;
    rows.forEach((r) => {
      const input = r.querySelector('[data-qmarks]');
      const value = input.value === '' ? null : Number(input.value);
      if (value === null) complete = false;
      sum += value || 0;
      r.classList.toggle('full', value !== null && value >= Number(r.dataset.max));
    });
    root.querySelector('[data-total]').textContent = complete ? Math.round(sum * 100) / 100 : `${Math.round(sum * 100) / 100}…`;
  };
  const marksInputs = [...root.querySelectorAll('[data-qmarks]')];
  marksInputs.forEach((input, i) => {
    input.addEventListener('input', recount);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      (marksInputs[i + 1] || root.querySelector('[name=feedback]')).focus();
    });
  });
  marksInputs[0]?.focus();
  recount();

  on('[data-chip]', 'click', (e) => {
    const box = root.querySelector('[name=feedback]');
    box.value = box.value ? `${box.value} ${e.currentTarget.textContent}` : e.currentTarget.textContent;
  });
  bindForm('#grade', async (data) => {
    const body = { feedback: data.feedback, isModel: !!data.isModel, hiddenFromPeers: !!data.hiddenFromPeers };
    if (byQuestion) {
      body.scores = rows.map((r) => ({
        questionId: Number(r.dataset.qrow),
        marks: r.querySelector('[data-qmarks]').value,
        mistake: r.querySelector('input[type=radio]:checked')?.value || null,
      }));
    } else body.marks = data.marks;
    await api(`/submissions/${s.id}`, { method: 'PATCH', body });
    toast('Saved.');
    location.hash = nextId ? `#/submissions/${nextId}` : `#/exams/${exam.id}`;
  });
  bindDrop('pages', (form, progress) => uploadForm(`/exams/${exam.id}/students/${s.studentId}/submission`, form, progress));
  bindFileDelete();
}
