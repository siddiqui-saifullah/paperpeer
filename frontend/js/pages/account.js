import { icon } from '../components/icons.js';
import { avatar, pageHeader } from '../components/kit.js';
import { currentTheme, logout, shell, toggleTheme } from '../components/layout.js';
import { api } from '../core/api.js';
import { html } from '../core/html.js';
import { me } from '../core/session.js';
import { bindForm, errorLine, on, root, toast } from '../core/ui.js';

export function accountPage() {
  const role = { admin: 'Administrator', teacher: 'Teacher', student: 'Student' }[me.role];
  shell('account', html`
    ${pageHeader({ title: 'Settings', sub: 'Your profile, appearance and security.' })}
    <div class="card">
      <section class="form-section">
        <div class="about"><h3>Profile</h3><p>Managed by your school. Ask an admin to change your name.</p></div>
        <div class="row nowrap">
          ${avatar(me.name, 'lg')}
          <div>
            <b>${me.name}</b>
            <p class="small muted">@${me.username} · ${role}</p>
            <p class="small muted">${me.school.name} · school code <code>${me.school.code}</code></p>
          </div>
        </div>
      </section>
      <section class="form-section">
        <div class="about"><h3>Appearance</h3><p>Saved on this device.</p></div>
        <div class="segmented" role="group" aria-label="Theme">
          <button type="button" data-theme-pick="light" class="${currentTheme() === 'light' ? 'active' : ''}">${icon('sun')} Light</button>
          <button type="button" data-theme-pick="dark" class="${currentTheme() === 'dark' ? 'active' : ''}">${icon('moon')} Dark</button>
        </div>
      </section>
      <section class="form-section">
        <div class="about"><h3>Password</h3><p>Changing it signs you out everywhere else.</p></div>
        <form class="stack" id="change-password">
          <label class="field">Current password <input type="password" name="currentPassword" required autocomplete="current-password" /></label>
          <label class="field">New password
            <small>At least 8 characters</small>
            <input type="password" name="newPassword" required minlength="8" autocomplete="new-password" />
          </label>
          ${errorLine}
          <div><button class="btn primary" type="submit">Update password</button></div>
        </form>
      </section>
      <section class="form-section">
        <div class="about"><h3>Session</h3><p>Sign out of PaperPeer on this device.</p></div>
        <div><button class="btn danger" id="logout" type="button">${icon('logout')}Log out</button></div>
      </section>
    </div>`, 'Settings');
  on('#logout', 'click', logout);
  on('[data-theme-pick]', 'click', (e) => {
    if (e.currentTarget.dataset.themePick !== currentTheme()) toggleTheme();
    root.querySelectorAll('[data-theme-pick]').forEach((b) => b.classList.toggle('active', b.dataset.themePick === currentTheme()));
  });
  bindForm('#change-password', async (data, form) => {
    await api('/password', { method: 'POST', body: data });
    form.reset();
    toast('Password updated.');
  });
}
