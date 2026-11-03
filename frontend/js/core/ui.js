import { render } from './view.js';
import { html } from './html.js';

export const root = document.getElementById('app');

// Promise-based replacement for confirm(), styled with the app.
export function ask(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = html`
      <form method="dialog" class="stack">
        <p>${message}</p>
        <div class="row end">
          <button class="btn" value="no">Cancel</button>
          <button class="btn ${danger ? 'solid-danger' : 'primary'}" value="yes">${confirmLabel}</button>
        </div>
      </form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'yes');
      dialog.remove();
    });
    dialog.showModal();
  });
}

export function toast(message, bad = false) {
  const box = document.getElementById('toast');
  box.innerHTML = html`<div class="${bad ? 'bad' : ''}">${message}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (box.innerHTML = ''), 4000);
}

export const store = {
  get(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* optional convenience */ }
  },
};

export const on = (selector, event, handler, scope = root) =>
  scope.querySelectorAll(selector).forEach((el) => el.addEventListener(event, handler));

export function bindForm(selector, handler) {
  on(selector, 'submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter || form.querySelector('button[type=submit]');
    const errorBox = form.querySelector('.error');
    errorBox?.classList.add('hidden');
    if (button) {
      button.disabled = true;
      button.classList.add('busy');
    }
    try {
      await handler(Object.fromEntries(new FormData(form)), form, event.submitter?.value);
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      } else toast(err.message, true);
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove('busy');
      }
    }
  });
}

// Runs an action, then redraws the page so it always shows server state.
export const act = (fn, done) => async (event) => {
  const el = event.currentTarget;
  if (el.tagName === 'BUTTON') el.disabled = true;
  try {
    const message = await fn(el);
    if (typeof message === 'string') toast(message);
    await (done ? done() : render());
  } catch (err) {
    toast(err.message, true);
    if (err.status !== 401) await render();
  }
};

export const formatDate = (value) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const percent = (marks, max) => Math.round((marks / max) * 100);
export const errorLine = html`<p class="error hidden" role="alert"></p>`;

