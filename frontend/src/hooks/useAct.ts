import { useCallback } from 'react';
import { useToast } from '../context/toast';

/**
 * Wraps an action: runs it, toasts its message (if it returns one), then calls
 * `after` (usually the page's reload) so the page always shows server state.
 * Errors become a toast, and the page reloads anyway.
 */
export function useAct(after: () => Promise<unknown> | void) {
  const toast = useToast();
  return useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<string | void> | string | void) =>
      async (...args: A) => {
        try {
          const message = await fn(...args);
          if (typeof message === 'string') toast(message);
        } catch (err) {
          toast((err as Error).message, true);
        }
        await after();
      },
    [after, toast],
  );
}
