import { useEffect, useState, type ReactNode } from 'react';
import { Form, FormError, PasswordField, Submit } from '../components/Form';
import { Icon, type IconName } from '../components/Icon';
import { Brand } from '../components/Wordmark';
import { useMe, useSession } from '../context/session';
import { api } from '../lib/api';
import { store } from '../lib/format';

const FEATURES: [IconName, string, string][] = [
  ['map', 'Mistake Map', 'See which questions, topics and kinds of mistakes cost each class marks.'],
  ['bridge', 'Peer Bridge', 'Every lost question links to a classmate’s full-marks answer, names hidden.'],
  ['target', 'Skill Map', 'Students track mastery per topic across every exam.'],
  ['camera', 'Phone hand-in', 'Snap pages, auto-compressed, location data stripped.'],
];

function AuthLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'PaperPeer · Learn from every exam';
  }, []);
  return (
    <div className="auth">
      <section className="auth-art">
        <Brand href="#/login" />
        <div>
          <h1>
            Every exam already holds the lesson. <em>We find it.</em>
          </h1>
          <p className="lead">
            PaperPeer turns marked papers into a map of what each class is missing, and connects every student to the classmate who got it right.
          </p>
          <div className="feature-list">
            {FEATURES.map(([icon, title, text]) => (
              <div className="feature" key={title}>
                <Icon name={icon} />
                <b>{title}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="trust">
          <span>
            <Icon name="shield" />
            Every school fully isolated
          </span>
          <span>
            <Icon name="lock" />
            Marks private to each student
          </span>
          <span>
            <Icon name="eye" />
            Anonymous peer sharing
          </span>
        </div>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}

export function LoginPage() {
  const { reload } = useSession();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const [school, setSchool] = useState(params.get('school') || store.get('schoolCode'));

  return (
    <AuthLayout>
      <Form
        className="auth-form"
        onSubmit={async (data) => {
          await api('/login', { method: 'POST', body: data });
          store.set('schoolCode', data.school!.trim().toLowerCase());
          await reload();
          location.hash = '#/';
        }}
      >
        <div>
          <h2>Welcome back</h2>
        </div>
        <p className="lead">Sign in to your school’s workspace.</p>
        {school ? (
          <div className="school-chip">
            <span>
              <Icon name="class" /> Workspace <b>{school}</b>
            </span>
            <button className="plain small" type="button" onClick={() => setSchool('')}>
              Change
            </button>
            <input type="hidden" name="school" value={school} />
          </div>
        ) : (
          <label className="field">
            School code
            <input type="text" name="school" required autoComplete="organization" autoCapitalize="none" placeholder="e.g. greenfield" />
            <small>Your teacher or school office can give you this</small>
          </label>
        )}
        <label className="field">
          Username
          <input type="text" name="username" required autoComplete="username" autoCapitalize="none" autoFocus />
        </label>
        <label className="field">
          Password <PasswordField name="password" autoComplete="current-password" />
        </label>
        <FormError />
        <Submit className="btn primary lg block">Sign in</Submit>
        <p className="small muted">Forgot your password? Your teacher can reset it in one click.</p>
        <div className="divider">New to PaperPeer?</div>
        <a className="btn lg block" href="#/register">
          <Icon name="plus" />
          Create a school workspace
        </a>
      </Form>
    </AuthLayout>
  );
}

const toCode = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31);

export function RegisterPage() {
  const { reload } = useSession();
  const [code, setCode] = useState('');
  const [edited, setEdited] = useState(false);

  return (
    <AuthLayout>
      <Form
        className="auth-form"
        onSubmit={async (data) => {
          await api('/schools', { method: 'POST', body: { ...data, username: 'admin' } });
          store.set('schoolCode', data.code!.trim().toLowerCase());
          await reload();
          location.hash = '#/';
        }}
      >
        <div>
          <h2>Create your workspace</h2>
        </div>
        <p className="lead">Free for your whole school. Set up in two minutes.</p>
        <label className="field">
          School name
          <input
            type="text"
            name="schoolName"
            required
            maxLength={120}
            placeholder="Greenfield Public School"
            onChange={(e) => {
              if (!edited) setCode(toCode(e.target.value));
            }}
          />
        </label>
        <label className="field">
          School code
          <input
            type="text"
            name="code"
            required
            maxLength={31}
            pattern="[a-z0-9][a-z0-9\-]{2,30}"
            title="Lowercase letters, numbers and hyphens"
            autoCapitalize="none"
            value={code}
            onChange={(e) => {
              setEdited(true);
              setCode(e.target.value);
            }}
          />
          <small>Everyone signs in with this. It can’t change later.</small>
        </label>
        <label className="field">
          Your name
          <input type="text" name="adminName" required maxLength={100} autoComplete="name" />
        </label>
        <label className="field">
          Password
          <PasswordField name="password" autoComplete="new-password" minLength={8} />
          <small>
            At least 8 characters. Your username will be <code>admin</code>.
          </small>
        </label>
        <FormError />
        <Submit className="btn primary lg block">Create workspace</Submit>
        <p className="small muted">
          Already have one? <a href="#/login">Sign in</a>
        </p>
      </Form>
    </AuthLayout>
  );
}

export function SetPasswordPage() {
  const me = useMe();
  const { reload } = useSession();
  return (
    <AuthLayout>
      <Form
        className="auth-form"
        onSubmit={async (data) => {
          await api('/password', { method: 'POST', body: data });
          await reload();
          location.hash = '#/';
        }}
      >
        <div>
          <h2>Welcome, {me.name.split(' ')[0]}</h2>
        </div>
        <p className="lead">Choose your own password to continue.</p>
        <label className="field">
          Password from your teacher <PasswordField name="currentPassword" autoComplete="current-password" />
        </label>
        <label className="field">
          New password
          <PasswordField name="newPassword" autoComplete="new-password" minLength={8} />
          <small>At least 8 characters</small>
        </label>
        <FormError />
        <Submit className="btn primary lg block">Continue</Submit>
      </Form>
    </AuthLayout>
  );
}
