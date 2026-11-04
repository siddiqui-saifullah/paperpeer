import { useState } from 'react';
import { Form, FormError, Submit } from '../components/Form';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Callout, Kpi, PageHeader, Pill } from '../components/kit';
import { Modal } from '../components/Modal';
import { Page } from '../components/Page';
import { useMe } from '../context/session';
import { useToast } from '../context/toast';
import { useAct } from '../hooks/useAct';
import { useLoad } from '../hooks/useApi';
import { api } from '../lib/api';
import { plural, store } from '../lib/format';
import type { Credentials, Person, SchoolClass } from '../lib/types';

type Tab = 'students' | 'teachers' | 'classes';

function parseStudents(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      if (parts.length === 1) return { name: parts[0]!, rollNo: '' };
      return /\d/.test(parts[0]!) ? { rollNo: parts[0]!, name: parts[1] ?? '' } : { name: parts[0]!, rollNo: parts[1] ?? '' };
    });
}

function CredentialsTable({ created }: { created: Credentials[] }) {
  const me = useMe();
  return (
    <>
      <div className="no-print">
        <Callout tone="warn" icon="alert" title="Print or save these now">
          First passwords are shown only once. Everyone sets their own password at first sign-in.
        </Callout>
      </div>
      <div className="table-wrap gap-above">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>School code</th>
              <th>Username</th>
              <th>First password</th>
            </tr>
          </thead>
          <tbody>
            {created.map((c) => (
              <tr key={c.username}>
                <td>{c.name}</td>
                <td>{me.school.code}</td>
                <td>
                  <code>{c.username}</code>
                </td>
                <td>
                  <code>{c.tempPassword}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row no-print gap-above">
        <button className="btn primary" type="button" onClick={() => window.print()}>
          <Icon name="printer" />
          Print login slips
        </button>
      </div>
    </>
  );
}

function Manage({ user, classes, onClose, onDone }: { user: Person; classes: SchoolClass[]; onClose(): void; onDone(created?: Credentials[]): Promise<void> }) {
  const toast = useToast();
  const run = (fn: () => Promise<string | Credentials[] | void>) => async () => {
    try {
      const result = await fn();
      onClose();
      if (typeof result === 'string') toast(result);
      await onDone(Array.isArray(result) ? result : undefined);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  return (
    <Modal onClose={onClose}>
      <div className="stack">
        <div className="row nowrap">
          <Avatar name={user.name} size="lg" />
          <div>
            <h2>{user.name}</h2>
            <p className="small muted">
              Username <code>{user.username}</code>
              {user.className ? ` · ${user.className}` : ''}
            </p>
          </div>
        </div>
        <button className="btn" type="button" onClick={run(async () => (await api<{ created: Credentials[] }>(`/users/${user.id}/reset-password`, { method: 'POST' })).created)}>
          <Icon name="lock" />
          Generate a new password
        </button>
        {user.role === 'student' && classes.length > 1 && (
          <label className="field">
            Move to class
            <select
              defaultValue={user.classId ?? undefined}
              onChange={(e) =>
                void run(async () => {
                  await api(`/users/${user.id}/class`, { method: 'POST', body: { classId: e.target.value } });
                  return 'Class updated.';
                })()
              }
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className={`btn ${user.active ? 'danger' : ''}`}
          type="button"
          onClick={run(async () => {
            await api(`/users/${user.id}/active`, { method: 'POST', body: { active: !user.active } });
            return user.active ? 'Access suspended.' : 'Access restored.';
          })}
        >
          {user.active ? 'Suspend access' : 'Restore access'}
        </button>
        <div className="row end">
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

const Access = ({ u }: { u: Person }) => (u.active ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Suspended</Pill>);

function PeopleView({ classes, users, reload }: { classes: SchoolClass[]; users: Person[]; reload(): Promise<void> }) {
  const me = useMe();
  const toast = useToast();
  const act = useAct(reload);
  const admin = me.role === 'admin';
  const teachers = users.filter((u) => u.role !== 'student');
  const students = users.filter((u) => u.role === 'student');
  const [tab, setTabState] = useState<Tab>((store.get('peopleTab') as Tab) || 'students');
  const [classFilter, setClassFilter] = useState(store.get('peopleClass'));
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Credentials[] | null>(null);
  const [managing, setManaging] = useState<Person | null>(null);

  const setTab = (t: Tab) => {
    store.set('peopleTab', t);
    setTabState(t);
  };
  const q = query.trim().toLowerCase();
  const visible = students.filter(
    (u) => (!classFilter || String(u.classId) === classFilter) && (!q || `${u.name} ${u.username} ${u.rollNo || ''}`.toLowerCase().includes(q)),
  );
  const done = async (logins?: Credentials[]) => {
    if (logins) setCreated(logins);
    await reload();
  };

  const tabButton = (key: Tab, label: string, icon: IconName, count: number) => (
    <button className={`tab ${tab === key ? 'active' : ''}`} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
      <Icon name={icon} />
      {label}
      <span className="count">{count}</span>
    </button>
  );

  const addStudents = (
    <Form
      className="card-body stack"
      onSubmit={async (data, form) => {
        const { created: logins } = await api<{ created: Credentials[] }>('/students/bulk', {
          method: 'POST',
          body: { className: data.className, students: parseStudents(data.students ?? '') },
        });
        form.reset();
        setAdding(false);
        await done(logins);
      }}
    >
      <div>
        <h3>Add students</h3>
        <p className="small muted">Paste a class list. Logins are generated for you, ready to print.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          Class
          <input type="text" name="className" required maxLength={40} list="class-names" placeholder="10-A" defaultValue={classes[0]?.name ?? ''} />
          <datalist id="class-names">
            {classes.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <small>An existing class, or a new one</small>
        </label>
        <label className="field span-2">
          Student names
          <small>One per line, with an optional roll number. You can paste straight from Excel.</small>
          <textarea name="students" required placeholder={'1, Riya Sharma\n2, Arjun Mehta'} autoFocus={adding} />
        </label>
      </div>
      <FormError />
      <div>
        <Submit>
          <Icon name="plus" />
          Create logins
        </Submit>
      </div>
    </Form>
  );

  return (
    <>
      <PageHeader
        title="People"
        sub="Students, staff and classes in your workspace."
        actions={
          <button
            className="btn no-print"
            type="button"
            onClick={async () => {
              const link = `${location.origin}/#/login?school=${encodeURIComponent(me.school.code)}`;
              try {
                await navigator.clipboard.writeText(link);
                toast('Sign-in link copied. Share it with your school.');
              } catch {
                toast(link);
              }
            }}
          >
            <Icon name="link" />
            Copy sign-in link
          </button>
        }
      />
      <div className="kpis">
        <Kpi label="Students" value={students.filter((u) => u.active).length} foot={`${students.filter((u) => !u.active).length} suspended`} icon="people" />
        <Kpi label="Staff" value={teachers.length} foot={`${teachers.filter((u) => u.role === 'admin').length} admin`} icon="user" />
        <Kpi label="Classes" value={classes.length} icon="class" />
        <Kpi label="Workspace code" value={me.school.code} icon="link" />
      </div>
      <div className="stack">
        {created && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2>New login details</h2>
              </div>
            </div>
            <div className="card-body">
              <CredentialsTable created={created} />
            </div>
          </section>
        )}
        <section className="card no-print">
          <div className="tabs" role="tablist">
            {tabButton('students', 'Students', 'people', students.length)}
            {tabButton('teachers', 'Staff', 'user', teachers.length)}
            {tabButton('classes', 'Classes', 'class', classes.length)}
          </div>

          {tab === 'students' &&
            (students.length ? (
              <>
                <div className="toolbar">
                  <label className="search">
                    <Icon name="search" />
                    <input type="search" placeholder="Search students…" aria-label="Search students" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </label>
                  {classes.length > 1 && (
                    <select
                      className="input-sm"
                      aria-label="Show class"
                      value={classFilter}
                      onChange={(e) => {
                        store.set('peopleClass', e.target.value);
                        setClassFilter(e.target.value);
                      }}
                    >
                      <option value="">All classes</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="spacer grow" />
                  <button className="btn primary sm" type="button" onClick={() => setAdding(!adding)}>
                    <Icon name="plus" />
                    Add students
                  </button>
                </div>
                {adding && addStudents}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th className="hide-sm">Username</th>
                        <th>Access</th>
                        <th className="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="cell-title">
                              <Avatar name={u.name} />
                              <div>
                                <b>{u.name}</b>
                                <span>{u.rollNo ? `Roll ${u.rollNo}` : 'No roll number'}</span>
                              </div>
                            </div>
                          </td>
                          <td>{u.className}</td>
                          <td className="hide-sm">
                            <code>{u.username}</code>
                          </td>
                          <td>
                            <Access u={u} />
                          </td>
                          <td className="right">
                            <button className="btn sm" type="button" onClick={() => setManaging(u)}>
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              addStudents
            ))}

          {tab === 'teachers' && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th className="hide-sm">Username</th>
                      <th>Access</th>
                      <th className="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="cell-title">
                            <Avatar name={u.name} />
                            <div>
                              <b>
                                {u.name}
                                {u.id === me.id ? ' (you)' : ''}
                              </b>
                            </div>
                          </div>
                        </td>
                        <td>{u.role === 'admin' ? <Pill tone="brand">Admin</Pill> : <Pill>Teacher</Pill>}</td>
                        <td className="hide-sm">
                          <code>{u.username}</code>
                        </td>
                        <td>
                          <Access u={u} />
                        </td>
                        <td className="right">
                          {admin && u.id !== me.id && (
                            <button className="btn sm" type="button" onClick={() => setManaging(u)}>
                              Manage
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {admin && (
                <Form
                  className="toolbar"
                  toastErrors
                  onSubmit={async (data, form) => {
                    const { created: logins } = await api<{ created: Credentials[] }>('/teachers', { method: 'POST', body: data });
                    form.reset();
                    await done(logins);
                  }}
                >
                  <input type="text" name="name" required maxLength={100} placeholder="New teacher’s full name" aria-label="Teacher's name" className="grow input-sm" />
                  <Submit className="btn primary sm">
                    <Icon name="plus" />
                    Invite teacher
                  </Submit>
                </Form>
              )}
            </>
          )}

          {tab === 'classes' && (
            <>
              {classes.length ? (
                <div className="list">
                  {classes.map((c) => (
                    <div className="list-item" key={c.id}>
                      <span className="subject-icon">
                        <Icon name="class" />
                      </span>
                      <div className="main-col">
                        <b>{c.name}</b>
                        <span>{plural(c.students ?? 0, 'student')}</span>
                      </div>
                      {c.students === 0 && (
                        <button
                          className="btn sm ghost danger"
                          type="button"
                          onClick={act(async () => {
                            await api(`/classes/${c.id}`, { method: 'DELETE' });
                            return 'Class deleted.';
                          })}
                        >
                          <Icon name="trash" />
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card-body">
                  <p className="muted small">Classes appear here when you add students.</p>
                </div>
              )}
              <Form
                className="toolbar"
                toastErrors
                onSubmit={async (data, form) => {
                  await api('/classes', { method: 'POST', body: data });
                  form.reset();
                  await reload();
                }}
              >
                <input type="text" name="name" required maxLength={40} placeholder="Class name, e.g. 9-B" aria-label="Class name" className="grow input-sm" />
                <Submit className="btn sm">
                  <Icon name="plus" />
                  Add class
                </Submit>
              </Form>
            </>
          )}
        </section>
      </div>
      {managing && <Manage user={managing} classes={classes} onClose={() => setManaging(null)} onDone={done} />}
    </>
  );
}

export function PeoplePage() {
  const load = useLoad('people', async () => {
    const [{ classes }, { users }] = await Promise.all([api<{ classes: SchoolClass[] }>('/classes'), api<{ users: Person[] }>('/users')]);
    return { classes, users };
  });
  return (
    <Page load={load} active="people" title="People">
      {(d) => <PeopleView classes={d.classes} users={d.users} reload={load.reload} />}
    </Page>
  );
}
