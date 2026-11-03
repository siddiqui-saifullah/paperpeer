import { icon } from '../components/icons.js';
import { avatar, barCell, callout, empty, kpi, mistakeTag, pageHeader, pct, pill, staffStage, subjectIcon, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { html } from '../core/html.js';
import { me } from '../core/session.js';
import { formatDate } from '../core/ui.js';

// The single thing a teacher should do next on an exam.
function nextMove(e) {
  if (e.status === 'draft') return 'Publish to students';
  if (e.status === 'collecting') return `${e.classSize - e.submitted} still to upload`;
  if (!e.submitted) return 'Upload answer sheets';
  if (e.submitted > e.graded) return `Mark ${e.submitted - e.graded} answer${e.submitted - e.graded === 1 ? '' : 's'}`;
  if (!e.marksReleased) return 'Release marks';
  return null;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function setupGuide(classes, exams) {
  const hasStudents = classes.some((c) => c.students > 0);
  const steps = [
    { done: true, title: 'Create your workspace', text: `School code ${me.school.code}` },
    { done: hasStudents, title: 'Add your students', text: 'Paste a class list. Logins are generated for you.', href: '#/people' },
    { done: exams.length > 0, title: 'Create your first exam', text: 'Split it into questions to unlock the Mistake Map.', href: '#/exams/new' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return html`<section class="card gap-below">
    <div class="card-header"><div><h2>Get your school set up</h2><p>${steps.filter((s) => s.done).length} of ${steps.length} done</p></div></div>
    <div class="list">
      ${steps.map((s, i) => html`<div class="list-item">
        <span class="avatar sm ${s.done ? 'av-2' : 'av-0'}">${s.done ? icon('check') : i + 1}</span>
        <div class="main-col"><b>${s.title}</b><span>${s.text}</span></div>
        ${i === current && html`<a class="btn primary sm" href="${s.href}">Start ${icon('arrow')}</a>`}
      </div>`)}
    </div>
  </section>`;
}

export function staffDashboard(exams, classes, insights) {
  const live = exams.filter((e) => e.status !== 'draft');
  const collecting = exams.filter((e) => e.status === 'collecting');
  const toMark = exams.reduce((n, e) => n + (e.status === 'review' ? e.submitted - e.graded : 0), 0);
  const expected = live.reduce((n, e) => n + e.classSize, 0);
  const handedIn = live.reduce((n, e) => n + e.submitted, 0);
  const averages = exams.filter((e) => e.averagePct !== null);
  const schoolAvg = averages.length ? Math.round(averages.reduce((n, e) => n + e.averagePct, 0) / averages.length) : null;
  const queue = exams.map((e) => ({ e, move: nextMove(e) })).filter((r) => r.move);
  const weakest = insights.topics.slice(0, 4);
  const setupDone = classes.some((c) => c.students > 0) && exams.length > 0;

  shell('home', html`
    ${pageHeader({
      eyebrow: new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
      title: `${greeting()}, ${me.name.split(' ')[0]}`,
      sub: `Here’s what needs you at ${me.school.name} today.`,
      actions: html`<a class="btn" href="#/insights">${icon('map')}Open Mistake Map</a><a class="btn primary" href="#/exams/new">${icon('plus')}New exam</a>`,
    })}
    ${!setupDone && setupGuide(classes, exams)}
    <div class="kpis">
      ${kpi({ label: 'Collecting answers', value: collecting.length, unit: collecting.length === 1 ? 'exam' : 'exams', foot: `${exams.length} exams in total`, iconName: 'inbox' })}
      ${kpi({ label: 'Waiting to be marked', value: toMark, unit: 'answers', foot: toMark ? 'Marking queue is open' : 'All caught up', footTone: toMark ? 'down' : 'up', iconName: 'pen' })}
      ${kpi({ label: 'Hand-in rate', value: expected ? `${pct(handedIn, expected)}%` : '–', foot: `${handedIn} of ${expected} answer sheets`, iconName: 'upload' })}
      ${kpi({ label: 'Average score', value: schoolAvg === null ? '–' : `${schoolAvg}%`, foot: 'Across marked exams', footTone: schoolAvg === null ? '' : schoolAvg >= 60 ? 'up' : 'down', iconName: 'trend' })}
    </div>

    <div class="grid main-side">
      <div class="stack">
        <section class="card">
          <div class="card-header"><div><h2>Needs your attention</h2><p>The next step on each exam, in one place</p></div>${queue.length > 0 && pill(`${queue.length} open`, 'warn')}</div>
          ${queue.length
            ? html`<div class="list">${queue.slice(0, 6).map(({ e, move }) => {
                const stage = staffStage(e);
                return html`<a class="list-item" href="#/exams/${e.id}">
                  ${subjectIcon(e.subject)}
                  <div class="main-col"><b>${e.title}</b><span>${e.subject} · ${e.className}${e.examDate ? ` · ${formatDate(e.examDate)}` : ''}</span></div>
                  <span class="hide-sm">${pill(stage.label, stage.tone)}</span>
                  <span class="btn sm">${move}</span>
                </a>`;
              })}</div>`
            : empty({ iconName: 'check', title: 'You’re all caught up', text: 'Every exam is marked and released.' })}
        </section>

        <section class="card">
          <div class="card-header"><div><h2>Recent exams</h2><p>Hand-in and marking progress</p></div><a class="btn sm ghost" href="#/exams">View all ${icon('arrow')}</a></div>
          ${exams.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>Exam</th><th>Status</th><th class="hide-sm">Handed in</th><th class="right">Avg</th></tr></thead>
                <tbody>${exams.slice(0, 5).map((e) => {
                  const stage = staffStage(e);
                  return html`<tr>
                    <td><a class="cell-title" href="#/exams/${e.id}">${subjectIcon(e.subject)}<div><b>${e.title}</b><span>${e.className}</span></div></a></td>
                    <td>${pill(stage.label, stage.tone)}</td>
                    <td class="hide-sm">${e.status === 'draft' ? html`<span class="faint">–</span>` : barCell(e.submitted, e.classSize, `${e.submitted}/${e.classSize}`)}</td>
                    <td class="right num">${e.averagePct === null ? html`<span class="faint">–</span>` : html`<span class="pill no-dot ${toneFor(e.averagePct)}">${e.averagePct}%</span>`}</td>
                  </tr>`;
                })}</tbody>
              </table></div>`
            : empty({ iconName: 'exams', title: 'No exams yet', text: 'Create an exam and upload the question paper.', action: html`<a class="btn primary" href="#/exams/new">${icon('plus')}New exam</a>` })}
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-header"><div><h2>Weakest topics</h2><p>From per-question marking</p></div>${icon('map')}</div>
          <div class="card-body">
            ${weakest.length
              ? html`<div class="stack tight">${weakest.map((t) => {
                  const top = Object.entries(t.mistakes).sort((a, b) => b[1] - a[1])[0];
                  return html`<div>
                    <div class="row between"><b class="small">${t.topic}</b><span class="small num">${t.masteryPct}%</span></div>
                    ${barCell(t.masteryPct, 100, t.className, toneFor(t.masteryPct))}
                    ${top && top[1] > 0 && html`<div class="tiny muted">Most common: ${mistakeTag(top[0])}</div>`}
                  </div>`;
                })}</div>
                <a class="btn sm block gap-above" href="#/insights">See full Mistake Map</a>`
              : callout('brand', 'spark', 'Unlock topic insights', 'Split an exam into questions with topics, then mark by question.')}
          </div>
        </section>

        <section class="card">
          <div class="card-header"><div><h2>Students to check in on</h2><p>Average below 60%</p></div></div>
          ${insights.watchlist.length
            ? html`<div class="list">${insights.watchlist.slice(0, 5).map((w) => html`<div class="list-item">
                ${avatar(w.name)}
                <div class="main-col"><b>${w.name}</b><span>${w.className || 'No class'} · ${w.exams} exam${w.exams === 1 ? '' : 's'}</span></div>
                <span class="pill no-dot ${toneFor(w.averagePct)}">${w.averagePct}%</span>
              </div>`)}</div>`
            : html`<div class="card-body"><p class="muted small">No one is below 60% right now.</p></div>`}
        </section>
      </div>
    </div>`, 'Overview');
}
