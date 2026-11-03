import { icon } from '../components/icons.js';
import { callout, empty, kpi, masteryLevel, pageHeader, pill, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { renderId } from '../core/view.js';

// A student's own mastery per topic, from every exam marked question by question.
export async function skillsPage(token) {
  const { skills } = await api('/me/skills');
  if (token !== renderId) return;
  const focus = skills.filter((s) => s.masteryPct < 70);
  const strong = skills.filter((s) => s.masteryPct >= 85);
  const subjects = [...new Set(skills.map((s) => s.subject))];

  shell('skills', html`
    ${pageHeader({
      eyebrow: html`${icon('spark')}Only in PaperPeer`,
      title: 'Skill Map',
      sub: 'Your mastery of each topic, built from every question your teacher has marked.',
    })}
    ${skills.length
      ? html`
        <div class="kpis">
          ${kpi({ label: 'Topics', value: skills.length, foot: `${subjects.length} subject${subjects.length === 1 ? '' : 's'}`, iconName: 'layers' })}
          ${kpi({ label: 'Mastered', value: strong.length, foot: '85% or more', footTone: 'up', iconName: 'star' })}
          ${kpi({ label: 'Focus areas', value: focus.length, foot: 'Below 70%', footTone: focus.length ? 'down' : 'up', iconName: 'target' })}
          ${kpi({ label: 'Questions analysed', value: skills.reduce((n, s) => n + s.questions, 0), iconName: 'exams' })}
        </div>
        <div class="grid main-side">
          ${subjects.length
            ? html`<div class="stack">${subjects.map((subject) => html`<section class="card">
                <div class="card-header"><div><h2>${subject}</h2></div></div>
                <div class="card-body">${skills.filter((s) => s.subject === subject).map((s) => html`<div class="skill">
                  <div><b>${s.topic}</b><span>${s.questions} question${s.questions === 1 ? '' : 's'} · ${masteryLevel(s.masteryPct)}</span></div>
                  <progress class="bar ${toneFor(s.masteryPct)}" max="100" value="${s.masteryPct}"></progress>
                  <span class="pct ${toneFor(s.masteryPct)}">${s.masteryPct}%</span>
                </div>`)}</div>
              </section>`)}</div>`
            : ''}
          <div class="stack">
            <section class="card">
              <div class="card-header"><div><h2>Your study plan</h2><p>Start at the top</p></div>${icon('target')}</div>
              ${focus.length
                ? html`<div class="list">${focus.map((s, i) => html`<div class="list-item">
                    <span class="avatar sm av-${i % 8}">${i + 1}</span>
                    <div class="main-col"><b>${s.topic}</b><span>${s.subject}</span></div>
                    ${pill(`${s.masteryPct}%`, toneFor(s.masteryPct))}
                  </div>`)}</div>`
                : html`<div class="card-body"><p class="small muted">No focus areas. Great work: keep it up.</p></div>`}
            </section>
            ${callout('brand', 'bridge', 'Use Peer Bridge', 'Open any result to see a classmate’s full-marks answer for each question you lost marks on.')}
          </div>
        </div>`
      : html`<section class="card">${empty({
          iconName: 'target',
          title: 'Your Skill Map is on its way',
          text: 'It fills in when your teacher marks an exam question by question and releases the marks.',
          action: html`<a class="btn" href="#/exams">See my exams</a>`,
        })}</section>`}`, 'Skill Map');
}
