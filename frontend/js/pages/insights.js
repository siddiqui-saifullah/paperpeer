import { icon } from '../components/icons.js';
import { MISTAKES, avatar, callout, empty, kpi, pageHeader, toneFor } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { insightList, mistakeMatrix } from '../components/mistake-map.js';
import { api } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { on, store } from '../core/ui.js';
import { render, renderId } from '../core/view.js';

// School-wide Mistake Map: every topic, in every class, with the kinds of
// mistakes behind lost marks. Built from per-question marking across all exams.
export async function insightsPage(token) {
  const { topics, watchlist } = await api('/insights');
  if (token !== renderId) return;
  const classes = [...new Set(topics.map((t) => t.className))];
  const shownClass = classes.includes(store.get('insightClass')) ? store.get('insightClass') : '';
  const shown = topics.filter((t) => !shownClass || t.className === shownClass);
  const totals = Object.keys(MISTAKES).map((k) => [k, shown.reduce((n, t) => n + t.mistakes[k], 0)]).sort((a, b) => b[1] - a[1]);
  const answers = shown.reduce((n, t) => n + t.answers, 0);
  const weakest = shown[0];
  const strongest = shown.at(-1);
  const takeaways = [];
  if (weakest && weakest.masteryPct < 70) {
    takeaways.push({ icon: 'target', title: `Prioritise ${weakest.topic} in ${weakest.className}`, text: `Only ${weakest.masteryPct}% mastery across ${weakest.answers} answered questions.` });
  }
  if (totals[0]?.[1] > 0) {
    takeaways.push({ icon: 'alert', title: `${MISTAKES[totals[0][0]].label} is the biggest leak`, text: `${totals[0][1]} of the mistakes tagged so far. ${MISTAKES[totals[0][0]].hint}.` });
  }
  if (strongest && strongest !== weakest && strongest.masteryPct >= 75) {
    takeaways.push({ icon: 'star', title: `${strongest.topic} is secure`, text: `${strongest.masteryPct}% mastery in ${strongest.className}.` });
  }

  shell('insights', html`
    ${pageHeader({
      eyebrow: html`${icon('spark')}Only in PaperPeer`,
      title: 'Mistake Map',
      sub: 'Not just who scored low, but which ideas a class is missing, and why marks were lost.',
      actions: classes.length > 1 && html`<select id="insight-class" aria-label="Class">
        <option value="">All classes</option>
        ${classes.map((c) => html`<option ${c === shownClass ? new Safe('selected') : ''}>${c}</option>`)}
      </select>`,
    })}
    ${topics.length
      ? html`
        <div class="kpis">
          ${kpi({ label: 'Topics tracked', value: shown.length, foot: `${answers} question answers analysed`, iconName: 'layers' })}
          ${kpi({ label: 'Weakest topic', text: !!weakest, value: weakest ? weakest.topic : '–', foot: weakest ? `${weakest.masteryPct}% mastery · ${weakest.className}` : '', footTone: 'down', iconName: 'target' })}
          ${kpi({ label: 'Top mistake', text: !!totals[0]?.[1], value: totals[0]?.[1] ? MISTAKES[totals[0][0]].label : '–', foot: totals[0]?.[1] ? `${totals[0][1]} times` : 'None tagged yet', iconName: 'alert' })}
          ${kpi({ label: 'Students to check in on', value: watchlist.length, foot: 'Average below 60%', footTone: watchlist.length ? 'down' : 'up', iconName: 'people' })}
        </div>
        <section class="card gap-below">
            <div class="card-header"><div><h2>Topic × mistake</h2><p>Weakest topics first. Each cell counts answers that lost marks for that reason.</p></div></div>
            <div class="card-body">${mistakeMatrix(shown.map((t) => ({ title: t.topic, sub: `${t.subject} · ${t.className}`, scorePct: t.masteryPct, total: t.answers, mistakes: t.mistakes })), 'Mastery')}</div>
        </section>
        <div class="grid cols-2">
            <section class="card">
              <div class="card-header"><div><h2>What to do next</h2><p>Generated from the map</p></div>${icon('spark')}</div>
              <div class="card-body">${takeaways.length ? insightList(takeaways) : html`<p class="muted small">Keep marking by question to see recommendations.</p>`}</div>
            </section>
            <section class="card">
              <div class="card-header"><div><h2>Check in with</h2><p>Lowest averages across all exams</p></div></div>
              ${watchlist.length
                ? html`<div class="list">${watchlist.map((w) => html`<div class="list-item">
                    ${avatar(w.name)}
                    <div class="main-col"><b>${w.name}</b><span>${w.className || 'No class'} · ${w.exams} exam${w.exams === 1 ? '' : 's'}</span></div>
                    <span class="pill no-dot ${toneFor(w.averagePct)}">${w.averagePct}%</span>
                  </div>`)}</div>`
                : html`<div class="card-body"><p class="small muted">No one is below 60%.</p></div>`}
            </section>
        </div>`
      : html`<section class="card">${empty({
          iconName: 'map',
          title: 'Your Mistake Map starts with one exam',
          text: 'Split an exam into questions, give each a topic, and tag the mistake when you mark. Topics then roll up across every exam and class.',
          action: html`<a class="btn primary" href="#/exams/new">${icon('plus')}Create an exam with questions</a>`,
        })}</section>
        <div class="grid cols-3 gap-above">
          ${callout('brand', 'layers', 'Per question', 'See which question sank the class average.')}
          ${callout('brand', 'alert', 'Per mistake type', 'Concept gap or careless slip? They need different fixes.')}
          ${callout('brand', 'bridge', 'Peer Bridge', 'Students get pointed to a classmate who nailed the question they missed.')}
        </div>`}`, 'Mistake Map');

  on('#insight-class', 'change', (e) => { store.set('insightClass', e.target.value); render(); });
}
