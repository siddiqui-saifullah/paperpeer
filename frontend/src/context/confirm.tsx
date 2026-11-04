import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Ask {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
type Confirm = (ask: Ask) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => false);

// A styled replacement for window.confirm(), built on <dialog>.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(Ask & { resolve(ok: boolean): void }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<Confirm>((ask) => new Promise((resolve) => setPending({ ...ask, resolve })), []);

  useEffect(() => {
    if (pending) dialog.current?.showModal();
  }, [pending]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    dialog.current?.close();
    setPending(null);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      {pending && (
        <dialog ref={dialog} onCancel={() => close(false)}>
          <div className="stack">
            <p>{pending.message}</p>
            <div className="row end">
              <button className="btn" type="button" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${pending.danger ? 'solid-danger' : 'primary'}`} type="button" autoFocus onClick={() => close(true)}>
                {pending.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </ConfirmContext>
  );
}

export const useConfirm = () => use(ConfirmContext);
