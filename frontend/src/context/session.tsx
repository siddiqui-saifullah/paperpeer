import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Me } from '../lib/types';

interface Session {
  /** The logged-in user, or null. */
  me: Me | null;
  /** true until the first /me check finishes. */
  loading: boolean;
  isStaff: boolean;
  reload(): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe((await api<{ user: Me }>('/me')).user);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setMe(null);
    location.hash = '#/login';
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <SessionContext value={{ me, loading, isStaff: !!me && me.role !== 'student', reload, logout }}>
      {children}
    </SessionContext>
  );
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession needs a SessionProvider');
  return session;
}

/** The logged-in user, for pages that only render when someone is logged in. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error('No user is logged in');
  return me;
}
