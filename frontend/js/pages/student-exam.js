import { bindDrop, bindFileDelete, dropzone, fileList, fileUrl, viewer } from '../components/files.js';
import { icon } from '../components/icons.js';
import { barCell, callout, metaItem, mistakeTag, pageHeader, pct, pill, ring, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { api, uploadForm } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { bindForm, formatDate, on, root, toast } from '../core/ui.js';

const openButtons = (files, label, iconName) =>
  files.map((f, i) => html`<a class="btn" href="${fileUrl(f)}" target="_blank" rel="noopener">${icon(iconName)}${label}${files.length > 1 ? ` ${i + 1}` : ''}</a>`);

function resultCard(exam, submission, stats) {
  const score = pct(submission.marks, exam.maxMarks);
  const avg = stats?.average === null || !stats ? null : pct(stats.average, exam.maxMarks);
  return html`<section class="card">
    <div class="card-body row top nowrap">
      ${ring(score, `${submission.marks} / ${exam.maxMarks}`)}
      <div class="grow stack tight">
        <div class="row">
          <h2>Your result</h2>
          ${submission.isModel && html`<span class="pill gold">★ Chosen as a best answer</span>`}
        </div>
        ${avg !== null && html`<p class="small muted">Class average ${avg}% · Highest ${stats.highest} / ${exam.maxMarks}
          · You are <b>${score >= avg ? `${score - avg} pts above` : `${avg - score} pts below`}</b> average</p>`}
        ${submission.feedback
          ? html`<div class="callout"><span>${icon('note')}</span><div><b>Feedback from your teacher</b><span>${submission.feedback}</span></div></div>`
          : ''}
        ${submission.helpful > 0 && html`<p class="small muted">${icon('heart')} ${submission.helpful} classmate${submission.helpful === 1 ? '' : 's'} found your answer helpful.</p>`}
      </div>
    </div>
  </section>`;
}

const breakdownCard = (breakdown) => html`<section class="card">
  <div class="card-header"><div><h2>Question breakdown</h2><p>Where your marks came from, and where they went</p></div></div>
  <div class="table-wrap"><table>
    <thead><tr><th>Question</th><th>Score</th><th class="hide-sm">What happened</th></tr></thead>
    <tbody>${breakdown.map((q) => {
      const p = q.marks === null ? null : pct(q.marks, q.maxMarks);
      return html`<tr>
        <td><b>${q.label}</b>${q.topic && html`<div class="tiny muted">${q.topic}</div>`}</td>
        <td>${q.marks === null ? html`<span class="faint">–</span>` : barCell(q.marks, q.maxMarks, `${q.marks}/${q.maxMarks}`, toneFor(p))}</td>
        <td class="hide-sm">${p === 100 ? pill('Full marks', 'good') : mistakeTag(q.mistake) || html`<span class="faint">–</span>`}</td>
      </tr>`;
    })}</tbody>
  </table></div>
</section>`;

function bridgeSection(bridges) {
  if (!bridges?.length) return '';
  const closable = bridges.filter((b) => b.peers.length);
  return html`<section class="stack tight">
    <div class="bridge-hero">
      <p class="eyebrow">${icon('bridge')}Peer Bridge</p>
      <h2>Close your gaps, one question at a time</h2>
      <p>For every question where you lost marks, here’s a classmate’s answer that got that exact question fully right. Names stay hidden.</p>
    </div>
    ${bridges.map((b) => html`<div class="bridge">
      <span class="q">${b.label}</span>
      <div>
        <b>You lost ${b.lost} mark${b.lost === 1 ? '' : 's'}${b.topic ? ` on ${b.topic}` : ''}</b>
        <p>${b.mistake ? mistakeTag(b.mistake) : 'Compare your working with a full-marks answer.'}</p>
      </div>
      <div class="row">
        ${b.peers.length
          ? b.peers.map((p) => html`<button class="btn sm primary" type="button" data-jump="${p.id}" data-q="${b.label}">See ${p.label}${icon('arrow')}</button>`)
          : html`<span class="small muted">No full-marks answer shared yet</span>`}
      </div>
    </div>`)}
    ${closable.length === 0 && callout('', 'info', 'Nothing to bridge yet', 'Nobody shared a full-marks answer on these questions. Check the solution instead.')}
  </section>`;
}

export function studentExam(data, peers) {
  const { exam, paper, solution, submission, canUpload, stats, note } = data;
  const hasResult = exam.marksReleased && submission && submission.marks !== null;
  const head = pageHeader({
    eyebrow: exam.subject,
    title: exam.title,
    meta: html`${exam.examDate && metaItem('calendar', formatDate(exam.examDate))}${metaItem('target', `${exam.maxMarks} marks`)}${data.questionCount > 0 && metaItem('layers', `${data.questionCount} questions`)}`,
    actions: html`${openButtons(paper, 'Question paper', 'file')}`,
  });

  const uploading = html`
    ${submission
      ? callout('good', 'check', 'Your answer is handed in', 'Forgot a page? You can add more until your teacher closes hand-in.')
      : callout('brand', 'camera', 'Upload your answer', 'Take a clear photo of each page, in order. Don’t write your name: classmates may see your sheet later.')}
    <section class="card">
      <div class="card-header"><div><h2>${submission ? 'Your pages' : 'Hand in'}</h2><p>${submission ? `${submission.files.length} page${submission.files.length === 1 ? '' : 's'} uploaded` : 'PDF or photos'}</p></div>${submission ? pill('Submitted', 'good') : pill('Due', 'bad')}</div>
      <div class="card-body">
        ${submission && fileList(submission.files, { removable: true })}
        ${dropzone('answer', submission ? 'Add another page' : 'Choose your answer pages')}
      </div>
    </section>`;

  const peerList = peers.open && html`<section class="card">
    <div class="card-header"><div><h2>Learn from classmates</h2><p>See how others approached the same paper</p></div>${pill(`${peers.peers.length} answer${peers.peers.length === 1 ? '' : 's'}`, 'brand')}</div>
    <div class="card-body stack tight">
      ${peers.peers.length
        ? peers.peers.map((p, i) => html`<details class="peer" id="peer-${p.id}" ${i === 0 && !peers.bridges?.length ? new Safe('open') : ''}>
            <summary>
              <span class="avatar sm av-${i % 8}">${i + 1}</span>
              <span class="grow">${p.label}</span>
              ${p.isModel && html`<span class="pill gold">★ Best answer</span>`}
              ${p.helpful > 0 && html`<span class="small muted">${icon('heart')} ${p.helpful}</span>`}
              ${icon('down')}
            </summary>
            <div class="body" data-peer-files="${p.id}"></div>
            <div class="body"><button class="btn sm ${p.markedHelpful ? 'on' : ''}" type="button" data-helpful="${p.id}">${icon('heart')}<span>${p.markedHelpful ? 'Helpful' : 'This helped me'}</span></button></div>
          </details>`)
        : html`<p class="muted small">No classmates’ answers shared yet.</p>`}
    </div>
  </section>`;

  const reviewing = html`
    ${hasResult
      ? resultCard(exam, submission, stats)
      : callout('brand', 'clock', 'Marks are on their way', 'Your teacher hasn’t released marks yet. Meanwhile, compare your answer with the solution.')}
    <div class="row">
      ${openButtons(solution, 'Solution', 'shield')}
      ${submission && openButtons(submission.files, 'My answer', 'eye')}
    </div>
    ${hasResult && submission.breakdown.length > 0 && breakdownCard(submission.breakdown)}
    ${bridgeSection(peers.bridges)}
    ${peerList}
    <form class="card" id="note">
      <div class="card-header"><div><h2>Reflection</h2><p>Private to you. What will you do differently next time?</p></div>${icon('lock')}</div>
      <div class="card-body stack tight">
        <textarea name="body" maxlength="5000" aria-label="My reflection" placeholder="e.g. Write every step in Q2. Re-check arithmetic before moving on.">${note}</textarea>
        <div><button class="btn" type="submit">Save reflection</button></div>
      </div>
    </form>`;

  shell('exams', html`${head}<div class="stack">
    ${canUpload ? uploading : reviewing}
    ${!canUpload && !submission && exam.status === 'review' && callout('warn', 'alert', 'No answer handed in', 'You did not upload an answer for this exam.')}
  </div>`, exam.title, [['My exams', '#/exams']]);

  bindDrop('answer', (form, progress) => uploadForm(`/exams/${exam.id}/submission`, form, progress));
  bindFileDelete();
  // Peer pages load only when opened, so a phone does not download the whole class.
  const loadPeer = (details) => {
    const box = details.querySelector('[data-peer-files]');
    if (details.open && !box.innerHTML) {
      box.innerHTML = viewer(peers.peers.find((p) => p.id === box.dataset.peerFiles).files);
    }
  };
  on('details.peer', 'toggle', (event) => loadPeer(event.currentTarget));
  root.querySelectorAll('details.peer[open]').forEach(loadPeer);
  on('[data-jump]', 'click', (e) => {
    const target = root.querySelector(`#peer-${CSS.escape(e.currentTarget.dataset.jump)}`);
    if (!target) return;
    target.open = true;
    loadPeer(target);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
    toast(`Look for how they answered ${e.currentTarget.dataset.q}.`);
  });
  on('[data-helpful]', 'click', async (event) => {
    const button = event.currentTarget;
    try {
      const { markedHelpful } = await api(`/submissions/${button.dataset.helpful}/helpful`, { method: 'POST' });
      button.classList.toggle('on', markedHelpful);
      button.querySelector('span').textContent = markedHelpful ? 'Helpful' : 'This helped me';
    } catch (err) { toast(err.message, true); }
  });
  bindForm('#note', async (form) => {
    await api(`/exams/${exam.id}/note`, { method: 'PUT', body: form });
    toast('Reflection saved.');
  });
}
