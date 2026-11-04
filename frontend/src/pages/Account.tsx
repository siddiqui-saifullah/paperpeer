import { Form, FormError, Submit } from '../components/Form';
import { Icon } from '../components/Icon';
import { Avatar, PageHeader } from '../components/kit';
import { Shell } from '../components/Shell';
import { useMe, useSession } from '../context/session';
import { useToast } from '../context/toast';
import { useTheme } from '../hooks/useTheme';
import { api } from '../lib/api';
import { setTheme } from '../lib/theme';

const ROLE = { admin: 'Administrator', teacher: 'Teacher', student: 'Student' } as const;

export function AccountPage() {
  const me = useMe();
  const { logout } = useSession();
  const toast = useToast();
  const theme = useTheme();

  return (
    <Shell active="account" title="Settings">
      <PageHeader title="Settings" sub="Your profile, appearance and security." />
      <div className="card">
        <section className="form-section">
          <div className="about">
            <h3>Profile</h3>
            <p>Managed by your school. Ask an admin to change your name.</p>
          </div>
          <div className="row nowrap">
            <Avatar name={me.name} size="lg" />
            <div>
              <b>{me.name}</b>
              <p className="small muted">
                @{me.username} · {ROLE[me.role]}
              </p>
              <p className="small muted">
                {me.school.name} · school code <code>{me.school.code}</code>
              </p>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="about">
            <h3>Appearance</h3>
            <p>Saved on this device.</p>
          </div>
          <div className="segmented" role="group" aria-label="Theme">
            <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <Icon name="sun" /> Light
            </button>
            <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <Icon name="moon" /> Dark
            </button>
          </div>
        </section>
        <section className="form-section">
          <div className="about">
            <h3>Password</h3>
            <p>Changing it signs you out everywhere else.</p>
          </div>
          <Form
            className="stack"
            onSubmit={async (data, form) => {
              await api('/password', { method: 'POST', body: data });
              form.reset();
              toast('Password updated.');
            }}
          >
            <label className="field">
              Current password <input type="password" name="currentPassword" required autoComplete="current-password" />
            </label>
            <label className="field">
              New password
              <small>At least 8 characters</small>
              <input type="password" name="newPassword" required minLength={8} autoComplete="new-password" />
            </label>
            <FormError />
            <div>
              <Submit>Update password</Submit>
            </div>
          </Form>
        </section>
        <section className="form-section">
          <div className="about">
            <h3>Session</h3>
            <p>Sign out of PaperPeer on this device.</p>
          </div>
          <div>
            <button className="btn danger" type="button" onClick={() => void logout()}>
              <Icon name="logout" />
              Log out
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
