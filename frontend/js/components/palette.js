import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { isStaff, me } from '../core/session.js';
import { icon } from './icons.js';
import { logout, navItems, toggleTheme } from './layout.js';

// Ctrl/Cmd+K command menu: jump to any page or exam, or run an action.
let examsCache = null;

async function entries() {
  if (!examsCache) {
    examsCache = api('/exams').then((r) => r.exams).catch(() => []);
    setTimeout(() => { examsCache = null; }, 30_000);
  }
  const exams = await examsCache;
  return [
    ...navItems().map((n) => ({ group: 'Navigate', label: n.label, icon: n.icon, run: () => { location.hash = n.href; } })),
    { group: 'Navigate', label: 'Settings', icon: 'settings', run: () => { location.hash = '#/account'; } },
    ...(isStaff() ? [{ group: 'Actions', label: 'Create new exam', icon: 'plus', hint: 'Exam', run: () => { location.hash = '#/exams/new'; } },
      { group: 'Actions', label: 'Add students', icon: 'people', run: () => { location.hash = '#/people'; } }] : []),
    { group: 'Actions', label: 'Toggle dark mode', icon: 'moon', run: toggleTheme },
    { group: 'Actions', label: 'Log out', icon: 'logout', run: logout },
    ...exams.map((e) => ({ group: 'Exams', label: e.title, hint: `${e.subject} · ${e.className}`, icon: 'exams', run: () => { location.hash = `#/exams/${e.id}`; } })),
  ];
}

export async function openPalette() {
  if (!me || document.querySelector('dialog.palette')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'palette';
  dialog.innerHTML = html`
    <div class="p-search">${icon('search')}<input type="text" placeholder="Search exams, pages and actions…" aria-label="Search" autocomplete="off" /></div>
    <div class="p-results" role="listbox"></div>
    <div class="p-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.showModal();

  const input = dialog.querySelector('input');
  const list = dialog.querySelector('.p-results');
  const all = await entries();
  let shown = [];
  let sel = 0;

  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.filter((e) => !q || `${e.label} ${e.hint || ''}`.toLowerCase().includes(q)).slice(0, 40);
    sel = Math.min(sel, Math.max(shown.length - 1, 0));
    let group = '';
    list.innerHTML = shown.length
      ? html`${shown.map((e, i) => {
          const head = e.group !== group ? html`<div class="p-group">${e.group}</div>` : '';
          group = e.group;
          return html`${head}<div class="p-item ${i === sel ? 'sel' : ''}" role="option" data-i="${i}">${icon(e.icon)}<span>${e.label}</span>${e.hint && html`<span class="hint">${e.hint}</span>`}</div>`;
        })}`
      : html`<p class="muted small p-none">No results for "${input.value}".</p>`;
    list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const item = shown[i];
    if (!item) return;
    dialog.close();
    item.run();
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter') { choose(sel); e.preventDefault(); }
  });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('[data-i]');
    if (item) choose(Number(item.dataset.i));
  });
  draw();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
});
