import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';

type Toast = (message: string, bad?: boolean) => void;

const ToastContext = createContext<Toast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; bad: boolean; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback<Toast>((message, bad = false) => {
    setCurrent({ message, bad, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), 4000);
  }, []);

  return (
    <ToastContext value={toast}>
      {children}
      <div id="toast" role="status" aria-live="polite">
        {current && (
          <div key={current.key} className={current.bad ? 'bad' : ''}>
            {current.message}
          </div>
        )}
      </div>
    </ToastContext>
  );
}

export const useToast = () => use(ToastContext);
