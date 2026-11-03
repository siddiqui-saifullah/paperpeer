import { icon } from '../components/icons.js';
import { api } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { loadMe, me } from '../core/session.js';
import { bindForm, errorLine, on, root, store } from '../core/ui.js';
import { render } from '../core/view.js';

const FEATURES = [
  ['map', 'Mistake Map', 'See which questions, topics and kinds of mistakes cost each class marks.'],
  ['bridge', 'Peer Bridge', 'Every lost question links to a classmate’s full-marks answer, names hidden.'],
  ['target', 'Skill Map', 'Students track mastery per topic across every exam.'],
  ['camera', 'Phone hand-in', 'Snap pages, auto-compressed, location data stripped.'],
];

function authLayout(content) {
  document.title = 'PaperPeer · Learn from every exam';
  root.innerHTML = html`
    <div class="auth">
      <section class="auth-art">
        <a class="sb-brand" href="#/login"><span class="logo">${icon('logo')}</span>PaperPeer</a>
        <div>
          <h1>Every exam already holds the lesson. <em>We find it.</em></h1>
          <p class="lead">PaperPeer turns marked papers into a map of what each class is missing, and connects every student to the classmate who got it right.</p>
          <div class="feature-list">
            ${FEATURES.map(([ic, title, text]) => html`<div class="feature">${icon(ic)}<b>${title}</b><p>${text}</p></div>`)}
          </div>
        </div>
        <div class="trust">
          <span>${icon('shield')}Every school fully isolated</span>
          <span>${icon('lock')}Marks private to each student</span>
          <span>${icon('eye')}Anonymous peer sharing</span>
        </div>
      </section>
      <section class="auth-panel">${content}</section>
    </div>`;
  on('[data-show-password]', 'click', (event) => {
    const input = event.currentTarget.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Hide' : 'Show';
  });
}

const passwordField = (name, autocomplete, minlength) => html`
  <span class="password">
    <input type="password" name="${name}" required autocomplete="${autocomplete}" ${minlength ? new Safe(`minlength="${minlength}"`) : ''} />
    <button class="plain" type="button" data-show-password>Show</button>
  </span>`;

let changingSchool = false;

export function loginPage() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const school = changingSchool ? '' : params.get('school') || store.get('schoolCode');
  authLayout(html`
    <form class="auth-form" id="login">
      <div><h2>Welcome back</h2></div>
      <p class="lead">Sign in to your school’s workspace.</p>
      ${school
        ? html`<div class="school-chip"><span>${icon('class')} Workspace <b>${school}</b></span>
            <button class="plain small" type="button" id="change-school">Change</button>
            <input type="hidden" name="school" value="${school}" /></div>`
        : html`<label class="field">School code
            <input type="text" name="school" required autocomplete="organization" autocapitalize="none" placeholder="e.g. greenfield" />
            <small>Your teacher or school office can give you this</small>
          </label>`}
      <label class="field">Username
        <input type="text" name="username" required autocomplete="username" autocapitalize="none" autofocus />
      </label>
      <label class="field">Password ${passwordField('password', 'current-password')}</label>
      ${errorLine}
      <button class="btn primary lg block" type="submit">Sign in</button>
      <p class="small muted">Forgot your password? Your teacher can reset it in one click.</p>
      <div class="divider">New to PaperPeer?</div>
      <a class="btn lg block" href="#/register">${icon('plus')}Create a school workspace</a>
    </form>`);
  on('#change-school', 'click', () => {
    changingSchool = true;
    loginPage();
  });
  bindForm('#login', async (data) => {
    await api('/login', { method: 'POST', body: data });
    changingSchool = false;
    store.set('schoolCode', data.school.trim().toLowerCase());
    await loadMe();
    location.hash = '#/';
    render();
  });
}

const toCode = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31);

export function registerPage() {
  authLayout(html`
    <form class="auth-form" id="register">
      <div><h2>Create your workspace</h2></div>
      <p class="lead">Free for your whole school. Set up in two minutes.</p>
      <label class="field">School name
        <input type="text" name="schoolName" required maxlength="120" placeholder="Greenfield Public School" />
      </label>
      <label class="field">School code
        <input type="text" name="code" required maxlength="31" pattern="[a-z0-9][a-z0-9\\-]{2,30}" title="Lowercase letters, numbers and hyphens" autocapitalize="none" />
        <small>Everyone signs in with this. It can’t change later.</small>
      </label>
      <label class="field">Your name
        <input type="text" name="adminName" required maxlength="100" autocomplete="name" />
      </label>
      <label class="field">Password
        ${passwordField('password', 'new-password', 8)}
        <small>At least 8 characters. Your username will be <code>admin</code>.</small>
      </label>
      ${errorLine}
      <button class="btn primary lg block" type="submit">Create workspace</button>
      <p class="small muted">Already have one? <a href="#/login">Sign in</a></p>
    </form>`);
  const code = root.querySelector('[name=code]');
  let edited = false;
  code.addEventListener('input', () => { edited = true; });
  root.querySelector('[name=schoolName]').addEventListener('input', (e) => {
    if (!edited) code.value = toCode(e.target.value);
  });
  bindForm('#register', async (data) => {
    await api('/schools', { method: 'POST', body: { ...data, username: 'admin' } });
    store.set('schoolCode', data.code.trim().toLowerCase());
    await loadMe();
    location.hash = '#/';
    render();
  });
}

export function setPasswordPage() {
  authLayout(html`
    <form class="auth-form" id="set-password">
      <div><h2>Welcome, ${me.name.split(' ')[0]}</h2></div>
      <p class="lead">Choose your own password to continue.</p>
      <label class="field">Password from your teacher ${passwordField('currentPassword', 'current-password')}</label>
      <label class="field">New password
        ${passwordField('newPassword', 'new-password', 8)}
        <small>At least 8 characters</small>
      </label>
      ${errorLine}
      <button class="btn primary lg block" type="submit">Continue</button>
    </form>`);
  bindForm('#set-password', async (data) => {
    await api('/password', { method: 'POST', body: data });
    await loadMe();
    location.hash = '#/';
    render();
  });
}
