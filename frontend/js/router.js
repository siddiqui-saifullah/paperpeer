import { shell } from './components/layout.js';
import { empty } from './components/kit.js';
import { html } from './core/html.js';
import { clearSession, isStaff, me } from './core/session.js';
import { nextRender, renderId } from './core/view.js';
import { accountPage } from './pages/account.js';
import { loginPage, registerPage, setPasswordPage } from './pages/auth.js';
import { examPage } from './pages/exam.js';
import { examsPage } from './pages/exams.js';
import { dashboard } from './pages/home.js';
import { insightsPage } from './pages/insights.js';
import { submissionPage } from './pages/marking.js';
import { newExamPage } from './pages/new-exam.js';
import { peoplePage } from './pages/people.js';
import { skillsPage } from './pages/skills.js';

// To add a page: write it in pages/ and add one line here.
const routes = [
  { path: /^\/$/, page: dashboard },
  { path: /^\/account$/, page: accountPage },
  { path: /^\/exams$/, page: examsPage },
  { path: /^\/insights$/, page: insightsPage, staff: true },
  { path: /^\/skills$/, page: skillsPage, student: true },
  { path: /^\/people$/, page: peoplePage, staff: true },
  { path: /^\/exams\/new$/, page: newExamPage, staff: true },
  { path: /^\/exams\/(\d+)$/, page: examPage },
  { path: /^\/submissions\/([a-f0-9]+)$/, page: submissionPage, staff: true },
];

async function show(token, route) {
  try {
    if (!me) return route === '/register' ? registerPage() : loginPage();
    if (me.mustChangePassword) return setPasswordPage();
    if (route === '/login' || route === '/register') {
      location.hash = '#/';
      return;
    }
    for (const { path, page, staff, student } of routes) {
      const match = route.match(path);
      if (match && (!staff || isStaff()) && (!student || !isStaff())) return await page(token, match[1]);
    }
    throw Object.assign(new Error('Page not found.'), { status: 404 });
  } catch (err) {
    if (token !== renderId) return;
    if (err.status === 401) {
      clearSession();
      return renderRoute();
    }
    const missing = err.status === 404;
    shell('', html`<div class="card">${empty({
      iconName: missing ? 'search' : 'alert',
      title: missing ? 'Page not found' : 'Something went wrong',
      text: missing ? 'This page does not exist or you do not have access to it.' : err.message,
      action: html`<a class="btn primary" href="#/">Back to home</a>`,
    })}</div>`, missing ? 'Not found' : 'Error');
  }
}

export async function renderRoute() {
  const token = nextRender();
  const route = location.hash.replace(/^#/, '').split('?')[0] || '/';
  document.body.classList.add('loading');
  try {
    return await show(token, route);
  } finally {
    if (token === renderId) document.body.classList.remove('loading');
  }
}
