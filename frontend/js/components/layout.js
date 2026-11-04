import { me, isStaff, clearSession } from '../core/session.js';
import { api } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { root, store } from '../core/ui.js';
import { render } from '../core/view.js';
import { icon } from './icons.js';
import { avatar } from './kit.js';
import { openPalette } from './palette.js';

export function navItems() {
  if (isStaff()) {
    return [
      { key: 'home', href: '#/', label: 'Overview', icon: 'home' },
      { key: 'exams', href: '#/exams', label: 'Exams', icon: 'exams' },
      { key: 'insights', href: '#/insights', label: 'Mistake Map', icon: 'map', isNew: true },
      { key: 'people', href: '#/people', label: 'People', icon: 'people' },
    ];
  }
  return [
    { key: 'home', href: '#/', label: 'Home', icon: 'home' },
    { key: 'exams', href: '#/exams', label: 'My exams', icon: 'exams' },
    { key: 'skills', href: '#/skills', label: 'Skill Map', icon: 'target', isNew: true },
  ];
}

export const currentTheme = () =>
  document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  root.querySelector('#theme-toggle')?.replaceChildren(...themeIcon().childNodes);
}

const themeIcon = () => {
  const box = document.createElement('span');
  box.innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon');
  return box;
};

const roleLabel = () => ({ admin: 'Administrator', teacher: 'Teacher', student: 'Student' })[me.role];

// Renders the app frame: sidebar, top bar with breadcrumbs, then the page itself.
// crumbs is a list of [label, href]; the page title is always the last crumb.
export function shell(active, content, title, crumbs = []) {
  document.title = title ? `${title} · PaperPeer` : 'PaperPeer';
  document.body.classList.remove('nav-open');
  const trail = [...crumbs, [title || 'Home']];
  root.innerHTML = html`
    <div class="app">
      <aside class="sidebar" aria-label="Main">
        <a class="sb-brand" href="#/"><span class="logo">${icon('logo')}</span><span class="wordmark"><span class="wm-paper">Paper</span><span class="wm-peer">Peer</span></span></a>
        <div class="workspace">
          ${avatar(me.school.name, 'sm', 'sq')}
          <div class="grow"><div class="ws-name">${me.school.name}</div><div class="ws-sub">Workspace · ${me.school.code}</div></div>
        </div>
        <button class="sb-search" type="button" data-palette>${icon('search')}<span class="grow">Search</span><kbd>Ctrl K</kbd></button>
        <nav class="sb-nav">
          <p class="sb-label">${isStaff() ? 'Workspace' : 'Learning'}</p>
          ${navItems().map((n) => html`<a class="nav-item ${active === n.key ? 'active' : ''}" href="${n.href}" ${active === n.key ? new Safe('aria-current="page"') : ''}>
            ${icon(n.icon)}${n.label}${n.isNew && html`<span class="tag-new">New</span>`}</a>`)}
          <p class="sb-label">Account</p>
          <a class="nav-item ${active === 'account' ? 'active' : ''}" href="#/account">${icon('settings')}Settings</a>
        </nav>
        <div class="sb-foot">
          <button class="me-row" type="button" id="me-menu" aria-haspopup="menu">
            ${avatar(me.name)}
            <div class="who grow"><b>${me.name}</b><span>${roleLabel()}</span></div>
            ${icon('down')}
          </button>
        </div>
      </aside>
      <div class="scrim" data-close-nav></div>
      <div class="main">
        <header class="topbar no-print">
          <button class="icon-btn menu-toggle" type="button" aria-label="Open menu" data-open-nav>${icon('menu')}</button>
          <nav class="crumbs" aria-label="Breadcrumb">
            ${trail.map(([label, href], i) => html`${i > 0 && html`<span class="sep ${i < trail.length - 1 ? 'crumb-mid' : ''}">/</span>`}${href
              ? html`<a class="${i < trail.length - 1 ? 'crumb-mid' : ''}" href="${href}">${label}</a>`
              : html`<span class="here">${label}</span>`}`)}
          </nav>
          <span class="spacer"></span>
          <button class="icon-btn" type="button" data-palette aria-label="Search">${icon('search')}</button>
          <button class="icon-btn" type="button" id="theme-toggle" aria-label="Toggle dark mode">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
        </header>
        <main class="page" tabindex="-1">${content}</main>
      </div>
    </div>`;

  root.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', openPalette));
  root.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
  root.querySelector('[data-open-nav]').addEventListener('click', () => document.body.classList.add('nav-open'));
  root.querySelector('[data-close-nav]').addEventListener('click', () => document.body.classList.remove('nav-open'));
  root.querySelector('#me-menu').addEventListener('click', (e) => userMenu(e.currentTarget));
}

function userMenu(anchor) {
  document.querySelector('.popover')?.remove();
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = html`
    <div class="pop-head"><b>${me.name}</b><span>@${me.username} · ${me.school.name}</span></div>
    <a href="#/account" role="menuitem">${icon('settings')}Account settings</a>
    <button type="button" role="menuitem" data-act="theme">${icon('moon')}Toggle theme</button>
    <button type="button" role="menuitem" data-act="palette">${icon('search')}Command menu</button>
    <button type="button" role="menuitem" data-act="logout">${icon('logout')}Log out</button>`;
  document.body.append(pop);
  const box = anchor.getBoundingClientRect();
  pop.style.left = `${box.left}px`;
  pop.style.bottom = `${innerHeight - box.top + 6}px`;
  pop.style.width = `${box.width}px`;
  const close = () => { pop.remove(); document.removeEventListener('pointerdown', outside); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('pointerdown', outside));
  pop.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    close();
    if (act === 'theme') toggleTheme();
    if (act === 'palette') openPalette();
    if (act === 'logout') logout();
  });
}

export async function logout() {
  await api('/logout', { method: 'POST' }).catch(() => {});
  clearSession();
  location.hash = '#/login';
  render();
}
