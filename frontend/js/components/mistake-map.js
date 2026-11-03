import { html } from '../core/html.js';
import { icon } from './icons.js';
import { MISTAKES } from './kit.js';

// The Mistake Map: for each question (or topic), how well the class did and which
// kinds of mistakes cost them marks. Colours come from classes, never inline styles.

export const heatClass = (p) => (p === null ? 'none' : p < 40 ? 'h0' : p < 55 ? 'h1' : p < 70 ? 'h2' : p < 85 ? 'h3' : 'h4');
const level = (count, total) => {
  if (!count || !total) return 'l0';
  const share = count / total;
  return share < 0.15 ? 'l1' : share < 0.3 ? 'l2' : share < 0.5 ? 'l3' : 'l4';
};

// rows: [{ title, sub, scorePct, total, mistakes: { concept: n, ... } }]
export const mistakeMatrix = (rows, scoreLabel = 'Avg score') => html`
  <div class="table-wrap">
    <table class="heatmap">
      <thead><tr>
        <th></th>
        <th>${scoreLabel}</th>
        ${Object.entries(MISTAKES).map(([key, m]) => html`<th title="${m.hint}"><span class="mistake m-${key}"><i></i>${m.label}</span></th>`)}
      </tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <th scope="row"><b class="small">${r.title}</b>${r.sub && html`<div class="tiny faint">${r.sub}</div>`}</th>
        <td><div class="heat ${heatClass(r.scorePct)}">${r.scorePct === null ? '–' : `${r.scorePct}%`}</div></td>
        ${Object.keys(MISTAKES).map((key) => html`<td><div class="mcell m-${key} ${level(r.mistakes[key], r.total)}" title="${r.mistakes[key]} of ${r.total}">${r.mistakes[key] || '·'}</div></td>`)}
      </tr>`)}</tbody>
    </table>
  </div>
  <div class="legend gap-above">
    <span><i class="sw h0"></i>Below 40%</span><span><i class="sw h2"></i>55–70%</span><span><i class="sw h4"></i>85%+</span>
    <span>Mistake cells darken as more of the class makes that mistake.</span>
  </div>`;

// Average score per question as a bar chart.
export function questionChart(questions) {
  const scored = questions.filter((q) => q.averagePct !== null);
  if (!scored.length) return '';
  const [w, h, left, bottom, top] = [640, 200, 36, 26, 16];
  const slot = (w - left) / scored.length;
  const barW = Math.min(46, slot * 0.6);
  const y = (v) => top + ((100 - v) * (h - top - bottom)) / 100;
  return html`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Average score per question">
    ${[0, 50, 100].map((v) => html`<line class="grid" x1="${left}" x2="${w}" y1="${y(v)}" y2="${y(v)}"></line>
      <text class="axis" x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`)}
    ${scored.map((q, i) => {
      const x = left + i * slot + (slot - barW) / 2;
      const tone = q.averagePct < 50 ? 'low' : q.averagePct < 70 ? 'mid' : '';
      return html`<g><title>${q.label}${q.topic ? ` · ${q.topic}` : ''}: ${q.averagePct}% average</title>
        <rect class="bar-q ${tone}" x="${x.toFixed(1)}" y="${y(q.averagePct).toFixed(1)}" width="${barW.toFixed(1)}" height="${(y(0) - y(q.averagePct)).toFixed(1)}" rx="5"></rect>
        <text class="bar-value" x="${(x + barW / 2).toFixed(1)}" y="${(y(q.averagePct) - 6).toFixed(1)}" text-anchor="middle">${q.averagePct}%</text>
        <text class="bar-label" x="${(x + barW / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle">${q.label}</text></g>`;
    })}
  </svg>`;
}

// Plain-language takeaways a teacher can act on in the next lesson.
export function reteach(questions) {
  const scored = questions.filter((q) => q.scored > 0);
  if (!scored.length) return [];
  const out = [];
  const worst = [...scored].sort((a, b) => a.averagePct - b.averagePct)[0];
  if (worst.averagePct < 70) {
    out.push({ icon: 'target', title: `Reteach ${worst.label}${worst.topic ? ` (${worst.topic})` : ''}`, text: `The class averaged ${worst.averagePct}%. Only ${worst.fullMarks} of ${worst.scored} got full marks.` });
  }
  const totals = Object.keys(MISTAKES).map((k) => [k, scored.reduce((n, q) => n + q.mistakes[k], 0)]).sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = totals[0];
  if (topCount > 0) {
    const where = scored.filter((q) => q.mistakes[topKey] > 0).map((q) => q.label).join(', ');
    const advice = {
      concept: 'Revisit the idea itself before more practice.',
      calculation: 'Method is fine. Add a quick check-your-working routine.',
      misread: 'Practise underlining what each question actually asks.',
      incomplete: 'Show a model answer with every step written out.',
      unattempted: 'Look at timing, or whether the paper was too long.',
    }[topKey];
    out.push({ icon: 'alert', title: `Most common: ${MISTAKES[topKey].label.toLowerCase()} (${topCount}×)`, text: `Seen in ${where}. ${advice}` });
  }
  const best = [...scored].sort((a, b) => b.averagePct - a.averagePct)[0];
  if (best !== worst && best.averagePct >= 75) {
    out.push({ icon: 'star', title: `${best.label} is secure`, text: `${best.averagePct}% average. Move on from ${best.topic || 'this'} with confidence.` });
  }
  return out;
}

export const insightList = (items) => html`<div class="stack tight">${items.map((i) => html`<div class="insight">
  <span class="ic">${icon(i.icon)}</span><div><b>${i.title}</b><p>${i.text}</p></div></div>`)}</div>`;
