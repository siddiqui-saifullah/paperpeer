import { ACCEPT, buildForm } from '../components/files.js';
import { icon } from '../components/icons.js';
import { callout, empty, pageHeader } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { bindQuestionBuilder, questionBuilder, readQuestions } from '../components/question-builder.js';
import { api, uploadForm } from '../core/api.js';
import { html } from '../core/html.js';
import { bindForm, errorLine, on, root, toast } from '../core/ui.js';
import { renderId } from '../core/view.js';

const STARTER = [{ label: 'Q1', maxMarks: 10 }, { label: 'Q2', maxMarks: 10 }, { label: 'Q3', maxMarks: 10 }];

export async function newExamPage(token) {
  const { classes } = await api('/classes');
  if (token !== renderId) return;
  if (!classes.length) {
    shell('exams', html`<div class="card">${empty({
      iconName: 'people',
      title: 'Add your students first',
      text: 'Every exam belongs to a class. Paste a class list and logins are created for you.',
      action: html`<a class="btn primary" href="#/people">${icon('plus')}Add students</a>`,
    })}</div>`, 'New exam', [['Exams', '#/exams']]);
    return;
  }
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  shell('exams', html`
    ${pageHeader({ title: 'Create exam', sub: 'Set it up once. PaperPeer handles hand-in, marking and sharing.' })}
    <form class="card" id="new-exam">
      <section class="form-section">
        <div class="about"><h3>Details</h3><p>What students see at the top of the exam.</p></div>
        <div class="form-grid">
          <label class="field span-2">Exam name <input type="text" name="title" required maxlength="120" placeholder="Unit Test 2" autofocus /></label>
          <label class="field">Subject <input type="text" name="subject" required maxlength="60" placeholder="Mathematics" /></label>
          <label class="field">Class
            <select name="classId" required>${classes.map((c) => html`<option value="${c.id}">${c.name} · ${c.students} students</option>`)}</select>
          </label>
          <label class="field">Date <input type="date" name="examDate" value="${today}" /></label>
          <label class="field" id="total-field">Total marks <input type="number" name="maxMarks" min="1" step="any" inputmode="decimal" /></label>
        </div>
      </section>
      <section class="form-section">
        <div class="about">
          <h3>Questions <span class="pill brand no-dot">Recommended</span></h3>
          <p>Mark question by question to unlock the Mistake Map, each student’s Skill Map and Peer Bridge.</p>
        </div>
        <div class="stack tight">
          <label class="switch"><div><b>Mark by question</b><span>Total marks are added up from the questions.</span></div><input type="checkbox" id="by-question" checked /></label>
          <div id="qb-wrap">${questionBuilder(STARTER)}</div>
        </div>
      </section>
      <section class="form-section">
        <div class="about"><h3>Files</h3><p>PDF or photos. The solution stays hidden until answers close.</p></div>
        <div class="grid cols-2">
          <label class="drop"><input type="file" id="paper" multiple accept="${ACCEPT}" />${icon('file')}<b>Question paper</b><span data-files>Required to publish</span></label>
          <label class="drop"><input type="file" id="solution" multiple accept="${ACCEPT}" />${icon('shield')}<b>Solution</b><span data-files>Optional</span></label>
        </div>
      </section>
      <div class="card-foot">
        ${errorLine}
        <div class="row between">
          <span class="small muted">${icon('lock')} Only this class can see the exam.</span>
          <div class="row">
            <button class="btn" type="submit" value="draft">Save as draft</button>
            <button class="btn primary" type="submit" value="publish">${icon('arrow')}Publish to students</button>
          </div>
        </div>
      </div>
    </form>
    <div class="gap-above">${callout('brand', 'spark', 'Tip', 'Give each question a topic. Topics roll up across exams, so you can see which ideas a class keeps missing.')}</div>`,
  'New exam', [['Exams', '#/exams']]);

  const byQuestion = root.querySelector('#by-question');
  const totalInput = root.querySelector('[name=maxMarks]');
  const sync = () => {
    root.querySelector('#qb-wrap').classList.toggle('hidden', !byQuestion.checked);
    totalInput.readOnly = byQuestion.checked;
    totalInput.required = !byQuestion.checked;
  };
  bindQuestionBuilder(root, { onTotal: (sum) => { if (byQuestion.checked) totalInput.value = sum || ''; } });
  byQuestion.addEventListener('change', sync);
  sync();

  on('.drop input', 'change', (e) => {
    const names = [...e.target.files].map((f) => f.name).join(', ');
    if (names) e.target.parentElement.querySelector('[data-files]').textContent = names;
    e.target.parentElement.classList.add('over');
  });
  bindForm('#new-exam', async (data, form, intent) => {
    const paper = form.querySelector('#paper').files;
    const solution = form.querySelector('#solution').files;
    const questions = byQuestion.checked ? readQuestions(form) : [];
    if (byQuestion.checked && !questions.length) throw new Error('Add at least one question, or turn off marking by question.');
    if (questions.some((q) => !(Number(q.maxMarks) > 0))) throw new Error('Give every question its marks.');
    if (intent === 'publish' && !paper.length) throw new Error('Add the question paper before publishing.');
    const { id } = await api('/exams', { method: 'POST', body: data });
    // The exam now exists, so a failed step continues from its page, not this form.
    try {
      if (questions.length) await api(`/exams/${id}/questions`, { method: 'PUT', body: { questions } });
      if (paper.length) await uploadForm(`/exams/${id}/files?kind=paper`, await buildForm(paper));
      if (solution.length) await uploadForm(`/exams/${id}/files?kind=solution`, await buildForm(solution));
      if (intent === 'publish') await api(`/exams/${id}`, { method: 'PATCH', body: { status: 'collecting' } });
      toast(intent === 'publish' ? 'Published. Students can now upload answers.' : 'Draft saved.');
    } catch (err) {
      toast(`Exam saved, but: ${err.message}`, true);
    }
    location.hash = `#/exams/${id}`;
  });
}
