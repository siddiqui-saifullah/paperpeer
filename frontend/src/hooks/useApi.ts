import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

export interface Loaded<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** Fetches again, keeping the current data on screen meanwhile. */
  reload(): Promise<void>;
}

interface State<T> {
  key: string | null;
  data?: T;
  error?: ApiError;
}

const asApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(String(err), 0));

/**
 * Runs `loader` whenever `key` changes (null skips). The key names what is being
 * loaded, so a slow answer for an old key never replaces a newer one.
 */
export function useLoad<T>(key: string | null, loader: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<State<T>>({ key: null });
  const latest = useRef(loader);
  latest.current = loader;

  useEffect(() => {
    if (key === null) return;
    let live = true;
    latest.current().then(
      (data) => live && setState({ key, data }),
      (err: unknown) => live && setState({ key, error: asApiError(err) }),
    );
    return () => {
      live = false;
    };
  }, [key]);

  const reload = useCallback(async () => {
    if (key === null) return;
    try {
      const data = await latest.current();
      setState({ key, data });
    } catch (err) {
      setState((s) => ({ ...s, error: asApiError(err) }));
    }
  }, [key]);

  const current = state.key === key;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, reload };
}

/** Loads one GET endpoint. */
export const useApi = <T,>(path: string | null) => useLoad<T>(path, () => api<T>(path!));
