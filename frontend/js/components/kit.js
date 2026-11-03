import { html } from '../core/html.js';
import { icon } from './icons.js';

// Small, shared building blocks so every page looks like the same product.

const hash = (text) => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const initials = (name) => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const avatar = (name, size = '', extra = '') =>
  html`<span class="avatar ${size} ${extra} av-${hash(name) % 8}" aria-hidden="true">${initials(name)}</span>`;

export const subjectIcon = (subject) =>
  html`<span class="subject-icon s-${hash(subject) % 5}" aria-hidden="true">${String(subject).slice(0, 2).toUpperCase()}</span>`;

export const pill = (text, tone = '') => html`<span class="pill ${tone}">${text}</span>`;

export const toneFor = (pct) => (pct === null || pct === undefined ? '' : pct >= 75 ? 'good' : pct >= 50 ? 'warn' : 'bad');

export const bar = (value, max, tone = '') =>
  html`<progress class="bar ${tone}" max="${max || 1}" value="${value}"></progress>`;

export const barCell = (value, max, label, tone = '') =>
  html`<div class="bar-cell">${bar(value, max, tone)}<span>${label}</span></div>`;

// A score ring. Geometry lives in SVG attributes because the CSP forbids inline styles.
export function ring(pct, caption = '') {
  const r = 46;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct ?? 0));
  return html`<svg class="ring ${toneFor(pct)}" viewBox="0 0 112 112" role="img" aria-label="${shown}%">
    <circle class="track" cx="56" cy="56" r="${r}" fill="none" stroke-width="9"></circle>
    <circle class="value" cx="56" cy="56" r="${r}" fill="none" stroke-width="9" stroke-dasharray="${((shown / 100) * c).toFixed(1)} ${c.toFixed(1)}"></circle>
    <text x="56" y="${caption ? 58 : 64}" text-anchor="middle">${pct === null ? '–' : `${shown}%`}</text>
    ${caption && html`<text class="sub" x="56" y="74" text-anchor="middle">${caption}</text>`}
  </svg>`;
}

export const kpi = ({ label, value, unit, foot, footTone = '', iconName }) => html`
  <div class="card kpi">
    <div class="label">${iconName && icon(iconName)}${label}</div>
    <div class="value">${value}${unit && html` <small>${unit}</small>`}</div>
    ${foot && html`<div class="foot ${footTone}">${foot}</div>`}
  </div>`;

export const pageHeader = ({ eyebrow, title, sub, meta, actions }) => html`
  <div class="page-header">
    <div>
      ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
      <h1>${title}</h1>
      ${sub && html`<p class="sub">${sub}</p>`}
      ${meta && html`<div class="meta">${meta}</div>`}
    </div>
    ${actions && html`<div class="row">${actions}</div>`}
  </div>`;

export const metaItem = (iconName, text) => html`<span>${icon(iconName)}${text}</span>`;

export const empty = ({ iconName = 'inbox', title, text, action }) => html`
  <div class="empty">
    <div class="icon">${icon(iconName)}</div>
    <h2>${title}</h2>
    ${text && html`<p>${text}</p>`}
    ${action}
  </div>`;

export const callout = (tone, iconName, title, text) =>
  html`<div class="callout ${tone}">${icon(iconName)}<div><b>${title}</b>${text && html`<span class="muted">${text}</span>`}</div></div>`;

export const MISTAKES = {
  concept: { label: 'Concept gap', hint: 'Did not understand the idea' },
  calculation: { label: 'Calculation slip', hint: 'Right method, wrong arithmetic' },
  misread: { label: 'Misread question', hint: 'Answered something else' },
  incomplete: { label: 'Incomplete working', hint: 'Steps or reasoning missing' },
  unattempted: { label: 'Not attempted', hint: 'Left blank or ran out of time' },
};

export const mistakeTag = (key) => key && MISTAKES[key] ? html`<span class="mistake m-${key}"><i></i>${MISTAKES[key].label}</span>` : '';

// Where an exam is in its life, for staff.
export function staffStage(e) {
  if (e.status === 'draft') return { key: 'draft', label: 'Draft', tone: '' };
  if (e.status === 'collecting') return { key: 'collecting', label: 'Collecting', tone: 'info' };
  if (e.submitted > e.graded) return { key: 'marking', label: 'Marking', tone: 'warn' };
  if (!e.marksReleased) return { key: 'ready', label: 'Ready to release', tone: 'brand' };
  return { key: 'released', label: 'Released', tone: 'good' };
}

export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
