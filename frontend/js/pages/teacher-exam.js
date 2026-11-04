import { ACCEPT, bindDrop, bindFileDelete, buildForm, dropzone, fileList } from '../components/files.js';
import { icon } from '../components/icons.js';
import { avatar, callout, empty, kpi, metaItem, pageHeader, pct, pill, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { insightList, mistakeMatrix, questionChart, reteach } from '../components/mistake-map.js';
import { bindQuestionBuilder, questionBuilder, readQuestions } from '../components/question-builder.js';
import { api, uploadForm } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { act, ask, formatDate, on, root, toast } from '../core/ui.js';
import { render } from '../core/view.js';

let examTab = { id: null, tab: 'answers' };

function nextStep(exam, paper, roster) {
  const answers = roster.filter((r) => r.submission);
  const left = answers.filter((r) => r.submission.marks === null);
  if (exam.status === 'draft' && !paper.length) {
    return { title: 'Add the question paper', text: 'Students cannot see this exam yet.', action: 'files', label: 'Add question paper' };
  }
  if (exam.status === 'draft') {
    return { title: 'Ready to publish', text: 'Students will see the paper and can upload answers from their phone.', action: 'publish', label: 'Publish to students', alt: 'skip', altLabel: 'I’ll upload the sheets myself' };
  }
  if (exam.status === 'collecting') {
    return { title: `${answers.length} of ${roster.length} students have handed in`, text: 'When everyone is done, close hand-in to start marking.', action: 'close', label: 'Close hand-in', progress: [answers.length, roster.length] };
  }
  if (!answers.length) {
    return { title: 'No answers yet', text: 'Upload sheets for students below, or reopen hand-in in Settings.' };
  }
  if (left.length) {
    return { title: `${left.length} of ${answers.length} answers left to mark`, text: 'Students cannot see marks until you release them.', action: 'mark', label: 'Start marking', target: left[0].submission.id, progress: [answers.length - left.length, answers.length] };
  }
  if (!exam.marksReleased) {
    return { title: 'Everything is marked', text: 'Each student sees only their own marks, feedback and Peer Bridge.', action: 'share', label: 'Release marks' };
  }
  return { done: true, title: 'Results are out', text: 'Students can see their marks, the solution and classmates’ answers.' };
}

function stageIndex(exam, step) {
  if (exam.status === 'draft') return 0;
  if (exam.status === 'collecting') return 1;
  return step.done ? 4 : 2 + (step.action === 'share' ? 1 : 0);
}

const STAGES = [['Draft', 'Paper and questions'], ['Hand-in', 'Students upload'], ['Marking', 'Score each answer'], ['Released', 'Results and peers']];

const pipeline = (current) => html`<div class="pipeline">
  ${STAGES.map(([title, sub], i) => html`<div class="stage ${i < current ? 'done' : i === current ? 'current' : ''}">
    <span class="dot">${i < current ? icon('check') : i + 1}</span><div><b>${title}</b>${sub}</div>
  </div>`)}
</div>`;

export function staffExam(data, insights) {
  const { exam, paper, solution, roster, stats, questions } = data;
  if (examTab.id !== exam.id) examTab = { id: exam.id, tab: 'answers' };
  const step = nextStep(exam, paper, roster);
  const answers = roster.filter((r) => r.submission);
  const marked = answers.filter((r) => r.submission.marks !== null).length;
  const byQuestion = questions.length > 0;
  const scoringStarted = insights.questions.some((q) => q.scored > 0);
  const tab = (key, label, iconName, count) => html`<button class="tab ${examTab.tab === key ? 'active' : ''}" type="button" data-tab="${key}">
    ${icon(iconName)}${label}${count !== undefined && html`<span class="count">${count}</span>`}</button>`;
  const toggle = (key, title, text) => html`<label class="switch">
    <div><b>${title}</b><span>${text}</span></div>
    <input type="checkbox" data-setting="${key}" ${exam[key] ? new Safe('checked') : ''} /></label>`;

  const status = (r) => {
    if (!r.submission) return pill('Not handed in', '');
    if (r.submission.marks === null) return pill('To mark', 'warn');
    return pill('Marked', 'good');
  };

  const answersTab = roster.length
    ? html`<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Status</th><th class="hide-sm">Pages</th><th class="right">Marks / ${exam.maxMarks}</th><th class="right"></th></tr></thead>
        <tbody>${roster.map((r) => html`<tr>
          <td><div class="cell-title">${avatar(r.name)}<div><b>${r.name} ${r.submission?.isModel && html`<span class="pill gold">★ Best answer</span>`}</b><span>${r.rollNo ? `Roll ${r.rollNo}` : 'No roll number'}</span></div></div></td>
          <td>${status(r)}</td>
          <td class="hide-sm muted num">${r.submission ? r.submission.fileCount : '–'}</td>
          <td class="right">${r.submission
            ? byQuestion
              ? html`<b class="num">${r.submission.marks ?? html`<span class="faint">–</span>`}</b>`
              : html`<input class="marks-input" type="number" min="0" max="${exam.maxMarks}" step="any" inputmode="decimal" value="${r.submission.marks ?? ''}" data-marks="${r.submission.id}" aria-label="Marks for ${r.name}" />`
            : html`<span class="faint">–</span>`}</td>
          <td class="right">${r.submission
            ? html`<a class="btn sm ${r.submission.marks === null ? 'primary' : ''}" href="#/submissions/${r.submission.id}">${r.submission.marks === null ? 'Mark' : 'Open'}</a>`
            : html`<label class="btn sm ghost">${icon('upload')}Upload<input class="sr-only" type="file" multiple accept="${ACCEPT}" data-upload-for="${r.studentId}" /></label>`}</td>
        </tr>`)}</tbody>
      </table></div>`
    : empty({ iconName: 'people', title: 'No students in this class', action: html`<a class="btn primary" href="#/people">Add students</a>` });

  const tips = reteach(insights.questions);
  const mapTab = !byQuestion
    ? empty({ iconName: 'map', title: 'Split this exam into questions', text: 'Then mark by question to see which questions and which kinds of mistakes cost the class marks.', action: html`<button class="btn primary" type="button" data-tab="questions">Add questions</button>` })
    : !scoringStarted
      ? empty({ iconName: 'map', title: 'The map fills in as you mark', text: 'Score each question and tag the mistake. The map updates after every answer.', action: step.action === 'mark' ? html`<a class="btn primary" href="#/submissions/${step.target}">Start marking</a>` : '' })
      : html`<div class="card-body stack">
          <div class="grid main-side">
            <div><h3 class="gap-below">Average per question</h3>${questionChart(insights.questions)}</div>
            <div><h3 class="gap-below">What to do next</h3>${insightList(tips)}</div>
          </div>
          <div><h3 class="gap-below">Mistake Map</h3>${mistakeMatrix(insights.questions.map((q) => ({ title: q.label, sub: q.topic, scorePct: q.averagePct, total: q.scored, mistakes: q.mistakes })))}</div>
        </div>`;

  const questionsTab = html`<div class="card-body stack">
    ${scoringStarted
      ? callout('warn', 'lock', 'Questions are locked', 'Marking by question has started, so the questions can no longer change.')
      : callout('brand', 'info', 'Total marks follow the questions', 'Students see each question’s marks and topic in their result breakdown.')}
    ${questionBuilder(byQuestion ? questions : [{ label: 'Q1' }, { label: 'Q2' }], { locked: scoringStarted })}
    ${!scoringStarted && html`<div class="row">
      <button class="btn primary" type="button" id="save-questions">Save questions</button>
      ${byQuestion && html`<button class="btn ghost danger" type="button" id="clear-questions">Stop marking by question</button>`}
    </div>`}
  </div>`;

  const filesTab = html`<div class="card-body grid cols-2">
    <section><h3 class="gap-below">Question paper</h3>${fileList(paper, { removable: true })}${dropzone('paper', 'Add question paper')}</section>
    <section><h3 class="gap-below">Solution</h3>${fileList(solution, { removable: true })}${dropzone('solution', 'Add solution')}</section>
  </div>`;

  const settingsTab = html`<div class="card-body">
    <h3>Sharing</h3>
    ${toggle('peerSharing', 'Classmates can see each other’s answers', 'Only after hand-in closes. Marks and feedback always stay private.')}
    ${toggle('anonymous', 'Hide student names', 'Required for Peer Bridge. A name written on a sheet stays visible, so hide that answer instead.')}
    ${toggle('marksReleased', 'Students can see their marks', 'Each student sees only their own result and breakdown.')}
    <h3 class="gap-above">Exam</h3>
    <div class="row gap-above">
      <button class="btn" id="edit-exam" type="button">${icon('pen')}Edit details</button>
      ${exam.status === 'review' && html`<button class="btn" data-status="collecting" type="button">Reopen hand-in</button>`}
      ${exam.status === 'collecting' && html`<button class="btn" data-status="draft" type="button">Unpublish</button>`}
      <button class="btn danger" id="delete-exam" type="button">${icon('trash')}Delete exam</button>
    </div>
  </div>`;

  const avgPct = stats.average === null ? null : pct(stats.average, exam.maxMarks);
  shell('exams', html`
    ${pageHeader({
      eyebrow: html`${exam.subject} · ${exam.className}`,
      title: exam.title,
      meta: html`${exam.examDate && metaItem('calendar', formatDate(exam.examDate))}${metaItem('target', `${exam.maxMarks} marks`)}${byQuestion && metaItem('layers', `${questions.length} questions`)}${metaItem(exam.anonymous ? 'lock' : 'eye', exam.anonymous ? 'Names hidden' : 'Names shown')}`,
    })}
    <section class="card gap-below">
      ${pipeline(stageIndex(exam, step))}
      <div class="next-action">
        <div class="grow">
          <h2>${step.title}</h2>
          <p>${step.text}</p>
          ${step.progress && html`<progress class="bar" max="${step.progress[1] || 1}" value="${step.progress[0]}"></progress>`}
        </div>
        <div class="row">
          ${step.alt && html`<button class="btn" type="button" data-step="${step.alt}">${step.altLabel}</button>`}
          ${step.action && html`<button class="btn primary lg" type="button" data-step="${step.action}">${step.label}${icon('arrow')}</button>`}
          ${step.done && pill('Complete', 'good')}
        </div>
      </div>
    </section>
    <div class="kpis">
      ${kpi({ label: 'Handed in', value: answers.length, unit: `/ ${roster.length}`, foot: `${pct(answers.length, roster.length)}% of the class`, iconName: 'upload' })}
      ${kpi({ label: 'Marked', value: marked, unit: `/ ${answers.length}`, foot: answers.length === marked ? 'Nothing waiting' : `${answers.length - marked} to go`, footTone: answers.length === marked ? 'up' : 'down', iconName: 'pen' })}
      ${kpi({ label: 'Class average', value: avgPct === null ? '–' : `${avgPct}%`, foot: stats.average === null ? 'After marking' : `${stats.average} of ${exam.maxMarks}`, footTone: avgPct === null ? '' : toneFor(avgPct) === 'good' ? 'up' : 'down', iconName: 'trend' })}
      ${kpi({ label: 'Highest', value: stats.highest ?? '–', unit: stats.highest === null ? '' : `/ ${exam.maxMarks}`, foot: 'Best single answer', iconName: 'star' })}
    </div>
    <section class="card">
      <div class="tabs" role="tablist">
        ${tab('answers', 'Answers', 'inbox', `${answers.length}/${roster.length}`)}
        ${tab('map', 'Mistake Map', 'map')}
        ${tab('questions', 'Questions', 'layers', questions.length || undefined)}
        ${tab('files', 'Paper & solution', 'file')}
        ${tab('settings', 'Settings', 'settings')}
      </div>
      ${{ answers: answersTab, map: mapTab, questions: questionsTab, files: filesTab, settings: settingsTab }[examTab.tab]}
    </section>`, exam.title, [['Exams', '#/exams']]);

  const patch = (body) => api(`/exams/${exam.id}`, { method: 'PATCH', body });
  on('[data-tab]', 'click', (e) => {
    examTab.tab = e.currentTarget.dataset.tab;
    staffExam(data, insights);
  });
  on('[data-step]', 'click', act(async (el) => {
    const name = el.dataset.step;
    if (name === 'files') { examTab.tab = 'files'; return; }
    if (name === 'mark') { location.hash = `#/submissions/${step.target}`; return; }
    if (name === 'publish') { await patch({ status: 'collecting' }); return 'Published. Students can now hand in.'; }
    if (name === 'skip') { await patch({ status: 'review' }); return; }
    if (name === 'share') { await patch({ marksReleased: true }); return 'Marks released to students.'; }
    if (name === 'close') {
      const text = exam.peerSharing
        ? 'Close hand-in? Students will then see the solution and classmates’ answers.'
        : 'Close hand-in? Students will then see the solution.';
      if (await ask(text, { confirmLabel: 'Close hand-in' })) await patch({ status: 'review' });
    }
  }));
  on('[data-status]', 'click', act((el) => patch({ status: el.dataset.status })));
  on('[data-setting]', 'change', act((el) => patch({ [el.dataset.setting]: el.checked }).then(() => 'Saved.')));
  on('#edit-exam', 'click', () => editExamDialog(exam, patch, byQuestion));
  on('#delete-exam', 'click', async () => {
    const sure = await ask(`Delete "${exam.title}" with all its files and student answers? This cannot be undone.`, {
      confirmLabel: 'Delete exam',
      danger: true,
    });
    if (!sure) return;
    try {
      await api(`/exams/${exam.id}`, { method: 'DELETE' });
      toast('Exam deleted.');
      location.hash = '#/exams';
    } catch (err) { toast(err.message, true); }
  });
  bindQuestionBuilder(root, { locked: scoringStarted });
  const saveQuestions = (list) => api(`/exams/${exam.id}/questions`, { method: 'PUT', body: { questions: list } });
  on('#save-questions', 'click', act(async () => {
    const list = readQuestions(root);
    if (!list.length) throw new Error('Add at least one question.');
    const { total } = await saveQuestions(list);
    return `Questions saved. Total is now ${total} marks.`;
  }));
  on('#clear-questions', 'click', act(async () => {
    if (!(await ask('Stop marking by question? The questions are removed; the total stays as it is.', { confirmLabel: 'Remove questions', danger: true }))) return;
    await saveQuestions([]);
    return 'Questions removed.';
  }));
  bindDrop('paper', (form, progress) => uploadForm(`/exams/${exam.id}/files?kind=paper`, form, progress));
  bindDrop('solution', (form, progress) => uploadForm(`/exams/${exam.id}/files?kind=solution`, form, progress));
  bindFileDelete();
  on('[data-upload-for]', 'change', act(async (el) => {
    await uploadForm(`/exams/${exam.id}/students/${el.dataset.uploadFor}/submission`, await buildForm(el.files));
    return 'Uploaded.';
  }));
  // Marks save as they are typed, and the cursor moves to the next student.
  const inputs = [...root.querySelectorAll('[data-marks]')];
  inputs.forEach((input, i) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (inputs[i + 1] || input).focus();
        if (!inputs[i + 1]) input.blur();
      }
    });
    input.addEventListener('change', async () => {
      const nextId = inputs[i + 1]?.dataset.marks;
      try {
        await api(`/submissions/${input.dataset.marks}`, { method: 'PATCH', body: { marks: input.value } });
        await render();
        root.querySelector(`[data-marks="${nextId}"]`)?.focus();
      } catch (err) {
        toast(err.message, true);
        input.focus();
      }
    });
  });
}

function editExamDialog(exam, patch, byQuestion) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = html`
    <form class="stack" id="edit-form">
      <div><h2>Edit exam details</h2><p class="small muted">Changes are visible to students right away.</p></div>
      <label class="field">Exam name <input type="text" name="title" required maxlength="120" value="${exam.title}" /></label>
      <label class="field">Subject <input type="text" name="subject" required maxlength="60" value="${exam.subject}" /></label>
      <div class="form-grid">
        <label class="field">Total marks
          ${byQuestion && html`<small>Set by the questions</small>`}
          <input type="number" name="maxMarks" required min="1" step="any" value="${exam.maxMarks}" ${byQuestion ? new Safe('readonly') : ''} />
        </label>
        <label class="field">Date <input type="date" name="examDate" value="${exam.examDate ?? ''}" /></label>
      </div>
      <p class="error hidden" role="alert"></p>
      <div class="row end">
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn primary" type="submit">Save changes</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = dialog.querySelector('.error');
    try {
      await patch(Object.fromEntries(new FormData(event.target)));
      dialog.close();
      toast('Saved.');
      await render();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  });
  dialog.showModal();
}
