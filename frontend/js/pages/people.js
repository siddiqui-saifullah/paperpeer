import { credentialsTable } from '../components/credentials.js';
import { icon } from '../components/icons.js';
import { avatar, empty, kpi, pageHeader, pill } from '../components/kit.js';
import { shell } from '../components/layout.js';
import { api } from '../core/api.js';
import { Safe, html } from '../core/html.js';
import { me } from '../core/session.js';
import { act, bindForm, errorLine, on, root, store, toast } from '../core/ui.js';
import { render, renderId } from '../core/view.js';

let lastCreated = null;

function parseStudents(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length === 1) return { name: parts[0], rollNo: '' };
      return /\d/.test(parts[0]) ? { rollNo: parts[0], name: parts[1] } : { name: parts[0], rollNo: parts[1] };
    });
}

function manageDialog(user, classes) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = html`
    <div class="stack">
      <div class="row nowrap">${avatar(user.name, 'lg')}<div><h2>${user.name}</h2><p class="small muted">Username <code>${user.username}</code>${user.className ? ` · ${user.className}` : ''}</p></div></div>
      <button class="btn" type="button" data-do="reset">${icon('lock')}Generate a new password</button>
      ${user.role === 'student' && classes.length > 1 && html`<label class="field">Move to class
        <select data-do="move">${classes.map((c) => html`<option value="${c.id}" ${c.id === user.classId ? new Safe('selected') : ''}>${c.name}</option>`)}</select>
      </label>`}
      <button class="btn ${user.active ? 'danger' : ''}" type="button" data-do="active">${user.active ? 'Suspend access' : 'Restore access'}</button>
      <div class="row end"><button class="btn ghost" type="button" data-do="close">Close</button></div>
    </div>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  const finish = async (message) => {
    dialog.close();
    if (message) toast(message);
    await render();
  };
  const run = (fn) => async () => {
    try { await fn(); } catch (err) { toast(err.message, true); }
  };
  dialog.querySelector('[data-do=close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-do=reset]').addEventListener('click', run(async () => {
    lastCreated = (await api(`/users/${user.id}/reset-password`, { method: 'POST' })).created;
    await finish();
  }));
  dialog.querySelector('[data-do=active]').addEventListener('click', run(async () => {
    await api(`/users/${user.id}/active`, { method: 'POST', body: { active: !user.active } });
    await finish(user.active ? 'Access suspended.' : 'Access restored.');
  }));
  dialog.querySelector('[data-do=move]')?.addEventListener('change', (e) => run(async () => {
    await api(`/users/${user.id}/class`, { method: 'POST', body: { classId: e.target.value } });
    await finish('Class updated.');
  })());
  dialog.showModal();
}

export async function peoplePage(token) {
  const [{ classes }, { users }] = await Promise.all([api('/classes'), api('/users')]);
  if (token !== renderId) return;
  const admin = me.role === 'admin';
  const teachers = users.filter((u) => u.role !== 'student');
  const students = users.filter((u) => u.role === 'student');
  const created = lastCreated;
  lastCreated = null;
  const peopleTab = store.get('peopleTab') || 'students';
  const shownClass = store.get('peopleClass');
  const visible = students.filter((u) => !shownClass || String(u.classId) === shownClass);
  const manage = (u) => html`<button class="btn sm" type="button" data-manage="${u.id}">Manage</button>`;
  const tab = (key, label, iconName, count) => html`<button class="tab ${peopleTab === key ? 'active' : ''}" type="button" data-people-tab="${key}">${icon(iconName)}${label}<span class="count">${count}</span></button>`;
  const access = (u) => (u.active ? pill('Active', 'good') : pill('Suspended', 'bad'));

  const addStudents = html`
    <form class="card-body stack" id="add-students">
      <div><h3>Add students</h3><p class="small muted">Paste a class list. Logins are generated for you, ready to print.</p></div>
      <div class="form-grid">
        <label class="field">Class
          <input type="text" name="className" required maxlength="40" list="class-names" placeholder="10-A" value="${classes[0]?.name ?? ''}" />
          <datalist id="class-names">${classes.map((c) => html`<option value="${c.name}"></option>`)}</datalist>
          <small>An existing class, or a new one</small>
        </label>
        <label class="field span-2">Student names
          <small>One per line, with an optional roll number. You can paste straight from Excel.</small>
          <textarea name="students" required placeholder="1, Riya Sharma&#10;2, Arjun Mehta"></textarea>
        </label>
      </div>
      ${errorLine}
      <div><button class="btn primary" type="submit">${icon('plus')}Create logins</button></div>
    </form>`;

  const studentsTab = students.length
    ? html`
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" id="people-search" placeholder="Search students…" aria-label="Search students" /></label>
        ${classes.length > 1 && html`<select id="people-class" class="input-sm" aria-label="Show class">
          <option value="">All classes</option>
          ${classes.map((c) => html`<option value="${c.id}" ${String(c.id) === shownClass ? new Safe('selected') : ''}>${c.name}</option>`)}
        </select>`}
        <span class="spacer grow"></span>
        <button class="btn primary sm" type="button" id="show-add">${icon('plus')}Add students</button>
      </div>
      <div id="add-box" class="hidden">${addStudents}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Student</th><th>Class</th><th class="hide-sm">Username</th><th>Access</th><th class="right"></th></tr></thead>
        <tbody>${visible.map((u) => html`<tr data-person="${`${u.name} ${u.username} ${u.rollNo || ''}`.toLowerCase()}">
          <td><div class="cell-title">${avatar(u.name)}<div><b>${u.name}</b><span>${u.rollNo ? `Roll ${u.rollNo}` : 'No roll number'}</span></div></div></td>
          <td>${u.className}</td>
          <td class="hide-sm"><code>${u.username}</code></td>
          <td>${access(u)}</td>
          <td class="right">${manage(u)}</td>
        </tr>`)}</tbody>
      </table></div>`
    : addStudents;

  const teachersTab = html`
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Role</th><th class="hide-sm">Username</th><th>Access</th><th class="right"></th></tr></thead>
      <tbody>${teachers.map((u) => html`<tr>
        <td><div class="cell-title">${avatar(u.name)}<div><b>${u.name}${u.id === me.id ? ' (you)' : ''}</b></div></div></td>
        <td>${u.role === 'admin' ? pill('Admin', 'brand') : pill('Teacher', '')}</td>
        <td class="hide-sm"><code>${u.username}</code></td>
        <td>${access(u)}</td>
        <td class="right">${admin && u.id !== me.id && manage(u)}</td>
      </tr>`)}</tbody>
    </table></div>
    ${admin && html`<form class="toolbar" id="add-teacher">
      <input type="text" name="name" required maxlength="100" placeholder="New teacher’s full name" aria-label="Teacher's name" class="grow input-sm" />
      <button class="btn primary sm" type="submit">${icon('plus')}Invite teacher</button>
    </form>`}`;

  const classesTab = html`
    ${classes.length
      ? html`<div class="list">${classes.map((c) => html`<div class="list-item">
          <span class="subject-icon">${icon('class')}</span>
          <div class="main-col"><b>${c.name}</b><span>${c.students} student${c.students === 1 ? '' : 's'}</span></div>
          ${c.students === 0 && html`<button class="btn sm ghost danger" type="button" data-delete-class="${c.id}">${icon('trash')}Delete</button>`}
        </div>`)}</div>`
      : html`<div class="card-body"><p class="muted small">Classes appear here when you add students.</p></div>`}
    <form class="toolbar" id="add-class">
      <input type="text" name="name" required maxlength="40" placeholder="Class name, e.g. 9-B" aria-label="Class name" class="grow input-sm" />
      <button class="btn sm" type="submit">${icon('plus')}Add class</button>
    </form>`;

  shell('people', html`
    ${pageHeader({
      title: 'People',
      sub: 'Students, staff and classes in your workspace.',
      actions: html`<button class="btn no-print" id="copy-link" type="button">${icon('link')}Copy sign-in link</button>`,
    })}
    <div class="kpis">
      ${kpi({ label: 'Students', value: students.filter((u) => u.active).length, foot: `${students.length - students.filter((u) => u.active).length} suspended`, iconName: 'people' })}
      ${kpi({ label: 'Staff', value: teachers.length, foot: `${teachers.filter((u) => u.role === 'admin').length} admin`, iconName: 'user' })}
      ${kpi({ label: 'Classes', value: classes.length, iconName: 'class' })}
      ${kpi({ label: 'Workspace code', value: me.school.code, iconName: 'link' })}
    </div>
    <div class="stack">
      ${created && html`<section class="card"><div class="card-header"><div><h2>New login details</h2></div></div><div class="card-body">${credentialsTable(created)}</div></section>`}
      <section class="card no-print">
        <div class="tabs" role="tablist">
          ${tab('students', 'Students', 'people', students.length)}
          ${tab('teachers', 'Staff', 'user', teachers.length)}
          ${tab('classes', 'Classes', 'class', classes.length)}
        </div>
        ${{ students: studentsTab, teachers: teachersTab, classes: classesTab }[peopleTab]}
      </section>
    </div>`, 'People');

  on('[data-people-tab]', 'click', (e) => { store.set('peopleTab', e.currentTarget.dataset.peopleTab); render(); });
  on('[data-manage]', 'click', (e) => manageDialog(users.find((u) => String(u.id) === e.currentTarget.dataset.manage), classes));
  on('#print', 'click', () => window.print());
  on('#show-add', 'click', () => {
    root.querySelector('#add-box').classList.toggle('hidden');
    root.querySelector('#add-box textarea')?.focus();
  });
  on('#people-search', 'input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('[data-person]').forEach((r) => r.classList.toggle('hidden', !r.dataset.person.includes(q)));
  });
  on('#copy-link', 'click', async () => {
    const link = `${location.origin}/#/login?school=${encodeURIComponent(me.school.code)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Sign-in link copied. Share it with your school.');
    } catch {
      toast(link);
    }
  });
  on('#people-class', 'change', (e) => { store.set('peopleClass', e.target.value); render(); });
  bindForm('#add-class', async (data) => {
    await api('/classes', { method: 'POST', body: data });
    await render();
  });
  bindForm('#add-students', async (data) => {
    const { created: logins } = await api('/students/bulk', {
      method: 'POST',
      body: { className: data.className, students: parseStudents(data.students) },
    });
    lastCreated = logins;
    await render();
  });
  bindForm('#add-teacher', async (data) => {
    lastCreated = (await api('/teachers', { method: 'POST', body: data })).created;
    await render();
  });
  on('[data-delete-class]', 'click', act(async (el) => {
    await api(`/classes/${el.dataset.deleteClass}`, { method: 'DELETE' });
    return 'Class deleted.';
  }));
}
