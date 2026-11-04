import { useEffect, type ReactNode } from 'react';
import { useSession } from '../context/session';
import type { Loaded } from '../hooks/useApi';
import { Empty, Loading } from './kit';
import type { NavKey } from './nav';
import { Shell, type Crumb } from './Shell';

export function ErrorCard({ status, message }: { status: number; message: string }) {
  const missing = status === 404;
  return (
    <div className="card">
      <Empty
        icon={missing ? 'search' : 'alert'}
        title={missing ? 'Page not found' : 'Something went wrong'}
        text={missing ? 'This page does not exist or you do not have access to it.' : message}
        action={
          <a className="btn primary" href="#/">
            Back to home
          </a>
        }
      />
    </div>
  );
}

interface Props<T> {
  load: Loaded<T>;
  active: NavKey | '';
  /** The page title, once the data is known. */
  title: string | ((data: T) => string);
  crumbs?: Crumb[] | ((data: T) => Crumb[]);
  children(data: T): ReactNode;
}

/** A page that needs data first: shows the loading bar, then the page or an error. */
export function Page<T>({ load, active, title, crumbs, children }: Props<T>) {
  const { reload } = useSession();
  const status = load.error?.status;

  // A 401 means the session ended (logged out elsewhere, password reset): back to sign-in.
  useEffect(() => {
    if (status === 401) void reload();
  }, [status, reload]);

  if (load.error) {
    return (
      <Shell active={active} title={status === 404 ? 'Not found' : 'Error'}>
        <ErrorCard status={load.error.status} message={load.error.message} />
      </Shell>
    );
  }
  const data = load.data;
  if (data === undefined) {
    return (
      <Shell active={active} title={typeof title === 'string' ? title : ''}>
        <Loading />
      </Shell>
    );
  }
  return (
    <Shell active={active} title={typeof title === 'string' ? title : title(data)} crumbs={typeof crumbs === 'function' ? crumbs(data) : crumbs}>
      {children(data)}
    </Shell>
  );
}
