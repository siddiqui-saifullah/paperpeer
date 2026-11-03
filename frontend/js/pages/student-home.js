import { icon } from '../components/icons.js';
import { barCell, callout, empty, kpi, pageHeader, pill, subjectIcon, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { html } from '../core/html.js';
import { me } from '../core/session.js';
import { formatDate, percent } from '../core/ui.js';

// Your score against the class average, oldest exam first. Percentages keep
// exams with different total marks on one axis. Needs two exams to show a trend.
export function progressChart(exams) {
  const points = exams
    .filter((e) => e.marks !== null && e.classAverage !== null)
    .reverse()
    .map((e) => ({ title: e.title, you: percent(e.marks, e.maxMarks), cls: percent(e.classAverage, e.maxMarks) }));
  if (points.length < 2) return '';
  const [w, h, left, right, top, bottom] = [640, 220, 40, 16, 14, 30];
  const x = (i) => left + (i * (w - left - right)) / (points.length - 1);
  const y = (v) => top + ((100 - v) * (h - top - bottom)) / 100;
  const line = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('you')} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  return html`<section class="card">
    <div class="card-header">
      <div><h2>Your progress</h2><p>Score per exam compared with the class average</p></div>
      <div class="legend"><span><i class="legend-line"></i>You</span><span><i class="legend-line cls"></i>Class average</span></div>
    </div>
    <div class="card-body">
      <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Your score compared with the class average in each exam">
        ${[0, 25, 50, 75, 100].map((v) => html`
          <line class="grid" x1="${left}" x2="${w - right}" y1="${y(v)}" y2="${y(v)}"></line>
          <text class="axis" x="${left - 10}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`)}
        <path class="area" d="${area}"></path>
        <path class="series cls" d="${line('cls')}"></path>
        <path class="series you" d="${line('you')}"></path>
        ${points.map((p, i) => html`
          <g class="point">
            <title>${p.title}: you ${p.you}%, class average ${p.cls}%</title>
            <rect class="hit" x="${x(i) - 24}" y="0" width="48" height="${h}"></rect>
            <circle class="cls" cx="${x(i)}" cy="${y(p.cls)}" r="3.5"></circle>
            <circle class="you" cx="${x(i)}" cy="${y(p.you)}" r="4.5"></circle>
            <text class="axis" x="${x(i)}" y="${h - 8}" text-anchor="middle">${p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title}</text>
          </g>`)}
      </svg>
    </div>
  </section>`;
}

export function studentStatus(e) {
  if (e.status === 'collecting' && !e.submitted) return { label: 'To do', tone: 'bad' };
  if (e.status === 'collecting') return { label: 'Submitted', tone: 'info' };
  if (e.marks !== null) return { label: 'Results out', tone: 'good' };
  if (e.marksReleased && !e.submitted) return { label: 'Missed', tone: '' };
  return { label: 'Being marked', tone: 'warn' };
}

export function studentDashboard(exams, skills) {
  const todo = exams.filter((e) => e.status === 'collecting' && !e.submitted);
  const results = exams.filter((e) => e.marks !== null);
  const mine = results.map((e) => percent(e.marks, e.maxMarks));
  const avg = mine.length ? Math.round(mine.reduce((a, b) => a + b, 0) / mine.length) : null;
  const classAvgs = results.filter((e) => e.classAverage !== null).map((e) => percent(e.classAverage, e.maxMarks));
  const classAvg = classAvgs.length ? Math.round(classAvgs.reduce((a, b) => a + b, 0) / classAvgs.length) : null;
  const gap = avg !== null && classAvg !== null ? avg - classAvg : null;
  const focus = skills.slice(0, 3);
  const strongest = skills.at(-1);

  shell('home', html`
    ${pageHeader({
      eyebrow: me.school.name,
      title: `Hi, ${me.name.split(' ')[0]} 👋`,
      sub: todo.length ? `You have ${todo.length} answer${todo.length === 1 ? '' : 's'} to upload.` : 'You’re up to date. Here’s how you’re doing.',
    })}
    <div class="kpis">
      ${kpi({ label: 'Your average', value: avg === null ? '–' : `${avg}%`, foot: `${results.length} exam${results.length === 1 ? '' : 's'} with results`, iconName: 'trend' })}
      ${kpi({ label: 'Versus class', value: gap === null ? '–' : `${gap > 0 ? '+' : ''}${gap}`, unit: gap === null ? '' : 'pts', foot: gap === null ? 'Needs released marks' : gap >= 0 ? 'Above class average' : 'Below class average', footTone: gap === null ? '' : gap >= 0 ? 'up' : 'down', iconName: 'people' })}
      ${kpi({ label: 'Strongest topic', value: strongest ? strongest.topic : '–', foot: strongest ? `${strongest.masteryPct}% mastery` : 'Appears after marking', iconName: 'star' })}
      ${kpi({ label: 'To upload', value: todo.length, foot: todo.length ? 'Before your teacher closes uploads' : 'Nothing pending', footTone: todo.length ? 'down' : 'up', iconName: 'upload' })}
    </div>

    <div class="grid main-side">
      <div class="stack">
        ${todo.length > 0 && html`<section class="card">
          <div class="card-header"><div><h2>To do</h2><p>Upload a clear photo of every page</p></div>${pill(`${todo.length} due`, 'bad')}</div>
          <div class="list">${todo.map((e) => html`<a class="list-item" href="#/exams/${e.id}">
            ${subjectIcon(e.subject)}
            <div class="main-col"><b>${e.title}</b><span>${e.subject}${e.examDate ? ` · ${formatDate(e.examDate)}` : ''}</span></div>
            <span class="btn primary sm">${icon('upload')}Upload answer</span>
          </a>`)}</div>
        </section>`}
        ${progressChart(exams)}
        <section class="card">
          <div class="card-header"><div><h2>Recent exams</h2></div><a class="btn sm ghost" href="#/exams">View all ${icon('arrow')}</a></div>
          ${exams.length
            ? html`<div class="list">${exams.slice(0, 6).map((e) => {
                const s = studentStatus(e);
                const score = e.marks !== null ? percent(e.marks, e.maxMarks) : null;
                return html`<a class="list-item" href="#/exams/${e.id}">
                  ${subjectIcon(e.subject)}
                  <div class="main-col"><b>${e.title}</b><span>${e.subject}${e.examDate ? ` · ${formatDate(e.examDate)}` : ''}</span></div>
                  ${score !== null ? html`<span class="pill no-dot ${toneFor(score)}">${e.marks}/${e.maxMarks}</span>` : pill(s.label, s.tone)}
                  <span class="chev">${icon('chevron')}</span>
                </a>`;
              })}</div>`
            : empty({ title: 'Nothing here yet', text: 'Your exams will appear here when your teacher publishes them.' })}
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-header"><div><h2>Focus next</h2><p>Your weakest topics</p></div>${icon('target')}</div>
          <div class="card-body">
            ${focus.length
              ? html`<div class="stack tight">${focus.map((t) => html`<div>
                  <div class="row between"><b class="small">${t.topic}</b><span class="tiny muted">${t.subject}</span></div>
                  ${barCell(t.masteryPct, 100, `${t.masteryPct}%`, toneFor(t.masteryPct))}
                </div>`)}</div>
                <a class="btn sm block gap-above" href="#/skills">Open Skill Map</a>`
              : callout('brand', 'spark', 'Your Skill Map is on its way', 'It fills in once your teacher marks an exam question by question.')}
          </div>
        </section>
        ${callout('brand', 'bridge', 'Peer Bridge', 'On each result, we match every question you lost marks on to a classmate’s answer that got it fully right.')}
      </div>
    </div>`, 'Home');
}
